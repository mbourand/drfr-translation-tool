import { useMemo } from 'react'
import { LineReviewCount } from '../../../hooks/useBetaReviewMarks'

type ReviewDepthDistributionProps = {
  counts: Map<number, LineReviewCount>
}

/**
 * Per-file review-depth distribution for the currently-viewed `beta` file (PRD #5, story 11).
 * Derived entirely client-side from the same `counts` response the grid already uses — no dedicated
 * endpoint, no global rollup. The distribution is cumulative: "≥ N×" is the number of reviewable
 * lines that at least N distinct QAs have verified, so each threshold is a subset of the one before.
 */
export const ReviewDepthDistribution = ({ counts }: ReviewDepthDistributionProps) => {
  const { total, unreviewed, thresholds } = useMemo(() => {
    const lineCounts = Array.from(counts.values(), (c) => c.count)
    const maxDepth = lineCounts.reduce((max, c) => Math.max(max, c), 0)
    // Always show at least the "≥ 1×" threshold so an untouched file reads "0" rather than blank.
    const depths = Array.from({ length: Math.max(maxDepth, 1) }, (_, i) => i + 1)

    return {
      total: lineCounts.length,
      unreviewed: lineCounts.filter((c) => c === 0).length,
      thresholds: depths.map((depth) => ({ depth, lines: lineCounts.filter((c) => c >= depth).length }))
    }
  }, [counts])

  if (total === 0) return null

  return (
    <div className="flex flex-row flex-wrap items-center gap-2 w-full max-w-[1700px] pb-3 text-sm">
      <span className="font-medium">Profondeur de relecture de ce fichier :</span>
      <span className="badge badge-sm badge-ghost" title="Lignes qu'aucun QA n'a encore relues">
        Non relu {unreviewed} / {total}
      </span>
      {thresholds.map(({ depth, lines }) => (
        <span
          key={depth}
          className="badge badge-sm badge-primary"
          title={`Lignes relues par au moins ${depth} QA distinct${depth > 1 ? 's' : ''}`}
        >
          ≥ {depth}× : {lines}
        </span>
      ))}
    </div>
  )
}
