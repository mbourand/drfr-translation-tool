import { NavLink } from 'react-router'
import { useMemo } from 'react'
import { useTranslationFiles } from '../../../hooks/useTranslationFiles'
import { useTranslationView } from '../../../hooks/useTranslationView'
import { ArrowLeftIcon } from '../../../components/icons/ArrowLeftIcon'
import { TRANSLATION_APP_PAGES } from '../../../routes/pages/routes'
import { Line } from '../../../types/translation'
import { ENV } from '../../../Env'
import { TranslationSidePanel } from '../SidePanel'
import { DialogVisualizer } from '../../../components/DialogVisualizer/DialogVisualizer'
import { TranslationStringSearch } from '../edit/TranslationStringSearch'
import { isRowVisible } from '../isCellVisible'
import { LaunchGameButton } from '../edit/SidePanel/LaunchGameButton'
import { TranslationGrid } from '../edit/TranslationGrid'
import { NotionButton } from '../../../components/NotionButton'

// Read-only viewer of the canonical translation (the base branch) — browse the strings and launch
// the game, without creating a PR or editing anything.
const NO_CHANGES = new Map<string, string>()
const NO_CHANGED_LINES: number[] = []

export const ViewTranslationView = () => {
  const {
    translationFiles: { data: files, isPending, isError, error }
  } = useTranslationFiles(ENV.GITHUB_BASE_BRANCH)

  const {
    selectedFile,
    setSelectedFile,
    gridApi,
    setGridApi,
    stringSearchResult,
    setStringSearchResult,
    matchLanguage,
    setMatchLanguage,
    focusedCellRef,
    filesByCategory,
    selectedFileContents,
    filteredLines
  } = useTranslationView(files)

  // The launcher patches from in-memory content, so the base snapshot is launched read-only:
  // each file's VF as fetched, no changes. Reuses the edit view's launch flow unchanged.
  const launchFiles = useMemo(
    () =>
      (files ?? []).map((file) => ({
        pathInGameFolder: file.pathInGameFolder,
        content: file.lines.map((line) => line.translated).join('\n'),
        pathInGitFolder: file.translatedPath
      })),
    [files]
  )

  return (
    <div className="flex flex-row">
      <TranslationSidePanel
        title="Fichiers de traduction"
        categories={filesByCategory}
        onSelected={setSelectedFile}
        selected={selectedFile}
        footer={
          <>
            <NotionButton variant="footer" />
            <LaunchGameButton branch={ENV.GITHUB_BASE_BRANCH} files={launchFiles} changes={NO_CHANGES} />
          </>
        }
      />
      <div className="flex flex-col items-center w-full px-4">
        <div className="flex flex-row w-full items-center mb-4 pt-2">
          <NavLink to={TRANSLATION_APP_PAGES.OVERVIEW} className="btn btn-circle btn-ghost">
            <ArrowLeftIcon />
          </NavLink>
          <h1 className="text-3xl font-semibold text-center w-full">Consultation des traductions</h1>
        </div>
        <DialogVisualizer getDialog={() => focusedCellRef.current ?? ''} />
        {filteredLines && (
          <TranslationStringSearch
            filteredLines={filteredLines}
            matchLanguage={matchLanguage}
            onMatchChanged={(result) => {
              setStringSearchResult(result)
              if (!result || !result.selectedMatch || !gridApi) return
              const rowIndex = result.selectedMatch.rowIndex
              if (!isRowVisible(gridApi, filteredLines[rowIndex].lineNumber))
                gridApi.ensureIndexVisible(rowIndex, 'middle')
              gridApi.refreshCells({ force: true })
            }}
            onMatchLanguageChanged={setMatchLanguage}
          />
        )}
        {isPending && <div>Téléchargement des fichiers...</div>}
        {isError && <div>Erreur lors du téléchargement des fichiers {error.message}</div>}
        {selectedFileContents && selectedFile && (
          <div className="w-full h-full pb-4 flex flex-row justify-center">
            <TranslationGrid
              editable={false}
              onLineEdited={() => {}}
              onCellFocused={(e) => {
                if (!filteredLines || e.rowIndex == null || typeof e.column !== 'object') return
                const value = filteredLines[e.rowIndex]?.[(e.column?.getColId() as keyof Line) ?? 'translated']
                if (typeof value !== 'string') return
                focusedCellRef.current = value
              }}
              linesToShow={filteredLines ?? []}
              changedLineNumbers={NO_CHANGED_LINES}
              onReady={(e) => setGridApi(e.api)}
              translatedStringSearchResult={stringSearchResult}
              matchLanguage={matchLanguage}
            />
          </div>
        )}
      </div>
    </div>
  )
}
