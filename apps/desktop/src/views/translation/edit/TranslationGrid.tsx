import { AgGridReact } from 'ag-grid-react'
import {
  CellContextMenuEvent,
  CellFocusedEvent,
  GridReadyEvent,
  ICellRendererParams,
  NewValueParams
} from 'ag-grid-community'
import { myTheme } from './grid-theme'
import { Line, MatchLanguages } from '../../../types/translation'
import { StringSearchResult } from '../../../components/StringSearch/types'
import { HighlightedText } from '../../../components/HighlightedText'
import { useCallback, useState } from 'react'
import { twMerge } from 'tailwind-merge'
import { ContextMenu, ContextMenuAction } from './ContextMenu'

type ContextMenuState = {
  x: number
  y: number
  actions: ContextMenuAction[]
} | null

type TranslationGridProps = {
  linesToShow: Line[]
  changedLineNumbers: number[]
  onLineEdited: (event: NewValueParams<Line, any>) => void
  onReady?: (event: GridReadyEvent<Line>) => void
  onCellFocused?: (event: CellFocusedEvent<Line, any>) => void
  translatedStringSearchResult: StringSearchResult | null
  matchLanguage: MatchLanguages
  onResetToCommit?: (lineNumber: number) => void
  onResetToMaster?: (lineNumber: number) => void
  getMasterValue?: (lineNumber: number) => string | undefined
  getValueAtBranchCreation?: (lineNumber: number) => string | undefined
  editable?: boolean
  className?: string
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
  getValueAtBranchCreation,
  editable = true,
  className
}: TranslationGridProps) => {
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null)

  const handleCellContextMenu = useCallback(
    (event: CellContextMenuEvent<Line>) => {
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
    if (params.node.rowIndex == null) return params.value
    return (
      <HighlightedText text={params.value} rowIndex={params.node.rowIndex} searchResult={translatedStringSearchResult} />
    )
  }

  return (
    <>
      <AgGridReact
        onGridReady={onReady}
        theme={myTheme}
        preventDefaultOnContextMenu={true}
        headerHeight={36}
        className={twMerge('w-full max-w-[1700px] relative h-[calc(100svh-200px)]', className)}
        rowData={linesToShow}
        rowClassRules={{
          'ag-cell-changed': ({ data }) => {
            if (!data) return false
            if (changedLineNumbers.includes(data.lineNumber)) return true
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
            editable,
            sortable: false,
            cellEditor: editable ? 'agTextCellEditor' : undefined,
            cellClass: 'leading-6!',
            onCellValueChanged: editable ? onLineEdited : undefined,
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
