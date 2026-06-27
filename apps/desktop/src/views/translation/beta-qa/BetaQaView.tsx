import { NavLink } from 'react-router'
import { useMemo, useState } from 'react'
import { GridApi } from 'ag-grid-community'
import { useTranslationFiles } from '../../../hooks/useTranslationFiles'
import { useTranslationView } from '../../../hooks/useTranslationView'
import { ArrowLeftIcon } from '../../../components/icons/ArrowLeftIcon'
import { TRANSLATION_APP_PAGES } from '../../../routes/pages/routes'
import { Line } from '../../../types/translation'
import { ENV } from '../../../Env'
import { TranslationSidePanel } from '../SidePanel'
import { DialogVisualizer } from '../../../components/DialogVisualizer/DialogVisualizer'
import { ReviewStringSearch } from '../review/ReviewStringSearch'
import { isRowVisible } from '../isCellVisible'
import { useBetaReviewMarks } from '../../../hooks/useBetaReviewMarks'
import { LaunchGameButton } from '../edit/SidePanel/LaunchGameButton'
import { BetaQaGrid } from './BetaQaGrid'
import { BetaReviewToolbar } from './BetaReviewToolbar'
import { DEFAULT_FILTER, BetaFilterState, passesFilter, summarize } from './betaMetrics'

const NO_CHANGES = new Map<string, string>()

export const BetaQaView = () => {
  const {
    translationFiles: { data: betaTranslationFiles, isLoading, isError, error }
  } = useTranslationFiles(ENV.GITHUB_BETA_BRANCH)

  const [gridApi, setGridApi] = useState<GridApi<Line> | null>(null)
  const [rowData, setRowData] = useState<Line[]>([])

  const {
    selectedFile,
    setSelectedFile,
    stringSearchResult,
    setStringSearchResult,
    matchLanguage,
    setMatchLanguage,
    focusedCellRef,
    filesByCategory,
    selectedFileContents,
    filteredLines
  } = useTranslationView(betaTranslationFiles)

  const { verdictsByLine, setVerdict, clearMine, clearKo } = useBetaReviewMarks(
    selectedFile?.translatedPath,
    filteredLines
  )

  // Verdict-bucket filter (Tout / Non relu / KO / OK, with an OK-depth threshold) applied client-side
  // over the already-loaded verdicts, composed on top of the existing string-search results.
  const [betaFilter, setBetaFilter] = useState<BetaFilterState>(DEFAULT_FILTER)
  const summary = useMemo(() => summarize(verdictsByLine), [verdictsByLine])
  const displayedLines = useMemo(
    () => (filteredLines ?? []).filter((line) => passesFilter(verdictsByLine.get(line.lineNumber), betaFilter)),
    [betaFilter, filteredLines, verdictsByLine]
  )

  // The launcher patches from in-memory content, so the `beta` snapshot is launched read-only:
  // each file's VF as fetched, no changes (PRD #5). Reuses the edit view's launch flow unchanged.
  const launchFiles = useMemo(
    () =>
      (betaTranslationFiles ?? []).map((file) => ({
        pathInGameFolder: file.pathInGameFolder,
        content: file.lines.map((line) => line.translated).join('\n'),
        pathInGitFolder: file.translatedPath
      })),
    [betaTranslationFiles]
  )

  return (
    <div className="flex flex-row">
      <TranslationSidePanel
        title="Contenu de la beta"
        categories={filesByCategory}
        onSelected={setSelectedFile}
        selected={selectedFile}
        footer={<LaunchGameButton branch={ENV.GITHUB_BETA_BRANCH} files={launchFiles} changes={NO_CHANGES} />}
      />
      <div className="flex flex-col items-center w-full px-4">
        <div className="flex flex-row w-full items-center mb-4 pt-2">
          <NavLink to={TRANSLATION_APP_PAGES.OVERVIEW} className="btn btn-circle btn-ghost">
            <ArrowLeftIcon />
          </NavLink>
          <h1 className="text-3xl font-semibold text-center w-full">Relecture de la beta</h1>
        </div>
        {isLoading && <div>Téléchargement des fichiers...</div>}
        {isError && <div>Erreur lors du téléchargement des fichiers {error?.message}</div>}
        <DialogVisualizer getDialog={() => focusedCellRef.current ?? ''} />
        {filteredLines && selectedFileContents && selectedFile && (
          <ReviewStringSearch
            filteredLines={rowData}
            matchLanguage={matchLanguage}
            onMatchChanged={(result) => {
              setStringSearchResult(result)
              if (!result || !result.selectedMatch || !gridApi) return
              const rowIndex = result.selectedMatch.rowIndex
              if (!isRowVisible(gridApi, rowData[rowIndex].lineNumber)) gridApi.ensureIndexVisible(rowIndex, 'middle')
              gridApi.refreshCells({ force: true })
            }}
            onMatchLanguageChanged={setMatchLanguage}
          />
        )}
        {filteredLines && selectedFileContents && selectedFile && (
          <BetaReviewToolbar
            summary={summary}
            filter={betaFilter}
            onFilterChange={setBetaFilter}
            verdicts={Array.from(verdictsByLine.values())}
            fileName={selectedFile.name}
          />
        )}
        {filteredLines && selectedFileContents && selectedFile && (
          <div className="w-full h-full pb-4 flex flex-row justify-center">
            <BetaQaGrid
              filteredLines={displayedLines}
              matchLanguage={matchLanguage}
              stringSearchResult={stringSearchResult}
              verdicts={verdictsByLine}
              onSetVerdict={setVerdict}
              onClearMine={clearMine}
              onClearKo={clearKo}
              onReady={(e) => setGridApi(e.api)}
              onCellFocused={(e) => {
                if (!filteredLines || e.rowIndex == null || typeof e.column !== 'object') return
                const value = e.api.getDisplayedRowAtIndex(e.rowIndex)?.data?.[
                  (e.column?.getColId() as keyof Line) ?? 'translated'
                ]
                if (typeof value !== 'string') return
                focusedCellRef.current = value
              }}
              onRowDataChanged={setRowData}
            />
          </div>
        )}
      </div>
    </div>
  )
}
