import { LineVerdict, isLineKo, isLineOk } from '../../../hooks/useBetaReviewMarks'

/** Which verdict bucket the grid is filtered down to. */
export type BetaFilterKind = 'all' | 'nonRelu' | 'ko' | 'ok'

/** Beta-QA filter state. `minDepth` only bites when `kind === 'ok'` (validé par ≥ N QA distincts). */
export type BetaFilterState = { kind: BetaFilterKind; minDepth: number }

export const DEFAULT_FILTER: BetaFilterState = { kind: 'all', minDepth: 1 }

const NO_VERDICT: LineVerdict = { okCount: 0, koCount: 0, myVerdict: null }

const isNonRelu = (v: LineVerdict) => v.okCount === 0 && v.koCount === 0

/** Does a single line's verdict pass the active filter? */
export const passesFilter = (verdict: LineVerdict | undefined, filter: BetaFilterState): boolean => {
  const v = verdict ?? NO_VERDICT
  switch (filter.kind) {
    case 'all':
      return true
    case 'nonRelu':
      return isNonRelu(v)
    case 'ko':
      return isLineKo(v)
    case 'ok':
      return isLineOk(v) && v.okCount >= filter.minDepth
  }
}

/**
 * One file's verdict summary, derived from the same per-line counts the grid uses. The three primary
 * buckets (nonRelu / ko / okAny) partition the file and sum to `total` (KO prevails over OK).
 */
export type BetaSummary = {
  total: number
  nonRelu: number
  ko: number
  /** Non-KO lines validated by at least one QA. */
  okAny: number
  /** Highest distinct-QA OK count seen on any non-KO line (≥ 1). */
  maxDepth: number
  /** Fraction of the file touched by anyone (1 - nonRelu/total), 0..1. */
  coverage: number
}

export const summarize = (verdicts: Map<number, LineVerdict>): BetaSummary => {
  const lines = Array.from(verdicts.values())
  const total = lines.length
  const maxDepth = Math.max(1, lines.filter((v) => !isLineKo(v)).reduce((max, v) => Math.max(max, v.okCount), 0))

  return {
    total,
    nonRelu: lines.filter(isNonRelu).length,
    ko: lines.filter(isLineKo).length,
    okAny: lines.filter(isLineOk).length,
    maxDepth,
    coverage: total === 0 ? 0 : (total - lines.filter(isNonRelu).length) / total
  }
}
