import { Module } from '@nestjs/common'
import { GithubController } from 'src/github/github.controller'

@Module({
  controllers: [GithubController]
})
export class GithubModule {}
