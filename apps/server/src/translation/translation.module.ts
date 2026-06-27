import { Module } from '@nestjs/common'
import { TranslationController } from './translation.controller'
import { HttpModule } from '@nestjs/axios'
import { RoutesModule } from '@/routes/routes.module'
import { GithubModule } from '@/github/github.module'
import { GithubHttpService } from '@/github/http.service'
import { ProgressionService } from '@/progression/progression.service'
import { RepositoryModule } from '@/repository/repository.module'
import { GithubAuthGuard } from '@/auth/github-auth.guard'
import { PullRequestsService } from './pull-requests.service'
import { ScreenshotsService } from './screenshots.service'
import { ScreenshotsPruneService } from './screenshots-prune.service'
import { TextsProgressionService } from './texts-progression.service'

@Module({
  controllers: [TranslationController],
  providers: [
    GithubHttpService,
    ProgressionService,
    PullRequestsService,
    ScreenshotsService,
    ScreenshotsPruneService,
    TextsProgressionService,
    GithubAuthGuard
  ],
  imports: [HttpModule, RoutesModule, GithubModule, RepositoryModule]
})
export class TranslationModule {}
