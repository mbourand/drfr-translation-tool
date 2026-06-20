import { createHash } from 'crypto'
import { Injectable, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { EnvironmentVariables } from 'src/env'
import { GithubHttpService } from 'src/github/http.service'
import { RoutesService } from 'src/routes/routes.service'
import { PrismaService } from 'src/prisma/prisma.service'
import { findBetaFilePair } from './beta-file-pairs'

export type LineCount = { count: number; markedByMe: boolean }

/**
 * Owns Beta QA review marks. The public surface is mark / unmark / getCounts; the versioned hash
 * recipe, the `beta`-branch file fetch, and the Prisma queries are all hidden so they can be
 * rewritten (e.g. add caching) without changing the HTTP behaviour tests assert on.
 *
 * A line's identity is (filePath, contentHash) where contentHash covers BOTH the original (VO) and
 * translated (VF) text, exact bytes, no normalisation. The recipe is versioned ("v1:") so it can
 * change later without silently merging old and new marks.
 */
@Injectable()
export class BetaReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly githubHttpService: GithubHttpService,
    private readonly routesService: RoutesService,
    private readonly configService: ConfigService<EnvironmentVariables>
  ) {}

  async mark(userId: string, filePath: string, original: string, translated: string): Promise<void> {
    const contentHash = this.hashLine(original, translated)
    await this.prisma.betaReviewMark.upsert({
      where: { userId_filePath_contentHash: { userId, filePath, contentHash } },
      create: { userId, filePath, contentHash },
      update: {}
    })
  }

  async unmark(userId: string, filePath: string, original: string, translated: string): Promise<void> {
    const contentHash = this.hashLine(original, translated)
    await this.prisma.betaReviewMark.deleteMany({ where: { userId, filePath, contentHash } })
  }

  /**
   * Returns one entry per line of the `beta` file at `filePath`, aligned to its lines, each with
   * the number of distinct QAs who verified that exact (VO, VF) and whether `userId` is one of them.
   */
  async getCounts(filePath: string, userId: string, authorization?: string): Promise<LineCount[]> {
    const pair = findBetaFilePair(filePath)
    if (!pair) throw new NotFoundException(`Unknown beta file ${filePath}`)

    const betaBranch = this.configService.getOrThrow('REPOSITORY_BETA_BRANCH', { infer: true })
    const [originalText, translatedText] = await Promise.all([
      this.fetchBetaFile(pair.originalPath, betaBranch, authorization),
      this.fetchBetaFile(filePath, betaBranch, authorization)
    ])

    const originalLines = originalText.split('\n')
    const translatedLines = translatedText.split('\n')

    const lineHashes = translatedLines.map((translatedLine, i) => this.hashLine(originalLines[i] ?? '', translatedLine))
    const uniqueHashes = [...new Set(lineHashes)]

    const [grouped, mine] = await Promise.all([
      this.prisma.betaReviewMark.groupBy({
        by: ['contentHash'],
        where: { filePath, contentHash: { in: uniqueHashes } },
        _count: { userId: true }
      }),
      this.prisma.betaReviewMark.findMany({
        where: { filePath, userId, contentHash: { in: uniqueHashes } },
        select: { contentHash: true }
      })
    ])

    const countByHash = new Map(grouped.map((g) => [g.contentHash, g._count.userId]))
    const minByHash = new Set(mine.map((m) => m.contentHash))

    return lineHashes.map((hash) => ({ count: countByHash.get(hash) ?? 0, markedByMe: minByHash.has(hash) }))
  }

  private async fetchBetaFile(path: string, branch: string, authorization?: string): Promise<string> {
    const owner = this.configService.getOrThrow('REPOSITORY_OWNER', { infer: true })
    const repo = this.configService.getOrThrow('REPOSITORY_NAME', { infer: true })
    const url = this.routesService.GITHUB_ROUTES.READ_FILE(owner, repo, path) + `?ref=${branch}`
    return this.githubHttpService.getRawFile(url, { authorization })
  }

  /**
   * Versioned, normalisation-free hash of one line's (VO, VF). Both fields are length-prefixed so
   * different (VO, VF) splits cannot collide. Whitespace is significant.
   */
  private hashLine(original: string, translated: string): string {
    const payload = `${Buffer.byteLength(original)}:${original}\n${Buffer.byteLength(translated)}:${translated}`
    return 'v1:' + createHash('sha256').update(payload).digest('hex')
  }
}
