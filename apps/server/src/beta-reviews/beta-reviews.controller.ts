import { Body, Controller, Delete, Get, Post, Query, Req, UseGuards } from '@nestjs/common'
import { IsEnum, IsString } from 'class-validator'
import { Verdict } from '@prisma/client'
import { AuthedRequest, GithubAuthGuard } from '@/auth/github-auth.guard'
import { BetaReviewsService } from './beta-reviews.service'

class LineDto {
  @IsString() filePath: string
  @IsString() original: string
  @IsString() translated: string
}

class SetVerdictDto extends LineDto {
  @IsEnum(Verdict) verdict: Verdict
}

@UseGuards(GithubAuthGuard)
@Controller('beta-reviews')
export class BetaReviewsController {
  constructor(private readonly betaReviewsService: BetaReviewsService) {}

  // Set/replace the caller's own verdict on a line (OK<->KO flip overwrites in place).
  @Post('marks')
  async setVerdict(@Req() req: AuthedRequest, @Body() body: SetVerdictDto) {
    await this.betaReviewsService.setVerdict(req.user.id, body.filePath, body.original, body.translated, body.verdict)
    return { success: true }
  }

  // Clear only the caller's own verdict (misclick / unread recovery).
  @Delete('marks')
  async clearMine(@Req() req: AuthedRequest, @Body() body: LineDto) {
    await this.betaReviewsService.clearMine(req.user.id, body.filePath, body.original, body.translated)
    return { success: true }
  }

  // Line-level KO clear: remove EVERY QA's KO on the line (ADR 0002). No authorship check.
  @Delete('marks/ko')
  async clearKo(@Body() body: LineDto) {
    await this.betaReviewsService.clearKo(body.filePath, body.original, body.translated)
    return { success: true }
  }

  @Get('counts')
  async counts(@Req() req: AuthedRequest, @Query('filePath') filePath: string) {
    return this.betaReviewsService.getCounts(filePath, req.user.id)
  }
}
