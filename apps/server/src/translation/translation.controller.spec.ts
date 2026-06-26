import { Cache } from '@nestjs/cache-manager'
import { ConfigService } from '@nestjs/config'
import { Request } from 'express'
import { EnvironmentVariables } from '@/env'
import { GithubHttpService } from '@/github/http.service'
import { ProgressionService } from '@/progression/progression.service'
import { RepositoryContext } from '@/repository/repository.context'
import { RoutesService } from '@/routes/routes.service'
import { PullRequestsService } from './pull-requests.service'
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

  const makeController = () =>
    new TranslationController(
      routeService as unknown as RoutesService,
      {} as unknown as ConfigService<EnvironmentVariables>,
      githubHttpService as unknown as GithubHttpService,
      new ProgressionService(),
      repositoryContext as unknown as RepositoryContext,
      pullRequestsService as unknown as PullRequestsService,
      cacheManager as unknown as Cache
    )

  const req = { headers: { authorization: 'Bearer token' } } as unknown as Request

  beforeEach(() => {
    jest.clearAllMocks()
    pullRequestsService.forBranch.mockResolvedValue({ number: 42 })
    githubHttpService.request.mockImplementation((_url: string, opts: { operation: string }) =>
      opts.operation === 'retrieve last commit' ? Promise.resolve({ sha: 'abc123' }) : Promise.resolve({})
    )
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
})
