import { Cache, CACHE_MANAGER } from '@nestjs/cache-manager'
import { Body, Controller, Inject, InternalServerErrorException, Post, Req } from '@nestjs/common'
import { IsOptional, IsString } from 'class-validator'
import { Request } from 'express'
import { CACHE_KEYS } from 'src/cache/cache.constants'

class WebhookDto {
  @IsOptional()
  @IsString()
  ref?: string
}

@Controller('github')
export class GithubController {
  constructor(@Inject(CACHE_MANAGER) private readonly cache: Cache) {}

  @Post('webhook')
  async webhookCallback(@Body() body: WebhookDto, @Req() req: Request) {
    // Clear branch files cache when a push event is received on that branch
    if (req.headers['x-github-event'] === 'push' && body.ref) {
      const branchName = body.ref.split('/').pop()
      if (!branchName) throw new InternalServerErrorException('Failed to extract branch name from ref')
      await this.cache.del(CACHE_KEYS.FILES(branchName))
    }
  }
}
