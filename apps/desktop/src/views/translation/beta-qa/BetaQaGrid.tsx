import { AgGridReact } from 'ag-grid-react'
import { CellFocusedEvent, GridApi, GridReadyEvent, ICellRendererParams } from 'ag-grid-community'
import { useEffect, useRef } from 'react'
import { StringSearchResult } from '../../../components/StringSearch/types'
import { Line, MatchLanguages } from '../../../types/translation'
import { HighlightedText } from '../../../components/HighlightedText'
import { CheckIcon } from '../../../components/icons/CheckIcon'
import { CrossIcon } from '../../../components/icons/CrossIcon'
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

  // Verdict control: a small check (testée, aucun bug) and cross (testée, bug trouvé) toggle pair,
  // then the two distinct-QA tallies as colour-coded badges. Controls on the left, counts on the
  // right reads cleaner than a number wedged between the buttons. Everything sits in fixed-size slots
  // so the cell never reflows: the square buttons keep their box across the inactive→active flip, and
  // each count lives in a fixed-width slot that stays present (just empty) at 0. Inactive toggles keep
  // their semantic colour on the icon (clear + readable); the caller's own verdict shows filled.
  const reviewCellRenderer = (params: ICellRendererParams<Line>) => {
    if (!params.data) return null
    const line = params.data
    const { okCount, koCount, myVerdict } = verdicts.get(line.lineNumber) ?? NO_VERDICT
    const okLit = myVerdict === 'OK'
    const koLit = myVerdict === 'KO'

    return (
      <div className="flex items-center gap-2 h-full leading-6">
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            aria-label={okLit ? 'Annuler votre verdict' : 'Marquer : testée, aucun bug'}
            title={okLit ? 'Testée, aucun bug — cliquez pour annuler votre verdict' : 'Testée, aucun bug'}
            className={`btn btn-xs btn-square [&_svg]:size-4 ${okLit ? 'btn-success' : 'btn-ghost text-success'}`}
            onClick={() => (okLit ? onClearMine(line) : onSetVerdict(line, 'OK'))}
          >
            <CheckIcon />
          </button>
          <button
            type="button"
            aria-label={koLit ? 'Résoudre le KO de cette ligne' : 'Marquer : testée, bug trouvé'}
            title={
              koLit
                ? 'Bug signalé — cliquez pour résoudre le KO (efface le KO de tous les QA)'
                : 'Testée, bug trouvé'
            }
            className={`btn btn-xs btn-square [&_svg]:size-4 ${koLit ? 'btn-error' : 'btn-ghost text-error'}`}
            onClick={() => (koLit ? onClearKo(line) : onSetVerdict(line, 'KO'))}
          >
            <CrossIcon />
          </button>
        </div>
        <div className="flex items-center gap-1 text-xs tabular-nums">
          <span className="w-5 flex justify-center" title="QA ayant validé cette ligne">
            {okCount > 0 && <span className="badge badge-xs badge-success font-medium">{okCount}</span>}
          </span>
          <span className="w-5 flex justify-center" title="QA ayant signalé un bug">
            {koCount > 0 && <span className="badge badge-xs badge-error font-medium">{koCount}</span>}
          </span>
        </div>
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
          width: 112,
          sortable: false,
          cellClass: 'leading-6!',
          cellRenderer: reviewCellRenderer
        }
      ]}
    />
  )
}
