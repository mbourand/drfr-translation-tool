import { Module } from '@nestjs/common'
import { TranslationController } from './translation.controller'
import { HttpModule } from '@nestjs/axios'
import { RoutesModule } from 'src/routes/routes.module'
import { GithubModule } from 'src/github/github.module'
import { GithubHttpService } from 'src/github/http.service'

@Module({
  controllers: [TranslationController],
  providers: [GithubHttpService],
  imports: [HttpModule, RoutesModule, GithubModule]
})
export class TranslationModule {}
