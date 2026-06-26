import { ConfigService } from '@nestjs/config'
import { EnvironmentVariables } from '@/env'
import { GithubHttpService } from '@/github/http.service'
import { RepositoryContext } from '@/repository/repository.context'
import { RoutesService } from '@/routes/routes.service'
import { ScreenshotsPruneService } from './screenshots-prune.service'
import { ScreenshotsService } from './screenshots.service'

describe('ScreenshotsPruneService.pruneClosedPrScreenshots', () => {
  const fetch = jest.fn()
  const listPrDirs = jest.fn()
  const deletePrDir = jest.fn()

  const githubHttpService = { fetch } as unknown as GithubHttpService
  const screenshotsService = { listPrDirs, deletePrDir } as unknown as ScreenshotsService
  const configService = {
    getOrThrow: () => 'service-token'
  } as unknown as ConfigService<EnvironmentVariables>
  const routesService = {
    GITHUB_ROUTES: { LIST_PULL_REQUESTS: () => 'https://api/repos/acme/repo/pulls' }
  } as unknown as RoutesService
  const repositoryContext = { owner: 'acme', name: 'repo' } as unknown as RepositoryContext

  const makeService = () =>
    new ScreenshotsPruneService(configService, githubHttpService, routesService, repositoryContext, screenshotsService)

  // A single page of open PRs (no `Link` header → pagination stops after one request).
  const openPrsResponse = (numbers: number[]) => ({
    ok: true,
    json: () => Promise.resolve(numbers.map((number) => ({ number }))),
    headers: { get: () => null }
  })

  beforeEach(() => jest.clearAllMocks())

  it('deletes directories for non-open PRs and keeps directories for open ones', async () => {
    fetch.mockResolvedValue(openPrsResponse([1, 2]))
    listPrDirs.mockResolvedValue(['pr-1', 'pr-2', 'pr-3', 'pr-9'])

    await makeService().pruneClosedPrScreenshots()

    expect(deletePrDir).toHaveBeenCalledTimes(2)
    expect(deletePrDir).toHaveBeenCalledWith('pr-3')
    expect(deletePrDir).toHaveBeenCalledWith('pr-9')
    expect(deletePrDir).not.toHaveBeenCalledWith('pr-1')
    expect(deletePrDir).not.toHaveBeenCalledWith('pr-2')
  })

  it('authenticates the open-PR listing with the GITHUB_API_ACCESS_TOKEN service token', async () => {
    fetch.mockResolvedValue(openPrsResponse([1]))
    listPrDirs.mockResolvedValue([])

    await makeService().pruneClosedPrScreenshots()

    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('state=open'), { authorization: 'Bearer service-token' })
  })

  it('follows pagination across pages, keeping every open PR (no over-fetch past the last page)', async () => {
    // Page 1 carries a `next` relation; page 2 is the last page (only `prev`), so the loop stops after it.
    fetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([{ number: 1 }, { number: 2 }]),
        headers: { get: () => '<...page=2>; rel="next", <...>; rel="last"' }
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([{ number: 3 }]),
        headers: { get: () => '<...page=1>; rel="prev", <...>; rel="first"' }
      })
    listPrDirs.mockResolvedValue(['pr-1', 'pr-2', 'pr-3', 'pr-4'])

    await makeService().pruneClosedPrScreenshots()

    expect(fetch).toHaveBeenCalledTimes(2)
    expect(deletePrDir).toHaveBeenCalledTimes(1)
    expect(deletePrDir).toHaveBeenCalledWith('pr-4')
  })

  it('deletes nothing when listing open PRs fails (abort on transient GitHub failure)', async () => {
    fetch.mockResolvedValue({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
      text: () => Promise.resolve('down')
    })
    listPrDirs.mockResolvedValue(['pr-1', 'pr-2'])

    await makeService().pruneClosedPrScreenshots()

    expect(deletePrDir).not.toHaveBeenCalled()
  })

  it('deletes nothing when the GitHub request throws', async () => {
    fetch.mockRejectedValue(new Error('network down'))
    listPrDirs.mockResolvedValue(['pr-1'])

    await makeService().pruneClosedPrScreenshots()

    expect(deletePrDir).not.toHaveBeenCalled()
  })
})
