import { Module } from '@nestjs/common'
import { GithubController } from 'src/github/github.controller'
import { GithubHttpService } from 'src/github/http.service'

@Module({
  controllers: [GithubController],
  providers: [GithubHttpService],
  exports: [GithubHttpService]
})
export class GithubModule {}
