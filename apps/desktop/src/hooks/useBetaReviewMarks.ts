import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { authedFetch } from '../modules/fetching/fetcher'
import { TRANSLATION_API_URLS } from '../routes/translation/routes'
import { hashBetaLine } from '../modules/beta-reviews/hash'
import { Line } from '../types/translation'

export type LineReviewCount = { count: number; markedByMe: boolean }

const NO_COUNT: LineReviewCount = { count: 0, markedByMe: false }

/**
 * Beta QA review marks for one file. The backend returns counts keyed by content hash for only the
 * lines that have marks; this hook hashes each displayed line locally (recipe mirrors the backend)
 * and maps the counts onto them — a line whose hash has no mark is unreviewed. Toggling refetches
 * the counts so the column stays honest.
 */
export const useBetaReviewMarks = (filePath: string | undefined, lines: Line[] | undefined) => {
  const queryClient = useQueryClient()
  const countsQueryKey = ['beta-review-counts', filePath]

  // Distinct-QA count per marked content hash for the file (absent hashes = unreviewed).
  const marks = useQuery({
    queryKey: countsQueryKey,
    queryFn: async () => {
      if (!filePath) throw new Error('No file path provided')
      return await authedFetch({ route: TRANSLATION_API_URLS.BETA_REVIEWS.COUNTS(filePath) })
    },
    enabled: !!filePath
  })

  // Hash each displayed line locally. A `beta` file is a stable snapshot within a session, so this
  // is computed once per file (keyed by path + line count) and reused across mark/unmark.
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

  const countsByLine = useMemo(() => {
    const byHash = new Map((marks.data ?? []).map((m) => [m.contentHash, { count: m.count, markedByMe: m.markedByMe }]))
    const result = new Map<number, LineReviewCount>()
    for (const [lineNumber, hash] of lineHashes.data ?? []) {
      result.set(lineNumber, byHash.get(hash) ?? NO_COUNT)
    }
    return result
  }, [marks.data, lineHashes.data])

  const toggleMark = useMutation({
    mutationKey: ['beta-review-toggle', filePath],
    mutationFn: async ({ line, markedByMe }: { line: Line; markedByMe: boolean }) => {
      if (!filePath) throw new Error('No file path provided')
      await authedFetch({
        route: markedByMe ? TRANSLATION_API_URLS.BETA_REVIEWS.UNMARK : TRANSLATION_API_URLS.BETA_REVIEWS.MARK,
        body: { filePath, original: line.original, translated: line.translated }
      })
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: countsQueryKey })
  })

  return { countsByLine, toggleMark }
}
