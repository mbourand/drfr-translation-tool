import { Cache, CACHE_MANAGER } from '@nestjs/cache-manager'
import { Body, Controller, Inject, InternalServerErrorException, Post, Req } from '@nestjs/common'
import { Request } from 'express'
import { CACHE_KEYS } from 'src/cache/cache.constants'

@Controller('github')
export class GithubController {
  constructor(@Inject(CACHE_MANAGER) private readonly cache: Cache) {}

  @Post('webhook')
  async webhookCallback(@Body() body: Record<string, any>, @Req() req: Request) {
    // Clear branch files cache when a push event is received on that branch
    if (req.headers['x-github-event'] === 'push' && body.ref) {
      const branchName = (body.ref as string).split('/').pop()
      if (!branchName) throw new InternalServerErrorException('Failed to extract branch name from ref')
      await this.cache.del(CACHE_KEYS.FILES(branchName))
    }

    if (
      req.headers['x-github-event'] === 'pull_request_review_comment' ||
      req.headers['x-github-event'] === 'issue_comment' ||
      req.headers['x-github-event'] === 'pull_request_review_thread'
    ) {
      console.log('Received issue_comment event:', body)
      const pullRequestNumber = (body.pull_request as Record<string, any>)?.number as number
      if (!pullRequestNumber) {
        throw new InternalServerErrorException('Pull Request Number is missing')
      }

      console.log('Clearing cache for pull Request Number:', pullRequestNumber)

      // Clear comments cache for the specific pull request
      await this.cache.del(CACHE_KEYS.COMMENTS(pullRequestNumber))
    }
  }
}
