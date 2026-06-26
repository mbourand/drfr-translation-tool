import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Cron, CronExpression } from '@nestjs/schedule'
import { EnvironmentVariables } from '@/env'
import { GithubHttpService } from '@/github/http.service'
import { RepositoryContext } from '@/repository/repository.context'
import { RoutesService } from '@/routes/routes.service'
import { selectPrunableDirs } from './prune-decision'
import { ScreenshotsService } from './screenshots.service'

/** Safety bound on pagination — far above any realistic open-PR count (100/page), so a runaway never spins. */
const MAX_PR_LIST_PAGES = 20

/**
 * Keeps screenshot storage self-maintaining: a daily job that deletes the images of every pull request
 * that is no longer open. It only orchestrates the edges — list open PRs (GitHub), list stored PR
 * directories and delete them (filesystem) — while `selectPrunableDirs` owns the destructive decision
 * as a pure, unit-tested function (test seam 2).
 *
 * The job authenticates with the service token (`GITHUB_API_ACCESS_TOKEN`), not a user's, because it
 * runs unattended. If it cannot obtain an authoritative list of open PRs it deletes nothing, so a
 * transient GitHub failure can never be mistaken for "no PRs are open."
 */
@Injectable()
export class ScreenshotsPruneService {
  private readonly logger = new Logger(ScreenshotsPruneService.name)

  constructor(
    private readonly configService: ConfigService<EnvironmentVariables>,
    private readonly githubHttpService: GithubHttpService,
    private readonly routesService: RoutesService,
    private readonly repositoryContext: RepositoryContext,
    private readonly screenshotsService: ScreenshotsService
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async pruneClosedPrScreenshots(): Promise<void> {
    const openPrNumbers = await this.fetchOpenPrNumbers()
    if (openPrNumbers === null) {
      this.logger.warn('Skipping screenshot prune: could not list open pull requests (deleting nothing).')
      return
    }

    const existingDirs = await this.screenshotsService.listPrDirs()
    const toDelete = selectPrunableDirs(openPrNumbers, existingDirs)

    for (const dir of toDelete) {
      await this.screenshotsService.deletePrDir(dir)
    }

    this.logger.log(`Screenshot prune complete: deleted ${toDelete.length} of ${existingDirs.length} PR directories.`)
  }

  /**
   * The set of all currently-open PR numbers, or `null` when the listing failed — the abort signal that
   * `selectPrunableDirs` turns into "delete nothing." Lists every open PR regardless of base branch: a
   * superset can only ever spare a directory, never wrongly delete one belonging to an open PR.
   */
  private async fetchOpenPrNumbers(): Promise<Set<number> | null> {
    try {
      const { owner, name } = this.repositoryContext
      const token = this.configService.getOrThrow('GITHUB_API_ACCESS_TOKEN', { infer: true })
      const base = this.routesService.GITHUB_ROUTES.LIST_PULL_REQUESTS(owner, name)

      const numbers = new Set<number>()
      for (let page = 1; page <= MAX_PR_LIST_PAGES; page++) {
        const response = await this.githubHttpService.fetch(`${base}?state=open&per_page=100&page=${page}`, {
          authorization: `Bearer ${token}`
        })

        if (!response.ok) {
          const errorBody = await response.text().catch(() => '<unreadable>')
          throw new Error(`list open pull requests failed: ${response.status} ${response.statusText} :: ${errorBody}`)
        }

        for (const pr of (await response.json()) as { number: number }[]) numbers.add(pr.number)

        // GitHub sends a `Link` header on the last page too (only `prev`/`first`), so stop on the
        // absence of a `next` relation rather than the header itself — otherwise we fetch one empty page past the end.
        if (!response.headers.get('Link')?.includes('rel="next"')) break
      }

      return numbers
    } catch (error) {
      this.logger.error('Failed to list open pull requests for screenshot prune', error as Error)
      return null
    }
  }
}
