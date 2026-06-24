import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { hashBetaLine } from '../modules/beta-reviews/hash'
import { Line } from '../types/translation'
import { getReviewedLinesForBranch, toggleReviewedLine } from '../modules/qa-review/reviewedLines'

/** Per-file review progress for the side panel: how many of a file's changed lines are marked read. */
export type FileReviewProgress = { reviewed: number; total: number }

const EMPTY_HASHES = new Map<string, Map<number, string>>()

/**
 * Local-only "already read this line" marks for the review grid (correction or QA stage). Marks are
 * personal, persisted in the Tauri store keyed by (branch, file, content hash), and never sent to the
 * server — see `modules/qa-review/reviewedLines`. Marks are content-anchored, so an edited line drops
 * its mark (its hash changes) and is treated as unreviewed again, mirroring Beta QA verdicts.
 *
 * Given every file's changed lines, this hashes each line once per session and returns per-file
 * progress (for the side panel) plus, per file, the set of changed line numbers currently marked, and a
 * toggle that writes through to the store.
 */
export const useQaReviewedLines = (branch: string | undefined, changedLinesByFile: Map<string, Line[]> | undefined) => {
  const queryClient = useQueryClient()
  const marksQueryKey = ['qa-reviewed-lines', branch]

  // The stored hashes for this branch, grouped by file. Refetched after every toggle.
  const marks = useQuery({
    queryKey: marksQueryKey,
    queryFn: () => getReviewedLinesForBranch(branch ?? ''),
    enabled: !!branch
  })

  // A changed line's content is a stable snapshot within a session; fingerprint the diff so the hashes
  // only recompute when the underlying changed lines actually change.
  const fingerprint = useMemo(
    () =>
      changedLinesByFile
        ? [...changedLinesByFile.entries()].map(([path, lines]) => `${path}:${lines.length}`).join('|')
        : '',
    [changedLinesByFile]
  )

  // Hash every changed line of every file → Map<filePath, Map<lineNumber, hash>>. Cached for the session.
  const hashes = useQuery({
    queryKey: ['qa-reviewed-hashes', branch, fingerprint],
    queryFn: async () => {
      const result = new Map<string, Map<number, string>>()
      for (const [path, lines] of changedLinesByFile ?? new Map<string, Line[]>()) {
        const entries = await Promise.all(
          lines.map(async (line) => [line.lineNumber, await hashBetaLine(line.original, line.translated)] as const)
        )
        result.set(path, new Map(entries))
      }
      return result
    },
    enabled: !!branch && !!changedLinesByFile,
    staleTime: Infinity
  })

  const { countsByFile, reviewedLineNumbersByFile } = useMemo(() => {
    const counts = new Map<string, FileReviewProgress>()
    const reviewedLineNumbers = new Map<string, Set<number>>()

    for (const [path, lineHashes] of hashes.data ?? EMPTY_HASHES) {
      const reviewedSet = new Set(marks.data?.[path] ?? [])
      const linesReviewed = new Set<number>()
      for (const [lineNumber, hash] of lineHashes) {
        if (reviewedSet.has(hash)) linesReviewed.add(lineNumber)
      }
      counts.set(path, { reviewed: linesReviewed.size, total: lineHashes.size })
      reviewedLineNumbers.set(path, linesReviewed)
    }

    return { countsByFile: counts, reviewedLineNumbersByFile: reviewedLineNumbers }
  }, [hashes.data, marks.data])

  const toggle = useMutation({
    mutationFn: async ({ filePath, line }: { filePath: string; line: Line }) => {
      if (!branch) throw new Error('No branch provided')
      const hash = hashes.data?.get(filePath)?.get(line.lineNumber)
      if (!hash) throw new Error(`No hash for line ${line.lineNumber} of ${filePath}`)
      await toggleReviewedLine(branch, filePath, hash)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: marksQueryKey })
  })

  return {
    countsByFile,
    reviewedLineNumbersByFile,
    toggleReviewed: (filePath: string, line: Line) => toggle.mutate({ filePath, line })
  }
}
