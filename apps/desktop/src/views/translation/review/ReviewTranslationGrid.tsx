import { AgGridReact } from 'ag-grid-react'
import { CellFocusedEvent, GridApi, GridReadyEvent, ICellRendererParams, NewValueParams } from 'ag-grid-community'
import { StringSearchResult } from '../../../components/StringSearch/types'
import { Line, MatchLanguages } from '../../../types/translation'
import { myTheme } from '../edit/grid-theme'
import { useEffect, useMemo, useRef, useState } from 'react'
import { UnfoldMoreIcon } from '../../../components/icons/UnfoldMoreIcon'
import { UnfoldLessIcon } from '../../../components/icons/UnfoldLessIcon'
import { TRANSLATION_API_URLS } from '../../../routes/translation/routes'
import { z } from 'zod'
import { AddCommentIcon } from '../../../components/icons/AddCommentIcon'
import { HighlightedText } from '../../../components/HighlightedText'
import { LineCommentThread, RESOLVED_COMMENT } from './LineCommentThread'

type TranslationGridProps = {
  filteredLines: Line[]
  changedLineNumbers: number[]
  onReady?: (event: GridReadyEvent<Line>) => void
  matchLanguage: MatchLanguages
  comments: z.infer<ReturnType<(typeof TRANSLATION_API_URLS)['TRANSLATIONS']['LIST_COMMENTS']>['responseSchema']>
  onSendComment: (params: { body: string; line: number; inReplyTo?: number }) => void
  onDeleteCommentClicked: (params: { commentId: number; pullRequestNumber: number }) => void
  userLogin: string
  conflictedLinesNumber: number[]
  editable: boolean
  showAllLines?: boolean
  onLineEdited: (event: NewValueParams<Line, any>) => void
  onCellFocused: (event: CellFocusedEvent<Line, any>) => void
  onRowDataChanged: (value: Line[]) => void
  stringSearchResult: StringSearchResult | null
}

const LANGUAGE_COLUMNS = {
  en: 'original',
  fr: 'translated'
} as const

export const ReviewTranslationGrid = ({
  filteredLines,
  changedLineNumbers,
  onReady,
  comments,
  onSendComment,
  onDeleteCommentClicked,
  userLogin,
  conflictedLinesNumber,
  editable,
  onLineEdited,
  onCellFocused,
  showAllLines,
  onRowDataChanged,
  stringSearchResult,
  matchLanguage
}: TranslationGridProps) => {
  const gridApi = useRef<GridApi | null>(null)
  const [selectedChangedLine, setSelectedChangedLine] = useState<Line | null>(null)
  const lineToFocus = useRef<Line | null>(null)

  const [pinnedPosition, setPinnedPosition] = useState<'Top' | 'Bottom' | 'None'>('None')

  const commentAnswers = useRef(new Map<number, string>())
  const textAreaRefs = useRef(new Map<number, HTMLTextAreaElement | null>())

  const [addCommentToLine, setAddCommentToLine] = useState<number | null>(null)

  useEffect(() => {
    if (!gridApi.current || !lineToFocus.current) return
    const rowNode = gridApi.current.getRowNode(lineToFocus.current.lineNumber.toString())
    if (rowNode?.rowIndex == null) return
    gridApi.current.ensureIndexVisible(rowNode.rowIndex, 'middle')
    lineToFocus.current = null
  }, [selectedChangedLine?.lineNumber])

  const checkRowVisibility = (api: GridApi) => {
    if (selectedChangedLine == null) return
    const rowNode = api.getRowNode(selectedChangedLine.lineNumber.toString())
    if (!rowNode) return

    const rowTop = rowNode.rowTop
    const scrollTop = api.getVerticalPixelRange().top
    const scrollBottom = api.getVerticalPixelRange().bottom
    const rowHeight = rowNode.rowHeight

    if (rowTop == null || rowHeight == null) return

    const isTooHigh = scrollTop > rowTop + rowHeight
    const isTooLow = scrollBottom < rowTop

    if (isTooHigh) setPinnedPosition('Top')
    else if (isTooLow) setPinnedPosition('Bottom')
    else setPinnedPosition('None')
  }

  const lineNumbersToShow = useMemo(() => {
    const map = new Map<number, boolean>()
    for (const lineNumber of changedLineNumbers) map.set(lineNumber, true)
    return map
  }, [changedLineNumbers])

  const shouldOnlyShowChangedLines = selectedChangedLine === null && !showAllLines

  const rowData = useMemo(() => {
    return shouldOnlyShowChangedLines
      ? filteredLines.filter((line) => lineNumbersToShow.has(line.lineNumber))
      : filteredLines
  }, [shouldOnlyShowChangedLines, filteredLines, lineNumbersToShow])

  useEffect(() => {
    onRowDataChanged(rowData)
  }, [shouldOnlyShowChangedLines, filteredLines, lineNumbersToShow])

  const customCellRenderer = (params: ICellRendererParams) => {
    const cellText: string = params.value

    if (params.node.rowIndex == null || !params.data || params.colDef?.field === 'oldTranslated') return cellText

    const rowIndex = params.node.rowIndex
    const isHighlightedColumn = params.colDef?.field === LANGUAGE_COLUMNS[matchLanguage]

    const textWithMatches = isHighlightedColumn ? (
      <HighlightedText text={cellText} rowIndex={rowIndex} searchResult={stringSearchResult} />
    ) : (
      <p className="block h-full leading-6">{cellText}</p>
    )

    if (params.colDef?.field === 'original') return textWithMatches

    const lineNumber: number = params.data.lineNumber
    const lineComments = comments.filter((comment) => comment.line - 1 === lineNumber)
    const isResolved = lineComments[lineComments.length - 1]?.body === RESOLVED_COMMENT
    const isAddingNewComment = addCommentToLine === lineNumber
    const showThread = (!isResolved && lineComments.length > 0) || isAddingNewComment

    return (
      <div className="w-full">
        <div className="flex items-center justify-between w-full">
          {textWithMatches}
          {lineNumbersToShow.get(lineNumber) === true && (
            <div className="flex gap-1 h-full items-center">
              {(isResolved || lineComments.length === 0) && (
                <button className="btn btn-square btn-xs" onClick={() => setAddCommentToLine(lineNumber)}>
                  <AddCommentIcon />
                </button>
              )}
              <button
                className="btn btn-square btn-xs swap swap-active"
                onClick={() => {
                  lineToFocus.current = params.data
                  setSelectedChangedLine(selectedChangedLine ? null : params.data)
                }}
              >
                <div className={selectedChangedLine ? 'swap-off' : 'swap-on'}>
                  <UnfoldMoreIcon />
                </div>
                <div className={selectedChangedLine ? 'swap-on' : 'swap-off'}>
                  <UnfoldLessIcon />
                </div>
              </button>
            </div>
          )}
        </div>
        {showThread && (
          <LineCommentThread
            lineNumber={lineNumber}
            lineComments={lineComments}
            userLogin={userLogin}
            isAddingNewComment={isAddingNewComment}
            answersRef={commentAnswers}
            textAreaRefsMap={textAreaRefs}
            onSendComment={onSendComment}
            onDeleteComment={onDeleteCommentClicked}
            onCancelAdd={() => setAddCommentToLine(null)}
          />
        )}
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
      rowData={rowData}
      rowClassRules={{
        'ag-cell-changed': ({ data }) => !!data && changedLineNumbers.includes(data.lineNumber),
        'ag-cell-conflict': ({ data }) => !!data && conflictedLinesNumber.includes(data.lineNumber)
      }}
      pinnedTopRowData={pinnedPosition === 'Top' ? [selectedChangedLine] : undefined}
      pinnedBottomRowData={pinnedPosition === 'Bottom' ? [selectedChangedLine] : undefined}
      getRowId={({ data }) => !!data && data.lineNumber.toString()}
      onBodyScroll={(e) => {
        checkRowVisibility(e.api)
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
          field: 'oldTranslated',
          headerName: 'Version précédente',
          autoHeight: true,
          wrapText: true,
          flex: 1,
          sortable: false,
          cellClass: 'leading-6!',
          cellRenderer: customCellRenderer
        },
        {
          field: 'translated',
          headerName: 'Nouvelle version française',
          autoHeight: true,
          wrapText: true,
          flex: 1,
          sortable: false,
          cellClass: 'leading-6!',
          editable: editable,
          cellEditor: editable ? 'agTextCellEditor' : undefined,
          onCellValueChanged: editable ? onLineEdited : undefined,
          cellRenderer: customCellRenderer
        }
      ]}
    />
  )
}
