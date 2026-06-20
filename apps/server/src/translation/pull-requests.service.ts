import { Injectable } from '@nestjs/common'
import { GithubHttpService } from '@/github/http.service'
import { RepositoryContext } from '@/repository/repository.context'
import { RoutesService } from '@/routes/routes.service'

/**
 * The slice of a GitHub pull request the translation flows read. A superset of every caller's
 * needs (number, body, labels, head/base refs, author login) so one lookup serves them all.
 */
export type PullRequest = {
  number: number
  body: string
  base: { ref: string }
  head: { ref: string }
  labels: { name: string }[]
  user: { login: string }
}

/**
 * Translation pull-request reads and their cache lifecycle, in one place. Endpoints used to each
 * re-list PRs and re-find by head/base ref, and each re-implement the "no PR for this branch" error;
 * this module concentrates the lookup behind `forBranch` / `list`, so the missing-PR case lives in
 * exactly one place and the interface is the test surface.
 *
 * It also owns the *exact* list URLs the UI reads, so a read (`list` / `forBranch`) and its cache
 * invalidation (`invalidate`) are built from the same strings and can never drift — see `invalidate`.
 */
@Injectable()
export class PullRequestsService {
  constructor(
    private readonly githubHttpService: GithubHttpService,
    private readonly routesService: RoutesService,
    private readonly repositoryContext: RepositoryContext
  ) {}

  /**
   * The PR-list URLs the app reads: the Overview board reads `openList` + `closedList`; `forBranch`
   * reads `branch`. The single source of truth for these strings (reads and invalidation share it).
   */
  private listUrls(branch?: string) {
    const { owner, name, mainBranch } = this.repositoryContext
    const base = this.routesService.GITHUB_ROUTES.LIST_PULL_REQUESTS(owner, name)
    return {
      openList: `${base}?base=${mainBranch}&state=open&sort=updated&direction=desc&per_page=100`,
      closedList: `${base}?base=${mainBranch}&state=closed&sort=created&direction=desc&per_page=50`,
      branch: `${base}?head=${branch}&base=${mainBranch}&sort=updated&direction=desc&per_page=100`
    }
  }

  /** Every translation PR the Overview board lists: open ones, then recently-closed ones. */
  async list(options: { authorization?: string }): Promise<unknown[]> {
    const { openList, closedList } = this.listUrls()

    const [open, closed] = await Promise.all([
      this.githubHttpService.cachedGet<unknown[]>(openList, options),
      this.githubHttpService.cachedGet<unknown[]>(closedList, options)
    ])

    return [...open, ...closed]
  }

  async forBranch(branch: string, options: { authorization?: string }): Promise<PullRequest> {
    const { mainBranch } = this.repositoryContext

    const pullRequests = await this.githubHttpService.cachedGet<PullRequest[]>(this.listUrls(branch).branch, {
      authorization: options.authorization
    })

    const pullRequest = pullRequests.find((pr) => pr.head.ref === branch && pr.base.ref === mainBranch)
    if (!pullRequest) {
      throw new Error(`No pull request found for branch ${branch} with base ${mainBranch}`)
    }

    return pullRequest
  }

  /**
   * Drop the conditional-cache entries for the lists that surface `branch`, so the next read after a
   * write (label / body / state change) sends a fresh request instead of getting a stale `304` with
   * the pre-write body. Call after every endpoint that mutates a translation PR — GitHub's list
   * ETag isn't bumped instantly after a write, so without this the Overview board lags a transition.
   */
  async invalidate(branch: string): Promise<void> {
    const { openList, closedList, branch: branchUrl } = this.listUrls(branch)

    await Promise.all([
      this.githubHttpService.invalidateCachedGet(openList),
      this.githubHttpService.invalidateCachedGet(closedList),
      this.githubHttpService.invalidateCachedGet(branchUrl)
    ])
  }
}
