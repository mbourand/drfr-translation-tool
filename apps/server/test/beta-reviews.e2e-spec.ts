import { INestApplication, ExecutionContext } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { execSync } from 'child_process'
import * as request from 'supertest'
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { AppModule } from '../src/app.module'
import { GithubHttpService } from '../src/github/http.service'
import { GithubAuthGuard } from '../src/auth/github-auth.guard'
import { PrismaService } from '../src/prisma/prisma.service'

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

  const FR = 'chapitre-1/strings_fr.txt'
  const EN = 'chapitre-1/strings_en.txt'

  it('records a mark and reflects it in the counts (count 1, markedByMe true)', async () => {
    betaFiles = { [EN]: 'Hello', [FR]: 'Bonjour' }

    await mark('42', { filePath: FR, original: 'Hello', translated: 'Bonjour' }).expect(201)

    const res = await counts('42', FR).expect(200)
    expect(res.body).toEqual([{ count: 1, markedByMe: true }])
  })

  it('counts two distinct QAs on the same line as 2', async () => {
    betaFiles = { [EN]: 'Hello', [FR]: 'Bonjour' }

    await mark('42', { filePath: FR, original: 'Hello', translated: 'Bonjour' }).expect(201)
    await mark('99', { filePath: FR, original: 'Hello', translated: 'Bonjour' }).expect(201)

    expect((await counts('42', FR).expect(200)).body).toEqual([{ count: 2, markedByMe: true }])
    // a third, non-marking QA sees the count but markedByMe false
    expect((await counts('7', FR).expect(200)).body).toEqual([{ count: 2, markedByMe: false }])
  })

  it('counts the same QA marking the same line twice as 1', async () => {
    betaFiles = { [EN]: 'Hello', [FR]: 'Bonjour' }

    await mark('42', { filePath: FR, original: 'Hello', translated: 'Bonjour' }).expect(201)
    await mark('42', { filePath: FR, original: 'Hello', translated: 'Bonjour' }).expect(201)

    expect((await counts('42', FR).expect(200)).body).toEqual([{ count: 1, markedByMe: true }])
  })

  it('drops the count and markedByMe when a QA un-marks a line', async () => {
    betaFiles = { [EN]: 'Hello', [FR]: 'Bonjour' }

    await mark('42', { filePath: FR, original: 'Hello', translated: 'Bonjour' }).expect(201)
    await unmark('42', { filePath: FR, original: 'Hello', translated: 'Bonjour' }).expect(200)

    expect((await counts('42', FR).expect(200)).body).toEqual([{ count: 0, markedByMe: false }])
  })

  it('resets a line to 0 when its translated (VF) text changes after the mark', async () => {
    betaFiles = { [EN]: 'Hello', [FR]: 'Bonjour' }
    await mark('42', { filePath: FR, original: 'Hello', translated: 'Bonjour' }).expect(201)

    // The QA lead updates beta: this line's VF changed, so its identity changed.
    betaFiles = { [EN]: 'Hello', [FR]: 'Salut' }

    expect((await counts('42', FR).expect(200)).body).toEqual([{ count: 0, markedByMe: false }])
  })

  it('keeps two lines with identical VF but different VO independent', async () => {
    betaFiles = { [EN]: 'Hello\nHi', [FR]: 'Bonjour\nBonjour' }

    // Mark only the first line (VO 'Hello').
    await mark('42', { filePath: FR, original: 'Hello', translated: 'Bonjour' }).expect(201)

    // The second line shares the VF 'Bonjour' but has VO 'Hi' — it must NOT be credited.
    expect((await counts('42', FR).expect(200)).body).toEqual([
      { count: 1, markedByMe: true },
      { count: 0, markedByMe: false }
    ])
  })

  it('keeps the same (VO, VF) under a different filePath independent', async () => {
    const FR2 = 'chapitre-2/strings_fr.txt'
    const EN2 = 'chapitre-2/strings_en.txt'
    betaFiles = { [EN]: 'Hello', [FR]: 'Bonjour', [EN2]: 'Hello', [FR2]: 'Bonjour' }

    await mark('42', { filePath: FR, original: 'Hello', translated: 'Bonjour' }).expect(201)

    // Same text, different file — verifying it in chapitre-1 does not credit chapitre-2.
    expect((await counts('42', FR2).expect(200)).body).toEqual([{ count: 0, markedByMe: false }])
  })

  it('treats a whitespace-only VF difference as a different line', async () => {
    betaFiles = { [EN]: 'Hello', [FR]: 'Bonjour' }
    await mark('42', { filePath: FR, original: 'Hello', translated: 'Bonjour' }).expect(201)

    // A stray trailing space in the VF must reset the count (could overflow a dialog box in-game).
    betaFiles = { [EN]: 'Hello', [FR]: 'Bonjour ' }

    expect((await counts('42', FR).expect(200)).body).toEqual([{ count: 0, markedByMe: false }])
  })

  it('returns stable counts when the same unchanged file is read twice', async () => {
    betaFiles = { [EN]: 'Hello', [FR]: 'Bonjour' }
    await mark('42', { filePath: FR, original: 'Hello', translated: 'Bonjour' }).expect(201)

    const first = (await counts('42', FR).expect(200)).body
    const second = (await counts('42', FR).expect(200)).body
    expect(first).toEqual([{ count: 1, markedByMe: true }])
    expect(second).toEqual(first)
  })
})
