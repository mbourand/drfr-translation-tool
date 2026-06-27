import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Cron, CronExpression } from '@nestjs/schedule'
import { EnvironmentVariables } from '@/env'
import { GithubHttpService } from '@/github/http.service'
import { ChapterKey, ProgressionService } from '@/progression/progression.service'
import { RepositoryContext } from '@/repository/repository.context'
import { RoutesService } from '@/routes/routes.service'
import { computeTextsPercentage } from './texts-progression'
import { translationFiles } from './translation-files'

const AUTO_TRANSLATED_LINES: Partial<Record<ChapterKey, number>> = {
  chapter5: 4995
}

@Injectable()
export class TextsProgressionService {
  private readonly logger = new Logger(TextsProgressionService.name)

  constructor(
    private readonly configService: ConfigService<EnvironmentVariables>,
    private readonly githubHttpService: GithubHttpService,
    private readonly routesService: RoutesService,
    private readonly repositoryContext: RepositoryContext,
    private readonly progressionService: ProgressionService
  ) {}

  @Cron(CronExpression.EVERY_6_HOURS)
  async refreshTextsProgression(): Promise<void> {
    for (const chapter of this.progressionService.trackedChapters()) {
      const pair = this.stringsPairFor(chapter)
      if (!pair) {
        this.logger.warn(`No strings file pair for ${chapter}; skipping texts progression.`)
        continue
      }
      await this.computeAndStore(chapter, pair)
    }
  }

  private async computeAndStore(chapter: ChapterKey, pair: { original: string; translated: string }): Promise<void> {
    try {
      const [originalText, translatedText] = await Promise.all([
        this.fetchFile(pair.original),
        this.fetchFile(pair.translated)
      ])
      const percent = computeTextsPercentage(originalText, translatedText, AUTO_TRANSLATED_LINES[chapter] ?? 0)
      this.progressionService.setTextsProgression(chapter, percent)
      this.logger.log(`Texts progression for ${chapter}: ${percent}%`)
    } catch (error) {
      this.logger.error(`Failed to compute texts progression for ${chapter}`, error as Error)
    }
  }

  private fetchFile(path: string): Promise<string> {
    const { owner, name, mainBranch } = this.repositoryContext
    const token = this.configService.getOrThrow('GITHUB_API_ACCESS_TOKEN', { infer: true })
    const url = `${this.routesService.GITHUB_ROUTES.READ_FILE(owner, name, path)}?ref=${mainBranch}`
    return this.githubHttpService.getRawFile(url, { authorization: `Bearer ${token}` })
  }

  private stringsPairFor(chapter: ChapterKey): { original: string; translated: string } | undefined {
    const chapterNumber = chapter.replace('chapter', '')
    return translationFiles.all().find((f) => f.original === `chapitre-${chapterNumber}/strings_en.txt`)
  }
}
