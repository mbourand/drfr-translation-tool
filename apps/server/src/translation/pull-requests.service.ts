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
 * "The pull request for a branch." Five endpoints (submit-to-review, approve, mark-as-reviewed,
 * comments, comment) used to each re-list PRs and re-find by head/base ref, and each re-implement
 * the "no PR for this branch" error. This module concentrates that lookup behind `forBranch`, so
 * the missing-PR case is handled in exactly one place and the interface is the test surface.
 */
@Injectable()
export class PullRequestsService {
  constructor(
    private readonly githubHttpService: GithubHttpService,
    private readonly routesService: RoutesService,
    private readonly repositoryContext: RepositoryContext
  ) {}

  async forBranch(branch: string, options: { authorization?: string }): Promise<PullRequest> {
    const { owner, name, mainBranch } = this.repositoryContext

    const pullRequests = await this.githubHttpService.cachedGet<PullRequest[]>(
      this.routesService.GITHUB_ROUTES.LIST_PULL_REQUESTS(owner, name) +
        `?head=${branch}&base=${mainBranch}&sort=updated&direction=desc&per_page=100`,
      { authorization: options.authorization }
    )

    const pullRequest = pullRequests.find((pr) => pr.head.ref === branch && pr.base.ref === mainBranch)
    if (!pullRequest) {
      throw new Error(`No pull request found for branch ${branch} with base ${mainBranch}`)
    }

    return pullRequest
  }
}
