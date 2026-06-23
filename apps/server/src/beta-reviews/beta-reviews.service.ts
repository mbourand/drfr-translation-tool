import { createHash } from 'crypto'
import { Injectable, NotFoundException } from '@nestjs/common'
import { Verdict } from '@prisma/client'
import { PrismaService } from '@/prisma/prisma.service'
import { findBetaFilePair } from '@/translation/translation-files'

export type HashVerdictCounts = {
  contentHash: string
  okCount: number
  koCount: number
  myVerdict: Verdict | null
}

/**
 * Owns Beta QA review verdicts. The public surface is setVerdict / clearMine / clearKo / getCounts.
 *
 * Each row is one QA's verdict on one line: OK (tested, no bug) or KO (tested, found a bug). There
 * is no separate "reviewed" flag — recording a verdict already means the line was tested.
 *
 * A line's identity is (filePath, contentHash) where contentHash covers BOTH the original (VO) and
 * translated (VF) text, exact bytes, no normalisation. The recipe is versioned ("v1:") so it can
 * change later without silently merging old and new verdicts.
 *
 * The marks table is the source of truth for what has been tested: a line whose hash has no row is
 * non relu. So the read path (getCounts) never fetches or hashes the `beta` file — it returns only
 * the hashes that actually have verdicts, and the client (which already holds the file) computes each
 * displayed line's hash and treats a miss as non relu. This keeps the VPS doing one indexed query per
 * file open instead of downloading and re-hashing a 40k-line file.
 *
 * Permission asymmetry (ADR 0002): an OK verdict is personal — only its author may change/remove it
 * (setVerdict / clearMine). A line's KO can be cleared by ANY QA (clearKo), which removes every QA's
 * KO on that line at once, leaving OK verdicts intact.
 *
 * IMPORTANT: the client mirrors `hashLine` below. If you change the recipe here, change it in the
 * desktop app too (apps/desktop/src/modules/beta-reviews/hash.ts) and bump the "v1:" version.
 */
@Injectable()
export class BetaReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Upserts the caller's verdict for the line, overwriting any prior verdict (OK<->KO flip never
   * creates a second row — the unique constraint guarantees one verdict per (QA, line)).
   */
  async setVerdict(
    userId: string,
    filePath: string,
    original: string,
    translated: string,
    verdict: Verdict
  ): Promise<void> {
    const contentHash = this.hashLine(original, translated)
    await this.prisma.betaReviewMark.upsert({
      where: { userId_filePath_contentHash: { userId, filePath, contentHash } },
      create: { userId, filePath, contentHash, verdict },
      update: { verdict }
    })
  }

  /** Clears only the caller's own verdict on the line (misclick / unread recovery). */
  async clearMine(userId: string, filePath: string, original: string, translated: string): Promise<void> {
    const contentHash = this.hashLine(original, translated)
    await this.prisma.betaReviewMark.deleteMany({ where: { userId, filePath, contentHash } })
  }

  /**
   * Line-level KO clear (ADR 0002): removes EVERY QA's KO verdict on the line, regardless of who
   * raised it, leaving OK verdicts on that line untouched. Any authenticated caller may invoke it.
   */
  async clearKo(filePath: string, original: string, translated: string): Promise<void> {
    const contentHash = this.hashLine(original, translated)
    await this.prisma.betaReviewMark.deleteMany({ where: { filePath, contentHash, verdict: Verdict.KO } })
  }

  /**
   * Returns one entry per `(filePath, contentHash)` that has at least one verdict: the distinct-QA
   * OK and KO tallies, plus the caller's own verdict (`'OK' | 'KO' | null`). Hashes with no verdict
   * are absent — the client maps these onto its lines and reads a missing hash as non relu.
   */
  async getCounts(filePath: string, userId: string): Promise<HashVerdictCounts[]> {
    if (!findBetaFilePair(filePath)) throw new NotFoundException(`Unknown beta file ${filePath}`)

    const [grouped, mine] = await Promise.all([
      this.prisma.betaReviewMark.groupBy({
        by: ['contentHash', 'verdict'],
        where: { filePath },
        _count: { userId: true }
      }),
      this.prisma.betaReviewMark.findMany({
        where: { filePath, userId },
        select: { contentHash: true, verdict: true }
      })
    ])

    const myVerdictByHash = new Map(mine.map((m) => [m.contentHash, m.verdict]))
    const byHash = new Map<string, { okCount: number; koCount: number }>()
    for (const g of grouped) {
      const entry = byHash.get(g.contentHash) ?? { okCount: 0, koCount: 0 }
      if (g.verdict === Verdict.KO) entry.koCount = g._count.userId
      else entry.okCount = g._count.userId
      byHash.set(g.contentHash, entry)
    }

    return Array.from(byHash, ([contentHash, { okCount, koCount }]) => ({
      contentHash,
      okCount,
      koCount,
      myVerdict: myVerdictByHash.get(contentHash) ?? null
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
