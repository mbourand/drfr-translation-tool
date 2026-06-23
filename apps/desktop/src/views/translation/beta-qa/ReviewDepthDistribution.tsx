import { useMemo } from 'react'
import { LineVerdict, isLineKo } from '../../../hooks/useBetaReviewMarks'

type ReviewDepthDistributionProps = {
  verdicts: Map<number, LineVerdict>
}

/**
 * Per-file Beta QA summary for the currently-viewed `beta` file. Derived entirely client-side from
 * the same counts the grid already uses — no dedicated endpoint, no global rollup.
 *
 * Three mutually-exclusive buckets that partition the file (they sum to the total reviewable lines):
 *  - **Non relu**: no verdict from anyone (okCount 0 and koCount 0).
 *  - **KO**: at least one KO (KO prevails — a KO line is never counted in Non relu or OK-depth).
 *  - **OK-depth ladder** (`≥ N×`): non-KO lines that at least N distinct QAs marked OK. Cumulative,
 *    so each threshold is a subset of the one before.
 */
export const ReviewDepthDistribution = ({ verdicts }: ReviewDepthDistributionProps) => {
  const { total, nonRelu, ko, thresholds } = useMemo(() => {
    const lines = Array.from(verdicts.values())
    const okOnlyDepths = lines.filter((v) => !isLineKo(v)).map((v) => v.okCount)
    const maxDepth = okOnlyDepths.reduce((max, c) => Math.max(max, c), 0)
    // Always show at least the "≥ 1×" threshold so an untouched file reads "0" rather than blank.
    const depths = Array.from({ length: Math.max(maxDepth, 1) }, (_, i) => i + 1)

    return {
      total: lines.length,
      nonRelu: lines.filter((v) => v.okCount === 0 && v.koCount === 0).length,
      ko: lines.filter(isLineKo).length,
      // OK-depth counts OK verdicts on non-KO lines only (KO lines live solely in the KO bucket).
      thresholds: depths.map((depth) => ({ depth, lines: okOnlyDepths.filter((c) => c >= depth).length }))
    }
  }, [verdicts])

  if (total === 0) return null

  return (
    <div className="flex flex-row flex-wrap items-center gap-2 text-sm">
      <span className="font-medium">Relecture de ce fichier :</span>
      <span className="badge badge-sm badge-ghost" title="Lignes qu'aucun QA n'a encore testées">
        Non relu {nonRelu} / {total}
      </span>
      <span className="badge badge-sm badge-error" title="Lignes signalées KO par au moins un QA">
        KO {ko}
      </span>
      {thresholds.map(({ depth, lines }) => (
        <span
          key={depth}
          className="badge badge-sm badge-primary"
          title={`Lignes confirmées OK par au moins ${depth} QA distinct${depth > 1 ? 's' : ''} (hors KO)`}
        >
          ≥ {depth}× : {lines}
        </span>
      ))}
    </div>
  )
}
