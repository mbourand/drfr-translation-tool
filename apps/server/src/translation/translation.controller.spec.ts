import { Cache } from '@nestjs/cache-manager'
import { ConfigService } from '@nestjs/config'
import { Request } from 'express'
import { readFile, readdir, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import sharp from 'sharp'
import { EnvironmentVariables } from '@/env'
import { GithubHttpService } from '@/github/http.service'
import { ProgressionService } from '@/progression/progression.service'
import { RepositoryContext } from '@/repository/repository.context'
import { RoutesService } from '@/routes/routes.service'
import { PullRequestsService } from './pull-requests.service'
import { ScreenshotsService } from './screenshots.service'
import { TranslationController } from './translation.controller'

describe('TranslationController', () => {
  const progressionService = new ProgressionService()
  const controller = new TranslationController(
    {} as unknown as RoutesService,
    {} as unknown as ConfigService<EnvironmentVariables>,
    {} as unknown as GithubHttpService,
    progressionService,
    {} as unknown as RepositoryContext,
    {} as unknown as PullRequestsService,
    {} as unknown as ScreenshotsService,
    {} as unknown as Cache
  )

  it('is defined', () => {
    expect(controller).toBeDefined()
  })

  it('serves progression straight from the ProgressionService (no boot/network side effects)', () => {
    expect(controller.getProgression()).toEqual(progressionService.getProgression())
  })
})

describe('TranslationController.postComment (multipart form fields)', () => {
  const githubHttpService = { request: jest.fn() }
  const pullRequestsService = { forBranch: jest.fn() }
  const cacheManager = { del: jest.fn() }
  const routeService = {
    GITHUB_ROUTES: {
      COMMITS: jest.fn(() => 'commits-url'),
      ADD_COMMENT: jest.fn(() => 'add-comment-url'),
      REVIEW_PULL_REQUEST: jest.fn(() => 'review-url')
    }
  }
  const repositoryContext = { owner: 'owner', name: 'repo', mainBranch: 'main' }

  // Real `sharp` + a real temp `SCREENSHOTS_DIR` so the screenshot assertions cover genuine output (valid
  // WebP, real downscale) rather than a stubbed processor. Only GitHub and PR resolution are mocked.
  const screenshotsDir = join(tmpdir(), 'drfr-screenshots-spec')
  const screenshotsBaseUrl = 'https://back.example.com/'
  const configService = {
    getOrThrow: (key: string) => (key === 'SCREENSHOTS_DIR' ? screenshotsDir : screenshotsBaseUrl)
  }
  const screenshotsService = new ScreenshotsService(configService as unknown as ConfigService<EnvironmentVariables>)

  const makeController = () =>
    new TranslationController(
      routeService as unknown as RoutesService,
      {} as unknown as ConfigService<EnvironmentVariables>,
      githubHttpService as unknown as GithubHttpService,
      new ProgressionService(),
      repositoryContext as unknown as RepositoryContext,
      pullRequestsService as unknown as PullRequestsService,
      screenshotsService,
      cacheManager as unknown as Cache
    )

  const req = { headers: { authorization: 'Bearer token' } } as unknown as Request

  /** A real, decodable image whose long edge exceeds the 1600px bound, so the downscale is observable. */
  const makeOversizeImage = () =>
    sharp({ create: { width: 2000, height: 500, channels: 3, background: { r: 10, g: 120, b: 200 } } })
      .png()
      .toBuffer()

  // The JSON body handed to GitHub for the call to `url` — shape differs per path (review vs reply).
  const postedBodyFor = (url: string): any =>
    githubHttpService.request.mock.calls.find(([calledUrl]) => calledUrl === url)?.[1].body

  beforeEach(async () => {
    jest.clearAllMocks()
    await rm(screenshotsDir, { recursive: true, force: true })
    pullRequestsService.forBranch.mockResolvedValue({ number: 42 })
    githubHttpService.request.mockImplementation((_url: string, opts: { operation: string }) =>
      opts.operation === 'retrieve last commit' ? Promise.resolve({ sha: 'abc123' }) : Promise.resolve({})
    )
  })

  afterAll(async () => {
    await rm(screenshotsDir, { recursive: true, force: true })
  })

  // Multipart form fields always arrive as strings, so the controller is driven with string `line`/`inReplyTo`
  // exactly as Multer delivers them; the assertions pin the numeric coercion the GitHub payload depends on.
  it('posts a new line comment through the review path and invalidates the comments cache', async () => {
    await makeController().postComment(req, {
      branch: 'feat/x',
      body: 'Cette ligne déborde',
      line: '5',
      filePath: 'data/x.json'
    })

    expect(githubHttpService.request).toHaveBeenCalledWith(
      'review-url',
      expect.objectContaining({
        method: 'POST',
        body: expect.objectContaining({
          event: 'COMMENT',
          body: '',
          commit_id: 'abc123',
          comments: [{ path: 'data/x.json', body: 'Cette ligne déborde', line: 5, side: 'RIGHT' }]
        })
      })
    )
    expect(cacheManager.del).toHaveBeenCalled()
  })

  it('posts a reply through the in_reply_to path with numeric line and reply id', async () => {
    await makeController().postComment(req, {
      branch: 'feat/x',
      body: 'Je suis d’accord',
      line: '5',
      filePath: 'data/x.json',
      inReplyTo: '99'
    })

    expect(githubHttpService.request).toHaveBeenCalledWith(
      'add-comment-url',
      expect.objectContaining({
        method: 'POST',
        body: expect.objectContaining({
          body: 'Je suis d’accord',
          commit_id: 'abc123',
          path: 'data/x.json',
          side: 'RIGHT',
          line: 5,
          subject_type: 'line',
          in_reply_to: 99
        })
      })
    )
    expect(cacheManager.del).toHaveBeenCalled()
  })

  it('stores an attached image as a downscaled WebP under pr-<n>/ and appends its Markdown URL to the body', async () => {
    const buffer = await makeOversizeImage()

    await makeController().postComment(
      req,
      { branch: 'feat/x', body: 'Cette ligne déborde', line: '5', filePath: 'data/x.json' },
      [{ buffer }]
    )

    const body = postedBodyFor('review-url').comments[0].body
    // Original text is preserved verbatim, with one Markdown image appended at the end pointing at our domain.
    expect(body).toMatch(
      /^Cette ligne déborde\n\n!\[\]\(https:\/\/back\.example\.com\/screenshots\/pr-42\/[0-9a-f-]+\.webp\)$/
    )

    const storedUrl = body.match(/\(([^)]+)\)/)![1]
    const storedFile = await readFile(join(screenshotsDir, 'pr-42', storedUrl.split('/').pop()!))
    const meta = await sharp(storedFile).metadata()
    expect(meta.format).toBe('webp')
    expect(meta.width).toBe(1600) // 2000px long edge downscaled to the bound
    expect(meta.height).toBe(400)
  })

  it('carries a screenshot through the reply path with the body assembled identically', async () => {
    const buffer = await makeOversizeImage()

    await makeController().postComment(
      req,
      { branch: 'feat/x', body: 'Voir capture', line: '5', filePath: 'data/x.json', inReplyTo: '99' },
      [{ buffer }]
    )

    const body = postedBodyFor('add-comment-url').body
    expect(body).toMatch(
      /^Voir capture\n\n!\[\]\(https:\/\/back\.example\.com\/screenshots\/pr-42\/[0-9a-f-]+\.webp\)$/
    )
  })

  it('rejects a non-image part without posting a comment', async () => {
    await expect(
      makeController().postComment(
        req,
        { branch: 'feat/x', body: 'Cette ligne déborde', line: '5', filePath: 'data/x.json' },
        [{ buffer: Buffer.from('this is definitely not an image') }]
      )
    ).rejects.toThrow()

    const postCalls = githubHttpService.request.mock.calls.filter(
      ([, opts]) => (opts as { operation: string }).operation === 'post comment'
    )
    expect(postCalls).toHaveLength(0)
  })

  it('writes nothing for a text-only comment (zero file parts)', async () => {
    await makeController().postComment(req, {
      branch: 'feat/x',
      body: 'Pas de capture',
      line: '7',
      filePath: 'data/y.json'
    })

    // No pr-42 directory is created when there are no attachments.
    const entries = await readdir(screenshotsDir).catch(() => [] as string[])
    expect(entries).not.toContain('pr-42')
    expect(postedBodyFor('review-url').comments[0].body).toBe('Pas de capture')
  })
})
