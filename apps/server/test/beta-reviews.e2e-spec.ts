import { INestApplication, ExecutionContext } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { execSync } from 'child_process'
import * as request from 'supertest'
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { AppModule } from '../src/app.module'
import { GithubHttpService } from '../src/github/http.service'
import { GithubAuthGuard } from '../src/auth/github-auth.guard'
import { PrismaService } from '../src/prisma/prisma.service'
import { HashCount } from '../src/beta-reviews/beta-reviews.service'

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
  let currentUserId = 'unset'
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

  const mark = (userId: string, body: { filePath: string; original: string; translated: string }) =>
    request(app.getHttpServer()).post('/beta-reviews/marks').set('x-test-user-id', userId).send(body)

  const counts = (userId: string, filePath: string) =>
    request(app.getHttpServer())
      .get('/beta-reviews/counts')
      .set('x-test-user-id', userId)
      .query({ filePath })

  const unmark = (userId: string, body: { filePath: string; original: string; translated: string }) =>
    request(app.getHttpServer()).delete('/beta-reviews/marks').set('x-test-user-id', userId).send(body)

  const countsBody = async (userId: string, filePath: string): Promise<HashCount[]> =>
    (await counts(userId, filePath).expect(200)).body as HashCount[]

  const FR = 'chapitre-1/strings_fr.txt'

  // The read path returns one entry per (filePath, contentHash) that HAS marks. A line with no
  // mark is simply absent — the client maps these onto its lines and reads a miss as count 0. So
  // read-side behaviours that depend on the file's content (e.g. "VF change resets to 0") now live
  // on the client; here we cover counting, the unique constraint, scoping, and recipe distinctness.

  it('records a mark and reflects it in the counts (count 1, markedByMe true)', async () => {
    await mark('42', { filePath: FR, original: 'Hello', translated: 'Bonjour' }).expect(201)

    const body = await countsBody('42', FR)
    expect(body).toHaveLength(1)
    expect(body[0]).toMatchObject({ count: 1, markedByMe: true })
  })

  it('counts two distinct QAs on the same line as 2', async () => {
    await mark('42', { filePath: FR, original: 'Hello', translated: 'Bonjour' }).expect(201)
    await mark('99', { filePath: FR, original: 'Hello', translated: 'Bonjour' }).expect(201)

    expect(await countsBody('42', FR)).toEqual([expect.objectContaining({ count: 2, markedByMe: true })])
    // a third, non-marking QA sees the count but markedByMe false
    expect(await countsBody('7', FR)).toEqual([expect.objectContaining({ count: 2, markedByMe: false })])
  })

  it('counts the same QA marking the same line twice as 1', async () => {
    await mark('42', { filePath: FR, original: 'Hello', translated: 'Bonjour' }).expect(201)
    await mark('42', { filePath: FR, original: 'Hello', translated: 'Bonjour' }).expect(201)

    expect(await countsBody('42', FR)).toEqual([expect.objectContaining({ count: 1, markedByMe: true })])
  })

  it('drops the line entirely when a QA un-marks it (absent = unreviewed)', async () => {
    await mark('42', { filePath: FR, original: 'Hello', translated: 'Bonjour' }).expect(201)
    await unmark('42', { filePath: FR, original: 'Hello', translated: 'Bonjour' }).expect(200)

    // No row left, so the line doesn't appear — the client reads a miss as { count: 0 }.
    expect(await countsBody('42', FR)).toEqual([])
  })

  it('gives two lines with identical VF but different VO independent hashes', async () => {
    // Same VF 'Bonjour', different VO — the recipe must keep them distinct so verifying one never
    // credits the other.
    await mark('42', { filePath: FR, original: 'Hello', translated: 'Bonjour' }).expect(201)
    await mark('42', { filePath: FR, original: 'Hi', translated: 'Bonjour' }).expect(201)

    const body = await countsBody('42', FR)
    expect(body).toHaveLength(2)
    expect(new Set(body.map((b) => b.contentHash)).size).toBe(2)
    expect(body.map((b) => b.count)).toEqual([1, 1])
  })

  it('keeps the same (VO, VF) under a different filePath independent', async () => {
    const FR2 = 'chapitre-2/strings_fr.txt'
    await mark('42', { filePath: FR, original: 'Hello', translated: 'Bonjour' }).expect(201)

    // Same text, different file — verifying it in chapitre-1 does not credit chapitre-2.
    expect(await countsBody('42', FR2)).toEqual([])
  })

  it('gives a whitespace-only VF difference a different hash', async () => {
    // A stray trailing space must hash differently (it could overflow a dialog box in-game), so a
    // mark on 'Bonjour' never credits 'Bonjour '.
    await mark('42', { filePath: FR, original: 'Hello', translated: 'Bonjour' }).expect(201)
    await mark('42', { filePath: FR, original: 'Hello', translated: 'Bonjour ' }).expect(201)

    const body = await countsBody('42', FR)
    expect(body).toHaveLength(2)
    expect(new Set(body.map((b) => b.contentHash)).size).toBe(2)
  })

  it('returns stable counts when the same file is read twice', async () => {
    await mark('42', { filePath: FR, original: 'Hello', translated: 'Bonjour' }).expect(201)

    const first = await countsBody('42', FR)
    const second = await countsBody('42', FR)
    expect(first).toEqual([expect.objectContaining({ count: 1, markedByMe: true })])
    expect(second).toEqual(first)
  })

  it('never fetches the beta file on the read path (work stays off the VPS)', async () => {
    // The point of the redesign: counting is one indexed query, not a file download + per-line
    // hashing. So reading counts must not touch GitHub at all, no matter how large the file is.
    await mark('42', { filePath: FR, original: 'Hello', translated: 'Bonjour' }).expect(201)
    githubStub.getRawFile.mockClear()

    await counts('42', FR).expect(200)

    expect(githubStub.getRawFile).not.toHaveBeenCalled()
  })
})
