import { Module } from '@nestjs/common'
import { GithubModule } from '@/github/github.module'
import { RoutesModule } from '@/routes/routes.module'
import { GithubAuthGuard } from '@/auth/github-auth.guard'
import { BetaReviewsController } from './beta-reviews.controller'
import { BetaReviewsService } from './beta-reviews.service'

@Module({
  imports: [GithubModule, RoutesModule],
  controllers: [BetaReviewsController],
  providers: [BetaReviewsService, GithubAuthGuard]
})
export class BetaReviewsModule {}
