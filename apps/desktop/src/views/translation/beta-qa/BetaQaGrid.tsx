import { AgGridReact } from 'ag-grid-react'
import { CellFocusedEvent, GridApi, GridReadyEvent, ICellRendererParams } from 'ag-grid-community'
import { useEffect, useRef } from 'react'
import { StringSearchResult } from '../../../components/StringSearch/types'
import { Line, MatchLanguages } from '../../../types/translation'
import { HighlightedText } from '../../../components/HighlightedText'
import { CheckIcon } from '../../../components/icons/CheckIcon'
import { CrossIcon } from '../../../components/icons/CrossIcon'
import { MinusIcon } from '../../../components/icons/MinusIcon'
import { LineVerdict, Verdict, isLineKo, isLineOk } from '../../../hooks/useBetaReviewMarks'
import { myTheme } from '../edit/grid-theme'

type BetaQaGridProps = {
  filteredLines: Line[]
  matchLanguage: MatchLanguages
  stringSearchResult: StringSearchResult | null
  verdicts: Map<number, LineVerdict>
  onSetVerdict: (line: Line, verdict: Verdict) => void
  onClearMine: (line: Line) => void
  onClearKo: (line: Line) => void
  onReady?: (event: GridReadyEvent<Line>) => void
  onCellFocused: (event: CellFocusedEvent<Line, any>) => void
  onRowDataChanged: (value: Line[]) => void
}

const NO_VERDICT: LineVerdict = { okCount: 0, koCount: 0, myVerdict: null }

const LANGUAGE_COLUMNS = {
  en: 'original',
  fr: 'translated'
} as const

/**
 * Read-only grid for the Beta QA page: shows each line's original (VO) and translated (VF)
 * side-by-side, with the shared string-search highlight, and a per-line OK/KO verdict control.
 * No editing of the text — the `beta` snapshot is browsed, never modified.
 *
 * Each row's verdict control is two mutually-exclusive toggles reflecting the caller's own verdict:
 * clicking an inactive OK/KO sets it; clicking the lit OK clears the caller's own verdict; clicking
 * the lit KO triggers the line-level KO clear (every QA's KO on the line). KO lines stand out via a
 * row highlight (KO prevails over any OK count).
 */
export const BetaQaGrid = ({
  filteredLines,
  matchLanguage,
  stringSearchResult,
  verdicts,
  onSetVerdict,
  onClearMine,
  onClearKo,
  onReady,
  onCellFocused,
  onRowDataChanged
}: BetaQaGridProps) => {
  const gridApi = useRef<GridApi<Line> | null>(null)
  // The KO-prevails row class is evaluated by rowClassRules, which read the latest verdicts via this
  // ref (the rule closure is created once but must see fresh data on every redraw).
  const verdictsRef = useRef(verdicts)
  verdictsRef.current = verdicts

  useEffect(() => {
    onRowDataChanged(filteredLines)
  }, [filteredLines])

  // Verdicts live outside the row data, so when they change refresh the verdict column and re-evaluate
  // the KO-prevails row styling (redrawRows re-applies rowClassRules).
  useEffect(() => {
    gridApi.current?.refreshCells({ force: true, columns: ['review'] })
    gridApi.current?.redrawRows()
  }, [verdicts])

  const customCellRenderer = (params: ICellRendererParams) => {
    const cellText: string = params.value

    if (params.node.rowIndex == null || !params.data) return cellText

    const isHighlightedColumn = params.colDef?.field === LANGUAGE_COLUMNS[matchLanguage]
    if (!isHighlightedColumn) return <p className="block h-full leading-6">{cellText}</p>

    return <HighlightedText text={cellText} rowIndex={params.node.rowIndex} searchResult={stringSearchResult} />
  }

  // Verdict control: one tri-state segmented toggle reflecting the caller's own verdict —
  // KO (testée, bug trouvé) · non relu · OK (testée, aucun bug) — left to right. The lit segment is
  // the caller's current verdict; clicking KO/OK sets (or flips) it, clicking the middle returns the
  // line to non relu. "Non relu" is line-aware: on a KO line it resolves the line's KO for everyone
  // (line-level clear, ADR 0002); otherwise it just clears the caller's own verdict (misclick).
  //
  // The segmented control is a fixed-size box (segments keep their box across the inactive→active
  // colour flip) and the count sits in a fixed-width slot, so the cell never reflows. Per QA request
  // the validation (OK) tally only shows when the line is NOT in error; a KO line shows its KO tally
  // instead (a green "5 validations" on a flagged line would read as a contradiction).
  const reviewCellRenderer = (params: ICellRendererParams<Line>) => {
    if (!params.data) return null
    const line = params.data
    const { okCount, koCount, myVerdict } = verdicts.get(line.lineNumber) ?? NO_VERDICT
    const koLit = myVerdict === 'KO'
    const unread = myVerdict === null
    const okLit = myVerdict === 'OK'
    const lineInError = koCount > 0

    // Middle "non relu": resolve the line's KO for everyone if it's flagged, else drop my own verdict.
    const returnToUnread = () => (lineInError ? onClearKo(line) : myVerdict !== null && onClearMine(line))

    // Every segment shares the exact same base classes (size never changes); only the background and
    // icon colour vary between the inactive and the lit state, so the lit segment never grows.
    const segment = 'flex items-center justify-center w-7 h-6 transition-colors [&_svg]:size-4 cursor-pointer'

    return (
      <div className="flex items-center gap-2 h-full leading-6">
        <div className="flex items-center rounded-md border border-base-content/20 overflow-hidden">
          <button
            type="button"
            aria-label="Marquer : testée, bug trouvé"
            title="Testée, bug trouvé"
            className={`${segment} border-r border-base-content/20 ${koLit ? 'bg-error text-error-content' : 'text-error hover:bg-error/10'}`}
            onClick={() => !koLit && onSetVerdict(line, 'KO')}
          >
            <CrossIcon />
          </button>
          <button
            type="button"
            aria-label={lineInError ? 'Résoudre le KO de cette ligne' : 'Remettre en non relu'}
            title={
              lineInError
                ? 'Résoudre le KO (efface le KO de tous les QA et remet la ligne en non relu)'
                : 'Non relu — annuler votre verdict'
            }
            className={`${segment} border-r border-base-content/20 ${unread ? 'bg-base-content/15 text-base-content' : 'text-base-content/40 hover:bg-base-content/10'}`}
            onClick={returnToUnread}
          >
            <MinusIcon />
          </button>
          <button
            type="button"
            aria-label="Marquer : testée, aucun bug"
            title="Testée, aucun bug"
            className={`${segment} ${okLit ? 'bg-success text-success-content' : 'text-success hover:bg-success/10'}`}
            onClick={() => !okLit && onSetVerdict(line, 'OK')}
          >
            <CheckIcon />
          </button>
        </div>
        <span className="w-5 flex justify-center text-xs tabular-nums">
          {!lineInError && okCount > 0 && (
            <span className="badge badge-xs badge-success font-medium" title="QA ayant validé cette ligne">
              {okCount}
            </span>
          )}
        </span>
      </div>
    )
  }

  return (
    <AgGridReact
      animateRows={false}
      onCellFocused={onCellFocused}
      onGridReady={(e) => {
        gridApi.current = e.api
        onReady?.(e)
      }}
      theme={myTheme}
      headerHeight={36}
      className="w-full max-w-[1700px] relative h-[calc(100svh-200px)]"
      rowData={filteredLines}
      getRowId={({ data }) => !!data && data.lineNumber.toString()}
      rowClassRules={{
        'beta-qa-ko-row': (params) =>
          !!params.data && isLineKo(verdictsRef.current.get(params.data.lineNumber) ?? NO_VERDICT),
        'beta-qa-ok-row': (params) =>
          !!params.data && isLineOk(verdictsRef.current.get(params.data.lineNumber) ?? NO_VERDICT)
      }}
      columnDefs={[
        { field: 'lineNumber', headerName: 'N°', width: 80, sortable: false, cellClass: 'leading-6!' },
        {
          field: 'original',
          headerName: 'Version anglaise',
          autoHeight: true,
          wrapText: true,
          flex: 1,
          sortable: false,
          cellClass: 'leading-6!',
          cellRenderer: customCellRenderer
        },
        {
          field: 'translated',
          headerName: 'Version française',
          autoHeight: true,
          wrapText: true,
          flex: 1,
          sortable: false,
          cellClass: 'leading-6!',
          cellRenderer: customCellRenderer
        },
        {
          colId: 'review',
          headerName: 'Verdict',
          width: 132,
          sortable: false,
          cellClass: 'leading-6!',
          cellRenderer: reviewCellRenderer
        }
      ]}
    />
  )
}
