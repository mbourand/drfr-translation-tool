import { Module } from '@nestjs/common'
import { GithubController } from '@/github/github.controller'
import { GithubHttpService } from '@/github/http.service'

@Module({
  controllers: [GithubController],
  providers: [GithubHttpService],
  exports: [GithubHttpService]
})
export class GithubModule {}
