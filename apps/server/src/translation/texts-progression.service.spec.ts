import { ConfigService } from '@nestjs/config'
import { EnvironmentVariables } from '@/env'
import { GithubHttpService } from '@/github/http.service'
import { ProgressionService } from '@/progression/progression.service'
import { RepositoryContext } from '@/repository/repository.context'
import { RoutesService } from '@/routes/routes.service'
import { TextsProgressionService } from './texts-progression.service'

describe('TextsProgressionService.refreshTextsProgression', () => {
  const getRawFile = jest.fn()
  const setTextsProgression = jest.fn()

  const githubHttpService = { getRawFile } as unknown as GithubHttpService
  const configService = { getOrThrow: () => 'service-token' } as unknown as ConfigService<EnvironmentVariables>
  const routesService = {
    GITHUB_ROUTES: { READ_FILE: (_o: string, _r: string, path: string) => `https://api/repos/acme/repo/contents/${path}` }
  } as unknown as RoutesService
  const repositoryContext = { owner: 'acme', name: 'repo', mainBranch: 'main' } as unknown as RepositoryContext

  // Track only chapter5 so the assertion pins one chapter (it has a strings pair in the catalog).
  const trackingOnlyChapter5 = {
    trackedChapters: () => ['chapter5'],
    setTextsProgression
  } as unknown as ProgressionService

  const makeService = (progressionService: ProgressionService) =>
    new TextsProgressionService(configService, githubHttpService, routesService, repositoryContext, progressionService)

  const ORIGINAL = ['This is a translatable line of dialogue.', 'Another full sentence to translate here.'].join('\n')
  const TRANSLATED = ['Ceci est une ligne de dialogue traduisible.', 'Another full sentence to translate here.'].join('\n')

  beforeEach(() => jest.clearAllMocks())

  // The exact percentage (including the hardcoded auto-translated subtraction) is asserted in
  // texts-progression.spec.ts; here we only check the orchestration: VO + VF fetched, result stored.
  it('computes and stores a texts percentage for the tracked chapter', () => {
    getRawFile.mockImplementation((url: string) =>
      Promise.resolve(url.includes('strings_fr.txt') ? TRANSLATED : ORIGINAL)
    )

    return makeService(trackingOnlyChapter5)
      .refreshTextsProgression()
      .then(() => {
        expect(setTextsProgression).toHaveBeenCalledTimes(1)
        expect(setTextsProgression).toHaveBeenCalledWith('chapter5', expect.any(Number))
      })
  })

  it('reads strings from the main branch with the GITHUB_API_ACCESS_TOKEN service token', async () => {
    getRawFile.mockResolvedValue(ORIGINAL)

    await makeService(trackingOnlyChapter5).refreshTextsProgression()

    expect(getRawFile).toHaveBeenCalledWith(
      expect.stringContaining('chapitre-5/strings_en.txt?ref=main'),
      { authorization: 'Bearer service-token' }
    )
    expect(getRawFile).toHaveBeenCalledWith(
      expect.stringContaining('chapitre-5/strings_fr.txt?ref=main'),
      { authorization: 'Bearer service-token' }
    )
  })

  it('leaves a chapter untouched when its GitHub fetch fails (no bar reset on transient failure)', async () => {
    getRawFile.mockRejectedValue(new Error('network down'))

    await makeService(trackingOnlyChapter5).refreshTextsProgression()

    expect(setTextsProgression).not.toHaveBeenCalled()
  })

  it('stores nothing when no tracked chapter has a strings pair in the catalog', async () => {
    getRawFile.mockResolvedValue(ORIGINAL)
    const trackingMissingChapter = {
      trackedChapters: () => ['chapter999'],
      setTextsProgression
    } as unknown as ProgressionService

    await makeService(trackingMissingChapter).refreshTextsProgression()

    expect(setTextsProgression).not.toHaveBeenCalled()
  })
})
