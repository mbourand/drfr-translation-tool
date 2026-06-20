import { Body, Controller, Delete, Get, Post, Query, Req, UseGuards } from '@nestjs/common'
import { IsString } from 'class-validator'
import { AuthedRequest, GithubAuthGuard } from '@/auth/github-auth.guard'
import { BetaReviewsService } from './beta-reviews.service'

class MarkDto {
  @IsString() filePath: string
  @IsString() original: string
  @IsString() translated: string
}

@UseGuards(GithubAuthGuard)
@Controller('beta-reviews')
export class BetaReviewsController {
  constructor(private readonly betaReviewsService: BetaReviewsService) {}

  @Post('marks')
  async mark(@Req() req: AuthedRequest, @Body() body: MarkDto) {
    await this.betaReviewsService.mark(req.user.id, body.filePath, body.original, body.translated)
    return { success: true }
  }

  @Delete('marks')
  async unmark(@Req() req: AuthedRequest, @Body() body: MarkDto) {
    await this.betaReviewsService.unmark(req.user.id, body.filePath, body.original, body.translated)
    return { success: true }
  }

  @Get('counts')
  async counts(@Req() req: AuthedRequest, @Query('filePath') filePath: string) {
    return this.betaReviewsService.getCounts(filePath, req.user.id)
  }
}
