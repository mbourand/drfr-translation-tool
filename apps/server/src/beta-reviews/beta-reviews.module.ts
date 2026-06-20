import { Module } from '@nestjs/common'
import { GithubModule } from 'src/github/github.module'
import { RoutesModule } from 'src/routes/routes.module'
import { GithubAuthGuard } from 'src/auth/github-auth.guard'
import { BetaReviewsController } from './beta-reviews.controller'
import { BetaReviewsService } from './beta-reviews.service'

@Module({
  imports: [GithubModule, RoutesModule],
  controllers: [BetaReviewsController],
  providers: [BetaReviewsService, GithubAuthGuard]
})
export class BetaReviewsModule {}
