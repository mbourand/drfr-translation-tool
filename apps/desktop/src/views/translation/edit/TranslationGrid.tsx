import { AgGridReact } from 'ag-grid-react'
import {
  CellContextMenuEvent,
  CellFocusedEvent,
  GridReadyEvent,
  ICellRendererParams,
  NewValueParams
} from 'ag-grid-community'
import { myTheme } from './grid-theme'
import { LineType, MatchLanguages } from './types'
import { StringSearchResult } from '../../../components/StringSearch/types'
import { getParts } from '../../../string-search/get-parts'
import { useCallback, useState } from 'react'
import { ContextMenu, ContextMenuAction } from './ContextMenu'

type ContextMenuState = {
  x: number
  y: number
  actions: ContextMenuAction[]
} | null

type TranslationGridProps = {
  linesToShow: LineType[]
  changedLineNumbers: number[]
  onLineEdited: (event: NewValueParams<LineType, any>) => void
  onReady?: (event: GridReadyEvent<LineType>) => void
  onCellFocused?: (event: CellFocusedEvent<LineType, any>) => void
  translatedStringSearchResult: StringSearchResult | null
  matchLanguage: MatchLanguages
  onResetToCommit?: (lineNumber: number) => void
  onResetToMaster?: (lineNumber: number) => void
  getMasterValue?: (lineNumber: number) => string | undefined
  getValueAtBranchCreation?: (lineNumber: number) => string | undefined
}

export const TranslationGrid = ({
  linesToShow,
  changedLineNumbers,
  onLineEdited,
  onReady,
  translatedStringSearchResult,
  matchLanguage,
  onCellFocused,
  onResetToCommit,
  onResetToMaster,
  getMasterValue,
  getValueAtBranchCreation
}: TranslationGridProps) => {
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null)

  const handleCellContextMenu = useCallback(
    (event: CellContextMenuEvent<LineType>) => {
      if (!event.data || event.column?.getColId() !== 'translated') return

      const mouseEvent = event.event as MouseEvent
      mouseEvent.preventDefault()

      const lineNumber = event.data.lineNumber
      const isChanged = changedLineNumbers.includes(lineNumber)
      const masterValue = getMasterValue?.(lineNumber)
      const masterDiffersFromCurrent = masterValue !== undefined && masterValue !== event.data.translated

      const actions: ContextMenuAction[] = [
        {
          label: 'Réinitialiser au dernier commit',
          onClick: () => onResetToCommit?.(lineNumber),
          disabled: !isChanged
        },
        {
          label: 'Réinitialiser à master',
          onClick: () => onResetToMaster?.(lineNumber),
          disabled: !masterDiffersFromCurrent
        }
      ]

      setContextMenu({ x: mouseEvent.clientX, y: mouseEvent.clientY, actions })
    },
    [changedLineNumbers, getMasterValue, onResetToCommit, onResetToMaster]
  )

  const customCellRenderer = (params: ICellRendererParams) => {
    const cellText: string = params.value

    if (params.node.rowIndex == null || !translatedStringSearchResult) return cellText

    const rowIndex = params.node.rowIndex

    const rowMatches = translatedStringSearchResult.matches.get(rowIndex)

    if (!rowMatches) return cellText

    const pattern = translatedStringSearchResult.pattern
    const parts = getParts(rowMatches, pattern.length, cellText.length)

    const getMatchColor = (rowIndex: number, charIndex: number) => {
      return translatedStringSearchResult.selectedMatch?.rowIndex == rowIndex &&
        translatedStringSearchResult.selectedMatch?.charIndex == charIndex
        ? 'orange'
        : 'yellow'
    }

    return (
      <span>
        {parts.map(({ start, end, isMatch }, i) => {
          const part = cellText.slice(start, end)
          if (isMatch) {
            return (
              <span key={i} style={{ backgroundColor: getMatchColor(rowIndex, start), color: 'black' }}>
                {part}
              </span>
            )
          }
          return <span key={i}>{part}</span>
        })}
      </span>
    )
  }

  return (
    <>
      <AgGridReact
        onGridReady={onReady}
        theme={myTheme}
        preventDefaultOnContextMenu={true}
        headerHeight={36}
        className="w-full max-w-[1700px] relative h-[calc(100svh-200px)]"
        rowData={linesToShow}
        rowClassRules={{
          'ag-cell-changed': ({ data }) => {
            if (!data) return false
            if (changedLineNumbers.includes(data.lineNumber)) return false
            const valueAtCreation = getValueAtBranchCreation?.(data.lineNumber)
            return valueAtCreation !== undefined && valueAtCreation !== data.translated
          }
        }}
        onCellFocused={onCellFocused}
        onCellContextMenu={handleCellContextMenu}
        columnDefs={[
          { field: 'lineNumber', headerName: 'N°', width: 80, sortable: false },
          {
            field: 'original',
            headerName: 'Version anglaise',
            autoHeight: true,
            wrapText: true,
            flex: 1,
            cellClass: 'leading-6!',
            sortable: false,
            cellRenderer: matchLanguage === 'en' ? customCellRenderer : undefined
          },
          {
            field: 'translated',
            headerName: 'Version française',
            autoHeight: true,
            wrapText: true,
            flex: 1,
            editable: true,
            sortable: false,
            cellEditor: 'agTextCellEditor',
            cellClass: 'leading-6!',
            onCellValueChanged: onLineEdited,
            cellRenderer: matchLanguage === 'fr' ? customCellRenderer : undefined
          }
        ]}
      />
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          actions={contextMenu.actions}
          onClose={() => setContextMenu(null)}
        />
      )}
    </>
  )
}
