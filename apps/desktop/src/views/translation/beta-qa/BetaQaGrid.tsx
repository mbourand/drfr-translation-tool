import { AgGridReact } from 'ag-grid-react'
import { CellFocusedEvent, GridApi, GridReadyEvent, ICellRendererParams } from 'ag-grid-community'
import { useEffect, useRef } from 'react'
import { StringSearchResult } from '../../../components/StringSearch/types'
import { Line, MatchLanguages } from '../../../types/translation'
import { HighlightedText } from '../../../components/HighlightedText'
import { LineReviewCount } from '../../../hooks/useBetaReviewMarks'
import { myTheme } from '../edit/grid-theme'

type BetaQaGridProps = {
  filteredLines: Line[]
  matchLanguage: MatchLanguages
  stringSearchResult: StringSearchResult | null
  counts: Map<number, LineReviewCount>
  onToggleMark: (line: Line, markedByMe: boolean) => void
  onReady?: (event: GridReadyEvent<Line>) => void
  onCellFocused: (event: CellFocusedEvent<Line, any>) => void
  onRowDataChanged: (value: Line[]) => void
}

const NO_COUNT: LineReviewCount = { count: 0, markedByMe: false }

const LANGUAGE_COLUMNS = {
  en: 'original',
  fr: 'translated'
} as const

/**
 * Read-only grid for the Beta QA page: shows each line's original (VO) and translated (VF)
 * side-by-side, with the shared string-search highlight. No editing, no comments — the `beta`
 * snapshot is browsed, never modified. The per-line review-count column lands in a later slice.
 */
export const BetaQaGrid = ({
  filteredLines,
  matchLanguage,
  stringSearchResult,
  counts,
  onToggleMark,
  onReady,
  onCellFocused,
  onRowDataChanged
}: BetaQaGridProps) => {
  const gridApi = useRef<GridApi<Line> | null>(null)

  useEffect(() => {
    onRowDataChanged(filteredLines)
  }, [filteredLines])

  // Counts live outside the row data, so refresh the review column when they change (mark/unmark).
  useEffect(() => {
    gridApi.current?.refreshCells({ force: true, columns: ['review'] })
  }, [counts])

  const customCellRenderer = (params: ICellRendererParams) => {
    const cellText: string = params.value

    if (params.node.rowIndex == null || !params.data) return cellText

    const isHighlightedColumn = params.colDef?.field === LANGUAGE_COLUMNS[matchLanguage]
    if (!isHighlightedColumn) return <p className="block h-full leading-6">{cellText}</p>

    return <HighlightedText text={cellText} rowIndex={params.node.rowIndex} searchResult={stringSearchResult} />
  }

  const reviewCellRenderer = (params: ICellRendererParams<Line>) => {
    if (!params.data) return null
    const line = params.data
    const { count, markedByMe } = counts.get(line.lineNumber) ?? NO_COUNT

    return (
      <div className="flex items-center gap-2 h-full leading-6">
        <input
          type="checkbox"
          className="checkbox checkbox-sm"
          checked={markedByMe}
          onChange={() => onToggleMark(line, markedByMe)}
          title={markedByMe ? 'Vous avez relu cette ligne' : 'Marquer comme relue'}
        />
        <span className="badge badge-sm badge-ghost" title="Nombre de QA distincts ayant relu cette ligne">
          {count}
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
          headerName: 'Relu',
          width: 110,
          sortable: false,
          cellClass: 'leading-6!',
          cellRenderer: reviewCellRenderer
        }
      ]}
    />
  )
}
