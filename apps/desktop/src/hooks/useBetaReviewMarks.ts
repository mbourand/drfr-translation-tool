import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { authedFetch } from '../modules/fetching/fetcher'
import { TRANSLATION_API_URLS } from '../routes/translation/routes'
import { hashBetaLine } from '../modules/beta-reviews/hash'
import { Line } from '../types/translation'

export type Verdict = 'OK' | 'KO'

/** A line's distinct-QA OK/KO tallies plus the caller's own verdict (null = non relu for the caller). */
export type LineVerdict = { okCount: number; koCount: number; myVerdict: Verdict | null }

const NO_VERDICT: LineVerdict = { okCount: 0, koCount: 0, myVerdict: null }

/** A line is treated as KO whenever any QA marked it KO, regardless of OK count (KO prevails). */
export const isLineKo = (verdict: LineVerdict): boolean => verdict.koCount >= 1

/**
 * Beta QA verdicts for one file. The backend returns OK/KO tallies keyed by content hash for only the
 * lines that have a verdict; this hook hashes each displayed line locally (recipe mirrors the backend)
 * and maps the tallies onto them — a line whose hash has no verdict is non relu. Recording or clearing
 * a verdict refetches the counts so the grid stays honest.
 *
 * Permission asymmetry (ADR 0002): `setVerdict` and `clearMine` act on the caller's own verdict;
 * `clearKo` is line-level and removes every QA's KO on the line at once.
 */
export const useBetaReviewMarks = (filePath: string | undefined, lines: Line[] | undefined) => {
  const queryClient = useQueryClient()
  const countsQueryKey = ['beta-review-counts', filePath]

  // Distinct-QA OK/KO tallies per content hash that has a verdict (absent hashes = non relu).
  const marks = useQuery({
    queryKey: countsQueryKey,
    queryFn: async () => {
      if (!filePath) throw new Error('No file path provided')
      return await authedFetch({ route: TRANSLATION_API_URLS.BETA_REVIEWS.COUNTS(filePath) })
    },
    enabled: !!filePath
  })

  // Hash each displayed line locally. A `beta` file is a stable snapshot within a session, so this
  // is computed once per file (keyed by path + line count) and reused across verdict changes.
  const lineHashes = useQuery({
    queryKey: ['beta-line-hashes', filePath, lines?.length],
    queryFn: async () => {
      if (!lines) throw new Error('No lines provided')
      const entries = await Promise.all(
        lines.map(async (line) => [line.lineNumber, await hashBetaLine(line.original, line.translated)] as const)
      )
      return new Map<number, string>(entries)
    },
    enabled: !!filePath && !!lines,
    staleTime: Infinity
  })

  const verdictsByLine = useMemo(() => {
    const byHash = new Map(
      (marks.data ?? []).map((m) => [m.contentHash, { okCount: m.okCount, koCount: m.koCount, myVerdict: m.myVerdict }])
    )
    const result = new Map<number, LineVerdict>()
    for (const [lineNumber, hash] of lineHashes.data ?? []) {
      result.set(lineNumber, byHash.get(hash) ?? NO_VERDICT)
    }
    return result
  }, [marks.data, lineHashes.data])

  type VerdictOp =
    | { type: 'set'; line: Line; verdict: Verdict }
    | { type: 'clearMine'; line: Line }
    | { type: 'clearKo'; line: Line }

  const mutateVerdict = useMutation({
    mutationKey: ['beta-review-verdict', filePath],
    mutationFn: async (op: VerdictOp) => {
      if (!filePath) throw new Error('No file path provided')
      const { original, translated } = op.line
      if (op.type === 'set') {
        await authedFetch({
          route: TRANSLATION_API_URLS.BETA_REVIEWS.SET_VERDICT,
          body: { filePath, original, translated, verdict: op.verdict }
        })
      } else if (op.type === 'clearMine') {
        await authedFetch({
          route: TRANSLATION_API_URLS.BETA_REVIEWS.CLEAR_MINE,
          body: { filePath, original, translated }
        })
      } else {
        await authedFetch({
          route: TRANSLATION_API_URLS.BETA_REVIEWS.CLEAR_KO,
          body: { filePath, original, translated }
        })
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: countsQueryKey })
  })

  return {
    verdictsByLine,
    setVerdict: (line: Line, verdict: Verdict) => mutateVerdict.mutate({ type: 'set', line, verdict }),
    clearMine: (line: Line) => mutateVerdict.mutate({ type: 'clearMine', line }),
    clearKo: (line: Line) => mutateVerdict.mutate({ type: 'clearKo', line })
  }
}
