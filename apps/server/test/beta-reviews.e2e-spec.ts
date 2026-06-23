import { INestApplication, ExecutionContext } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { execSync } from 'child_process'
import request from 'supertest'
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { AppModule } from '../src/app.module'
import { GithubHttpService } from '../src/github/http.service'
import { GithubAuthGuard } from '../src/auth/github-auth.guard'
import { PrismaService } from '../src/prisma/prisma.service'
import { HashVerdictCounts } from '../src/beta-reviews/beta-reviews.service'

/* eslint-disable @typescript-eslint/require-await, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument -- test doubles legitimately use `any`-typed request objects and non-awaiting async stubs */

/**
 * Single seam: the beta-reviews HTTP endpoints, driven over supertest against a booted Nest app.
 *
 * Behind that seam:
 *  - GithubHttpService is stubbed so a test controls "what beta says" (canned file content).
 *  - GithubAuthGuard is overridden to read an `x-test-user-id` header, so a test acts as any QA.
 *  - Prisma runs against a real throwaway Postgres (testcontainers) — distinct-count and the
 *    unique constraint must not be faked.
 */
describe('BetaReviews (e2e)', () => {
  jest.setTimeout(120_000)

  let app: INestApplication
  let container: StartedPostgreSqlContainer
  let prisma: PrismaService

  // A stub for GithubHttpService.getRawFile. Each test sets `betaFiles` to map a repo file
  // path (e.g. 'chapitre-1/strings_en.txt') to its content on the beta branch.
  let betaFiles: Record<string, string>
  const githubStub = {
    getRawFile: jest.fn(async (url: string) => {
      const path = Object.keys(betaFiles).find((p) => url.includes(p))
      if (path === undefined) throw new Error(`No canned beta content for url ${url}`)
      return betaFiles[path]
    }),
    // Unrelated to Beta QA: TranslationController.onModuleInit fetches files to compute progression
    // on boot. Return a benign empty `data:` URL so app startup stays offline and hermetic.
    fetch: jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ download_url: 'data:,' }) }))
  }

  // Overridden guard: identity comes from the x-test-user-id header instead of a real token.
  const currentUserId = 'unset'
  const testGuard = {
    canActivate: (context: ExecutionContext) => {
      const req = context.switchToHttp().getRequest()
      req.user = { id: (req.headers['x-test-user-id'] as string) ?? currentUserId }
      return true
    }
  }

  beforeAll(async () => {
    // Don't spawn the smee webhook-forwarding child process during tests — it never exits and
    // would keep the process (and jest) alive at teardown. Set before AppModule compiles.
    process.env.ENABLE_SMEE = 'false'

    container = await new PostgreSqlContainer('postgres:17').start()
    process.env.DATABASE_URL = container.getConnectionUri()
    process.env.REPOSITORY_BETA_BRANCH = 'beta'
    execSync('npx prisma db push --skip-generate', {
      env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL },
      stdio: 'inherit'
    })

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule]
    })
      .overrideProvider(GithubHttpService)
      .useValue(githubStub)
      .overrideGuard(GithubAuthGuard)
      .useValue(testGuard)
      .compile()

    app = moduleFixture.createNestApplication()
    prisma = app.get(PrismaService)
    await app.init()
  })

  afterAll(async () => {
    await app?.close()
    await container?.stop()
  })

  beforeEach(async () => {
    await prisma.betaReviewMark.deleteMany()
    betaFiles = {}
    githubStub.getRawFile.mockClear()
  })

  type Line = { filePath: string; original: string; translated: string }
  type Verdict = 'OK' | 'KO'

  // Set/replace the caller's verdict on a line.
  const setVerdict = (userId: string, body: Line & { verdict: Verdict }) =>
    request(app.getHttpServer()).post('/beta-reviews/marks').set('x-test-user-id', userId).send(body)

  const counts = (userId: string, filePath: string) =>
    request(app.getHttpServer()).get('/beta-reviews/counts').set('x-test-user-id', userId).query({ filePath })

  // Clear only the caller's own verdict (misclick recovery).
  const clearMine = (userId: string, body: Line) =>
    request(app.getHttpServer()).delete('/beta-reviews/marks').set('x-test-user-id', userId).send(body)

  // Line-level KO clear: removes every QA's KO on the line (any caller).
  const clearKo = (userId: string, body: Line) =>
    request(app.getHttpServer()).delete('/beta-reviews/marks/ko').set('x-test-user-id', userId).send(body)

  const countsBody = async (userId: string, filePath: string): Promise<HashVerdictCounts[]> =>
    (await counts(userId, filePath).expect(200)).body as HashVerdictCounts[]

  const FR = 'chapitre-1/strings_fr.txt'
  const LINE: Line = { filePath: FR, original: 'Hello', translated: 'Bonjour' }

  // The read path returns one entry per (filePath, contentHash) that HAS verdicts. A line with no
  // verdict is simply absent — the client maps these onto its lines and reads a miss as non relu. So
  // read-side behaviours that depend on the file's content (e.g. "VF change resets to non relu") now
  // live on the client; here we cover counting, the unique constraint, scoping, and recipe distinctness.

  it('records an OK verdict and reflects it in the counts (okCount 1, myVerdict OK)', async () => {
    await setVerdict('42', { ...LINE, verdict: 'OK' }).expect(201)

    const body = await countsBody('42', FR)
    expect(body).toHaveLength(1)
    expect(body[0]).toMatchObject({ okCount: 1, koCount: 0, myVerdict: 'OK' })
  })

  it('records a KO verdict and reflects it in the counts (koCount 1, myVerdict KO)', async () => {
    await setVerdict('42', { ...LINE, verdict: 'KO' }).expect(201)

    const body = await countsBody('42', FR)
    expect(body).toHaveLength(1)
    expect(body[0]).toMatchObject({ okCount: 0, koCount: 1, myVerdict: 'KO' })
  })

  it('flips OK -> KO -> OK by overwriting in place, never a second row', async () => {
    await setVerdict('42', { ...LINE, verdict: 'OK' }).expect(201)
    await setVerdict('42', { ...LINE, verdict: 'KO' }).expect(201)

    let body = await countsBody('42', FR)
    expect(body).toHaveLength(1)
    expect(body[0]).toMatchObject({ okCount: 0, koCount: 1, myVerdict: 'KO' })

    await setVerdict('42', { ...LINE, verdict: 'OK' }).expect(201)
    body = await countsBody('42', FR)
    expect(body).toHaveLength(1)
    expect(body[0]).toMatchObject({ okCount: 1, koCount: 0, myVerdict: 'OK' })

    // One QA, one line — exactly one row survives every flip (unique constraint).
    expect(await prisma.betaReviewMark.count()).toBe(1)
  })

  it('tallies OK and KO from distinct QAs independently on the same line', async () => {
    await setVerdict('42', { ...LINE, verdict: 'OK' }).expect(201)
    await setVerdict('99', { ...LINE, verdict: 'OK' }).expect(201)
    await setVerdict('7', { ...LINE, verdict: 'KO' }).expect(201)

    expect(await countsBody('42', FR)).toEqual([
      expect.objectContaining({ okCount: 2, koCount: 1, myVerdict: 'OK' })
    ])
    // The KO author sees the same tallies but their own verdict is KO.
    expect(await countsBody('7', FR)).toEqual([
      expect.objectContaining({ okCount: 2, koCount: 1, myVerdict: 'KO' })
    ])
    // A QA who never marked the line sees the tallies with myVerdict null.
    expect(await countsBody('123', FR)).toEqual([
      expect.objectContaining({ okCount: 2, koCount: 1, myVerdict: null })
    ])
  })

  it('counts the same QA setting the same verdict twice as 1', async () => {
    await setVerdict('42', { ...LINE, verdict: 'OK' }).expect(201)
    await setVerdict('42', { ...LINE, verdict: 'OK' }).expect(201)

    expect(await countsBody('42', FR)).toEqual([
      expect.objectContaining({ okCount: 1, koCount: 0, myVerdict: 'OK' })
    ])
  })

  it('DELETE /marks clears only the caller verdict, leaving other QAs intact', async () => {
    await setVerdict('42', { ...LINE, verdict: 'OK' }).expect(201)
    await setVerdict('99', { ...LINE, verdict: 'KO' }).expect(201)

    await clearMine('42', LINE).expect(200)

    // 42's verdict is gone; 99's KO remains.
    expect(await countsBody('42', FR)).toEqual([
      expect.objectContaining({ okCount: 0, koCount: 1, myVerdict: null })
    ])
    expect(await countsBody('99', FR)).toEqual([
      expect.objectContaining({ okCount: 0, koCount: 1, myVerdict: 'KO' })
    ])
  })

  it('drops the line entirely when its last verdict is cleared (absent = non relu)', async () => {
    await setVerdict('42', { ...LINE, verdict: 'OK' }).expect(201)
    await clearMine('42', LINE).expect(200)

    expect(await countsBody('42', FR)).toEqual([])
  })

  it('DELETE /marks/ko removes every QA KO on the line, even by a caller who never marked it', async () => {
    await setVerdict('42', { ...LINE, verdict: 'KO' }).expect(201)
    await setVerdict('99', { ...LINE, verdict: 'KO' }).expect(201)
    await setVerdict('7', { ...LINE, verdict: 'OK' }).expect(201)

    // Caller '123' never marked the line — they may still clear its KO (no authorship check).
    await clearKo('123', LINE).expect(200)

    // Both KOs gone; the OK verdict survives.
    expect(await countsBody('123', FR)).toEqual([
      expect.objectContaining({ okCount: 1, koCount: 0, myVerdict: null })
    ])
    // The former KO authors now have no verdict on the line.
    expect(await countsBody('42', FR)).toEqual([
      expect.objectContaining({ okCount: 1, koCount: 0, myVerdict: null })
    ])
  })

  it('DELETE /marks/ko on one line does not touch another line or file', async () => {
    const FR2 = 'chapitre-2/strings_fr.txt'
    const OTHER: Line = { filePath: FR, original: 'Bye', translated: 'Au revoir' }
    await setVerdict('42', { ...LINE, verdict: 'KO' }).expect(201)
    await setVerdict('42', { ...OTHER, verdict: 'KO' }).expect(201)
    await setVerdict('42', { ...LINE, filePath: FR2, verdict: 'KO' }).expect(201)

    await clearKo('42', LINE).expect(200)

    // The cleared line is gone, but the other line in the same file and the same line in FR2 remain.
    const fr = await countsBody('42', FR)
    expect(fr).toHaveLength(1)
    expect(fr[0]).toMatchObject({ koCount: 1, myVerdict: 'KO' })
    expect(await countsBody('42', FR2)).toEqual([
      expect.objectContaining({ koCount: 1, myVerdict: 'KO' })
    ])
  })

  it('gives two lines with identical VF but different VO independent hashes', async () => {
    // Same VF 'Bonjour', different VO — the recipe must keep them distinct so a verdict on one never
    // credits the other.
    await setVerdict('42', { filePath: FR, original: 'Hello', translated: 'Bonjour', verdict: 'OK' }).expect(201)
    await setVerdict('42', { filePath: FR, original: 'Hi', translated: 'Bonjour', verdict: 'OK' }).expect(201)

    const body = await countsBody('42', FR)
    expect(body).toHaveLength(2)
    expect(new Set(body.map((b) => b.contentHash)).size).toBe(2)
    expect(body.map((b) => b.okCount)).toEqual([1, 1])
  })

  it('keeps the same (VO, VF) under a different filePath independent', async () => {
    const FR2 = 'chapitre-2/strings_fr.txt'
    await setVerdict('42', { ...LINE, verdict: 'OK' }).expect(201)

    // Same text, different file — a verdict in chapitre-1 does not credit chapitre-2.
    expect(await countsBody('42', FR2)).toEqual([])
  })

  it('gives a whitespace-only VF difference a different hash', async () => {
    // A stray trailing space must hash differently (it could overflow a dialog box in-game), so a
    // verdict on 'Bonjour' never credits 'Bonjour '.
    await setVerdict('42', { filePath: FR, original: 'Hello', translated: 'Bonjour', verdict: 'OK' }).expect(201)
    await setVerdict('42', { filePath: FR, original: 'Hello', translated: 'Bonjour ', verdict: 'OK' }).expect(201)

    const body = await countsBody('42', FR)
    expect(body).toHaveLength(2)
    expect(new Set(body.map((b) => b.contentHash)).size).toBe(2)
  })

  it('returns stable counts when the same file is read twice', async () => {
    await setVerdict('42', { ...LINE, verdict: 'OK' }).expect(201)

    const first = await countsBody('42', FR)
    const second = await countsBody('42', FR)
    expect(first).toEqual([expect.objectContaining({ okCount: 1, myVerdict: 'OK' })])
    expect(second).toEqual(first)
  })

  it('never fetches the beta file on the read path (work stays off the VPS)', async () => {
    // The point of the redesign: counting is one indexed query, not a file download + per-line
    // hashing. So reading counts must not touch GitHub at all, no matter how large the file is.
    await setVerdict('42', { ...LINE, verdict: 'OK' }).expect(201)
    githubStub.getRawFile.mockClear()

    await counts('42', FR).expect(200)

    expect(githubStub.getRawFile).not.toHaveBeenCalled()
  })
})
