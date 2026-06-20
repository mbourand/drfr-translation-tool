import { createHash } from 'crypto'
import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '@/prisma/prisma.service'
import { findBetaFilePair } from '@/translation/translation-files'

export type HashCount = { contentHash: string; count: number; markedByMe: boolean }

/**
 * Owns Beta QA review marks. The public surface is mark / unmark / getCounts.
 *
 * A line's identity is (filePath, contentHash) where contentHash covers BOTH the original (VO) and
 * translated (VF) text, exact bytes, no normalisation. The recipe is versioned ("v1:") so it can
 * change later without silently merging old and new marks.
 *
 * The marks table is the source of truth for what has been reviewed: a line whose hash has no row
 * is simply unreviewed. So the read path (getCounts) never fetches or hashes the `beta` file — it
 * returns only the hashes that actually have marks, and the client (which already holds the file)
 * computes each displayed line's hash and treats a miss as "unreviewed (count 0)". This keeps the
 * VPS doing one indexed query per file open instead of downloading and re-hashing a 40k-line file.
 *
 * IMPORTANT: the client mirrors `hashLine` below. If you change the recipe here, change it in the
 * desktop app too (apps/desktop/src/modules/beta-reviews/hash.ts) and bump the "v1:" version.
 */
@Injectable()
export class BetaReviewsService {
  constructor(private readonly prisma: PrismaService) {}

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
   * Returns one entry per `(filePath, contentHash)` that has at least one mark: the number of
   * distinct QAs who verified it and whether `userId` is one of them. Hashes with no mark are
   * absent — the client maps these onto its lines and treats a missing hash as unreviewed.
   */
  async getCounts(filePath: string, userId: string): Promise<HashCount[]> {
    if (!findBetaFilePair(filePath)) throw new NotFoundException(`Unknown beta file ${filePath}`)

    const [grouped, mine] = await Promise.all([
      this.prisma.betaReviewMark.groupBy({
        by: ['contentHash'],
        where: { filePath },
        _count: { userId: true }
      }),
      this.prisma.betaReviewMark.findMany({
        where: { filePath, userId },
        select: { contentHash: true }
      })
    ])

    const mineHashes = new Set(mine.map((m) => m.contentHash))
    return grouped.map((g) => ({
      contentHash: g.contentHash,
      count: g._count.userId,
      markedByMe: mineHashes.has(g.contentHash)
    }))
  }

  /**
   * Versioned, normalisation-free hash of one line's (VO, VF). Both fields are length-prefixed so
   * different (VO, VF) splits cannot collide. Whitespace is significant.
   *
   * MIRRORED on the client (apps/desktop/src/modules/beta-reviews/hash.ts). Keep them in lockstep.
   */
  private hashLine(original: string, translated: string): string {
    const payload = `${Buffer.byteLength(original)}:${original}\n${Buffer.byteLength(translated)}:${translated}`
    return 'v1:' + createHash('sha256').update(payload).digest('hex')
  }
}
