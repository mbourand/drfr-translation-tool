import { GithubHttpService } from '@/github/http.service'
import { RoutesService } from '@/routes/routes.service'
import { RepositoryContext } from '@/repository/repository.context'
import { PullRequestsService, PullRequest } from './pull-requests.service'

const pr = (over: {
  number: number
  headRef: string
  baseRef: string
  body?: string
  labels?: { name: string }[]
}): PullRequest => ({
  number: over.number,
  body: over.body ?? '',
  labels: over.labels ?? [],
  head: { ref: over.headRef },
  base: { ref: over.baseRef }
})

const makeService = (pullRequests: PullRequest[]) => {
  const cachedGet = jest.fn().mockResolvedValue(pullRequests)
  const github = { cachedGet } as unknown as GithubHttpService
  const routes = {
    GITHUB_ROUTES: { LIST_PULL_REQUESTS: (owner: string, name: string) => `https://api/repos/${owner}/${name}/pulls` }
  } as unknown as RoutesService
  const repo = { owner: 'acme', name: 'deltarune-fr', mainBranch: 'main' } as unknown as RepositoryContext
  return { service: new PullRequestsService(github, routes, repo), cachedGet }
}

describe('PullRequestsService.forBranch', () => {
  it('returns the PR whose head is the branch and base is the main branch', async () => {
    const target = pr({ number: 7, headRef: 'feature-x', baseRef: 'main' })
    const { service } = makeService([pr({ number: 1, headRef: 'other', baseRef: 'main' }), target])

    expect(await service.forBranch('feature-x', { authorization: 'Bearer t' })).toBe(target)
  })

  it('queries the list scoped to head=branch and base=mainBranch, passing the token', async () => {
    const { service, cachedGet } = makeService([pr({ number: 7, headRef: 'feature-x', baseRef: 'main' })])

    await service.forBranch('feature-x', { authorization: 'Bearer t' })

    expect(cachedGet).toHaveBeenCalledWith(
      'https://api/repos/acme/deltarune-fr/pulls?head=feature-x&base=main&sort=updated&direction=desc&per_page=100',
      { authorization: 'Bearer t' }
    )
  })

  it('ignores a PR with the right head but a different base', async () => {
    const { service } = makeService([pr({ number: 9, headRef: 'feature-x', baseRef: 'release' })])

    await expect(service.forBranch('feature-x', {})).rejects.toThrow(
      'No pull request found for branch feature-x with base main'
    )
  })

  it('throws a single "no PR for branch" error when nothing matches', async () => {
    const { service } = makeService([])

    await expect(service.forBranch('ghost', {})).rejects.toThrow(
      'No pull request found for branch ghost with base main'
    )
  })
})
