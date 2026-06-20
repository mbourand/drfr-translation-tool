import { ExecutionContext, INestApplication } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import request from 'supertest'
import { AppModule } from '../src/app.module'
import { GithubAuthGuard } from '../src/auth/github-auth.guard'
import { GithubHttpService } from '../src/github/http.service'
import { PrismaService } from '../src/prisma/prisma.service'
import { RepositoryContext } from '../src/repository/repository.context'
import { ReviewSignoffs } from '../src/translation/review-signoffs'

/* eslint-disable @typescript-eslint/require-await, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- test doubles legitimately use `any`-typed request/PR objects and non-awaiting async stubs */

/**
 * Single seam: the translation QA HTTP endpoints, driven over supertest against a booted Nest app.
 *
 * Behind that seam:
 *  - GithubHttpService is stubbed so a test controls "what GitHub says" (a canned PR body) and
 *    captures the edit-PR write — the assertion target is the body we'd PATCH back to GitHub.
 *  - GithubAuthGuard is overridden to read an `x-test-user-login` header, so a test acts as any user.
 *  - RepositoryContext is overridden with fixed values, so the test does not depend on a real `.env`.
 *  - PrismaService is overridden with an inert stub: these endpoints are GitHub-only, so no Postgres
 *    / testcontainers is needed (unlike the Beta QA endpoints).
 */
describe('Translations QA (e2e)', () => {
  jest.setTimeout(60_000)

  let app: INestApplication

  const PR_AUTHOR = 'author'
  const BRANCH = 'feature-x'
  const MAIN = 'main'

  // What the stubbed GitHub returns for "the PR on this branch". A test sets `prBody`/`prLabels`
  // to stage a starting state, then asserts against the body the controller writes back.
  let prBody: string
  let prLabels: { name: string }[]

  const githubStub = {
    // forBranch() lists PRs and finds the one whose head/base match.
    cachedGet: jest.fn(async () => [
      {
        number: 42,
        body: prBody,
        head: { ref: BRANCH },
        base: { ref: MAIN },
        labels: prLabels,
        user: { login: PR_AUTHOR }
      }
    ]),
    // Every mutation (edit PR, delete label) goes through request(); we capture its calls.
    request: jest.fn<Promise<unknown>, [string, { method?: string; body?: { body?: unknown } }?]>(async () => ({})),
    // Mutating endpoints drop the PR-list cache after writing; a no-op here is enough.
    invalidateCachedGet: jest.fn(async () => {}),
    // Defensive: nothing should hit the network on boot, but keep it offline if it does.
    fetch: jest.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }))
  }

  // Identity comes from the x-test-user-login header instead of a real token.
  const testGuard = {
    canActivate: (context: ExecutionContext) => {
      const req = context.switchToHttp().getRequest()
      const login = (req.headers['x-test-user-login'] as string) ?? 'unset'
      req.user = { id: login, login }
      return true
    }
  }

  const prismaStub = { $connect: async () => {}, $disconnect: async () => {} }

  beforeAll(async () => {
    process.env.ENABLE_SMEE = 'false'
    // Deliberately a different casing from the repo's real "En cours" label, to prove submit-to-review
    // removes the WIP label case-insensitively (the bug that left translations stuck in "En cours").
    process.env.TRANSLATION_WIP_LABEL_NAME = 'En Cours'

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule]
    })
      .overrideProvider(GithubHttpService)
      .useValue(githubStub)
      .overrideProvider(PrismaService)
      .useValue(prismaStub)
      .overrideProvider(RepositoryContext)
      .useValue({ owner: 'acme', name: 'deltarune-fr', mainBranch: MAIN, betaBranch: 'beta' })
      .overrideGuard(GithubAuthGuard)
      .useValue(testGuard)
      .compile()

    app = moduleFixture.createNestApplication()
    await app.init()
  })

  afterAll(async () => {
    await app?.close()
  })

  beforeEach(() => {
    githubStub.request.mockClear()
    prLabels = []
  })

  // Two corrector approvals: a translation sitting in "À tester", ready for QA.
  const twoCorrectorApprovals = () =>
    ReviewSignoffs.approve(ReviewSignoffs.approve(ReviewSignoffs.initialBody(), 'corrector1'), 'corrector2')

  const qaApprove = (login: string) =>
    request(app.getHttpServer()).post('/translation/qa-approve').set('x-test-user-login', login).send({ branch: BRANCH })

  const qaRequestChanges = (login: string) =>
    request(app.getHttpServer())
      .post('/translation/qa-request-changes')
      .set('x-test-user-login', login)
      .send({ branch: BRANCH })

  const submitToReview = () =>
    request(app.getHttpServer()).post('/translation/submit-to-review').send({ branch: BRANCH })

  // The body the controller PATCHed back to GitHub (last edit-PR request — the one carrying a body).
  const writtenBody = (): string => {
    const editCalls = githubStub.request.mock.calls.filter((call) => typeof call[1]?.body?.body === 'string')
    if (editCalls.length === 0) throw new Error('no edit-PR request was captured')
    const lastOptions = editCalls[editCalls.length - 1][1]
    return lastOptions?.body?.body as string
  }

  describe('fresh-eyes enforcement', () => {
    it('rejects the PR author with 403', async () => {
      prBody = twoCorrectorApprovals()
      await qaApprove(PR_AUTHOR).expect(403)
      expect(githubStub.request).not.toHaveBeenCalled()
    })

    it('rejects a login already in the corrector approvals with 403', async () => {
      prBody = twoCorrectorApprovals()
      await qaApprove('corrector1').expect(403)
      expect(githubStub.request).not.toHaveBeenCalled()
    })

    it('rejects a login that requested corrector changes with 403', async () => {
      prBody = ReviewSignoffs.requestChanges(twoCorrectorApprovals(), 'corrector3')
      await qaRequestChanges('corrector3').expect(403)
      expect(githubStub.request).not.toHaveBeenCalled()
    })
  })

  describe('qa-approve', () => {
    it('writes a fresh user into QA_APPROVED_BY and leaves the corrector approvals untouched', async () => {
      prBody = twoCorrectorApprovals()

      await qaApprove('qa1').expect(201)

      const body = writtenBody()
      expect(ReviewSignoffs.qaApprovals(body)).toEqual(['qa1'])
      expect(ReviewSignoffs.approvals(body)).toEqual(['corrector1', 'corrector2'])
      expect(ReviewSignoffs.qaChangeRequests(body)).toEqual([])
    })

    it('a second fresh QA approval marks the translation QA-passed (two QA approvals)', async () => {
      prBody = ReviewSignoffs.qaApprove(twoCorrectorApprovals(), 'qa1')

      await qaApprove('qa2').expect(201)

      expect(ReviewSignoffs.qaApprovals(writtenBody())).toEqual(['qa1', 'qa2'])
    })
  })

  describe('qa-request-changes', () => {
    it('writes a fresh user into QA_REQUESTED_CHANGES and leaves the corrector approvals untouched', async () => {
      prBody = twoCorrectorApprovals()

      await qaRequestChanges('qa1').expect(201)

      const body = writtenBody()
      expect(ReviewSignoffs.qaChangeRequests(body)).toEqual(['qa1'])
      expect(ReviewSignoffs.approvals(body)).toEqual(['corrector1', 'corrector2'])
      expect(ReviewSignoffs.qaApprovals(body)).toEqual([])
    })
  })

  describe('submit-to-review', () => {
    it('clears both change-request lists and leaves both approval lists intact', async () => {
      let body = twoCorrectorApprovals()
      body = ReviewSignoffs.requestChanges(body, 'corrector3') // an open corrector change-request
      body = ReviewSignoffs.qaApprove(body, 'qa1') // a QA approval to preserve
      body = ReviewSignoffs.qaRequestChanges(body, 'qa2') // an open QA change-request
      prBody = body

      await submitToReview().expect(201)

      const written = writtenBody()
      expect(ReviewSignoffs.changeRequests(written)).toEqual([])
      expect(ReviewSignoffs.qaChangeRequests(written)).toEqual([])
      expect(ReviewSignoffs.approvals(written)).toEqual(['corrector1', 'corrector2'])
      expect(ReviewSignoffs.qaApprovals(written)).toEqual(['qa1'])
    })

    it('removes the WIP label case-insensitively, deleting it by its real (PR) name', async () => {
      // Config WIP label is "En Cours" (see beforeAll); the PR carries the repo's real "En cours".
      prBody = ReviewSignoffs.initialBody()
      prLabels = [{ name: 'Traduction' }, { name: 'En cours' }]

      await submitToReview().expect(201)

      const deleteCall = githubStub.request.mock.calls.find((call) => call[1]?.method === 'DELETE')
      expect(deleteCall).toBeDefined()
      // Deleted by the label's real casing ("En cours"), not the config's ("En Cours").
      expect(decodeURIComponent(deleteCall![0])).toContain('/labels/En cours')
    })
  })
})
