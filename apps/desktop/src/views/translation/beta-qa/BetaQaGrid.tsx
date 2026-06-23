import { AgGridReact } from 'ag-grid-react'
import { CellFocusedEvent, GridApi, GridReadyEvent, ICellRendererParams } from 'ag-grid-community'
import { useEffect, useRef } from 'react'
import { StringSearchResult } from '../../../components/StringSearch/types'
import { Line, MatchLanguages } from '../../../types/translation'
import { HighlightedText } from '../../../components/HighlightedText'
import { CheckIcon } from '../../../components/icons/CheckIcon'
import { BugIcon } from '../../../components/icons/BugIcon'
import { LineVerdict, Verdict, isLineKo } from '../../../hooks/useBetaReviewMarks'
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

  // Icon-only OK/KO toggles: a check (tested, no bug) and a bug (tested, bug found). Each is a fixed-
  // size square button so the cell never reflows; the distinct-QA count sits in a fixed-width slot
  // beside it (empty, not removed, at 0) for the same reason. Inactive = coloured outline (clear
  // affordance + good contrast); the caller's own verdict shows as the matching filled button.
  const reviewCellRenderer = (params: ICellRendererParams<Line>) => {
    if (!params.data) return null
    const line = params.data
    const { okCount, koCount, myVerdict } = verdicts.get(line.lineNumber) ?? NO_VERDICT
    const okLit = myVerdict === 'OK'
    const koLit = myVerdict === 'KO'

    return (
      <div className="flex items-center gap-1 h-full leading-6">
        <button
          type="button"
          aria-label={okLit ? 'Annuler votre verdict' : 'Marquer : testée, aucun bug'}
          title={okLit ? 'Testée, aucun bug — cliquez pour annuler votre verdict' : 'Testée, aucun bug'}
          className={`btn btn-sm btn-square [&_svg]:size-5 ${okLit ? 'btn-success' : 'btn-outline btn-success'}`}
          onClick={() => (okLit ? onClearMine(line) : onSetVerdict(line, 'OK'))}
        >
          <CheckIcon />
        </button>
        <span className="w-4 text-center text-xs tabular-nums text-base-content/70" title="QA ayant validé cette ligne">
          {okCount > 0 ? okCount : ''}
        </span>
        <button
          type="button"
          aria-label={koLit ? 'Résoudre le KO de cette ligne' : 'Marquer : testée, bug trouvé'}
          title={
            koLit
              ? 'Bug signalé — cliquez pour résoudre le KO (efface le KO de tous les QA)'
              : 'Testée, bug trouvé'
          }
          className={`btn btn-sm btn-square [&_svg]:size-5 ${koLit ? 'btn-error' : 'btn-outline btn-error'}`}
          onClick={() => (koLit ? onClearKo(line) : onSetVerdict(line, 'KO'))}
        >
          <BugIcon />
        </button>
        <span className="w-4 text-center text-xs tabular-nums text-base-content/70" title="QA ayant signalé un bug">
          {koCount > 0 ? koCount : ''}
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
          !!params.data && isLineKo(verdictsRef.current.get(params.data.lineNumber) ?? NO_VERDICT)
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
          width: 130,
          sortable: false,
          cellClass: 'leading-6!',
          cellRenderer: reviewCellRenderer
        }
      ]}
    />
  )
}
