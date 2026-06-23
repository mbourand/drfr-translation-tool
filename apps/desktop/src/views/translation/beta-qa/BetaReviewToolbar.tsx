import { LineVerdict } from '../../../hooks/useBetaReviewMarks'
import { BetaFilterKind, BetaFilterState, BetaSummary, passesFilter } from './betaMetrics'

type BetaReviewToolbarProps = {
  summary: BetaSummary
  filter: BetaFilterState
  onFilterChange: (filter: BetaFilterState) => void
  /** Verdicts of the file's reviewable lines, to compute the live "affichées N / total" count. */
  verdicts: LineVerdict[]
  fileName: string
}

const SEGMENTS: { kind: BetaFilterKind; label: string }[] = [
  { kind: 'all', label: 'Tout' },
  { kind: 'nonRelu', label: 'Non relu' },
  { kind: 'ko', label: 'KO' },
  { kind: 'ok', label: 'OK' }
]

/**
 * Filters + metrics strip above the Beta-QA grid. A segmented control picks the verdict bucket
 * (Tout / Non relu / KO / OK); picking OK reveals a depth slider to require ≥ N distinct QA
 * validations. Metrics are a live "affichées N / total" readout and a radial coverage gauge
 * (lignes relues par au moins un QA). All filtering is client-side over the already-loaded verdicts.
 */
export const BetaReviewToolbar = ({ summary, filter, onFilterChange, verdicts, fileName }: BetaReviewToolbarProps) => {
  const { total, ko, maxDepth, coverage } = summary
  const shown = verdicts.filter((v) => passesFilter(v, filter)).length

  return (
    <div className="w-full max-w-[1700px] flex flex-row flex-wrap items-center gap-4 pb-2">
      <span className="text-sm font-medium whitespace-nowrap">{fileName}</span>

      <div className="join">
        {SEGMENTS.map(({ kind, label }) => (
          <button
            key={kind}
            type="button"
            onClick={() => onFilterChange({ ...filter, kind })}
            className={`join-item btn btn-sm ${filter.kind === kind ? 'btn-primary' : 'btn-ghost border border-base-content/15'}`}
          >
            {label}
            {kind === 'ko' && ko > 0 && <span className="badge badge-xs badge-error ml-1">{ko}</span>}
          </button>
        ))}
      </div>

      {filter.kind === 'ok' && (
        <label className="flex items-center gap-2 text-sm">
          <span className="opacity-70 whitespace-nowrap">≥ {filter.minDepth} QA</span>
          <input
            type="range"
            min={1}
            max={maxDepth}
            value={filter.minDepth}
            onChange={(e) => onFilterChange({ ...filter, minDepth: Number(e.target.value) })}
            className="range range-primary range-xs w-40"
          />
          <span className="opacity-70 whitespace-nowrap">≤ {maxDepth}</span>
        </label>
      )}

      <div className="flex items-center gap-3 ml-auto text-sm">
        <span className="tabular-nums">
          <span className="font-semibold">{shown}</span>
          <span className="opacity-60"> / {total} lignes</span>
        </span>
        <div
          className="radial-progress text-primary"
          style={
            {
              '--value': Math.round(coverage * 100),
              '--size': '2.75rem',
              '--thickness': '4px'
            } as React.CSSProperties
          }
          role="progressbar"
          title="Lignes relues par au moins un QA"
        >
          <span className="text-[0.65rem] tabular-nums">{Math.round(coverage * 100)}%</span>
        </div>
      </div>
    </div>
  )
}
