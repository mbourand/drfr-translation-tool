import { NavLink, useNavigate, useParams, useSearchParams } from 'react-router'
import { TRANSLATION_APP_PAGES } from '../../../routes/pages/routes'
import { useMemo, useRef, useState } from 'react'
import { SidePanel, FileType } from './SidePanel/SidePanel'
import { TranslationGrid } from './TranslationGrid'
import { ArrowLeftIcon } from '../../../components/icons/ArrowLeftIcon'
import { GridApi } from 'ag-grid-community'
import { LineType, MatchLanguages } from './types'
import { StringSearchResult } from '../../../components/StringSearch/types'
import { TranslationStringSearch } from './TranslationStringSearch'
import { makeLineKey } from './changes'
import { isTechnicalString } from '../../../modules/game/strings'
import { useTranslationFiles } from '../../../hooks/useTranslationFiles'
import { isRowVisible } from '../isCellVisible'
import { DialogVisualizer } from '../../../components/DialogVisualizer/DialogVisualizer'
import { UnsavedChangesModal } from '../review/UnsavedChangesModal'
import { ENV } from '../../../Env'

export const EditTranslationView = () => {
  const branch = useParams().branch
  const [searchParams] = useSearchParams()
  const prName = searchParams.get('name') ?? ''
  const [selectedFile, setSelectedFile] = useState<FileType | null>(null)

  const [changedLines, setChangedLines] = useState(new Map<string, string>())
  const committedValuesRef = useRef(new Map<string, string>())

  const [gridApi, setGridApi] = useState<GridApi<LineType> | null>(null)

  const [stringSearchResult, setStringSearchResult] = useState<StringSearchResult | null>(null)
  const [matchLanguage, setMatchLanguage] = useState<MatchLanguages>('fr')

  const focusedCellRef = useRef<string | null>(null)

  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)

  const {
    translationFiles: { data: files, isPending, isError, error }
  } = useTranslationFiles(branch)

  const {
    translationFiles: { data: masterFiles }
  } = useTranslationFiles(ENV.GITHUB_BASE_BRANCH)

  const {
    translationFiles: { data: branchCreationFiles }
  } = useTranslationFiles(branch, { atBranchCreation: true })

  const filesByCategory = useMemo(
    () =>
      files?.reduce((acc, file) => {
        if (!acc[file.category]) acc[file.category] = []
        acc[file.category].push(file)
        return acc
      }, {} as Record<string, FileType[]>) ?? {},
    [files]
  )

  const selectedFileContents = useMemo(
    () => files?.find((file) => file.translatedPath === selectedFile?.translatedPath),
    [files, selectedFile]
  )

  const filteredLines = useMemo(
    () => selectedFileContents?.lines.filter((line) => !isTechnicalString(line.original)),
    [selectedFileContents]
  )

  const branchCreationIndex = useMemo(() => {
    if (!selectedFile || !branchCreationFiles) return undefined
    const file = branchCreationFiles.find((f) => f.translatedPath === selectedFile.translatedPath)
    if (!file) return undefined
    const map = new Map<number, string>()
    for (const line of file.lines) {
      map.set(line.lineNumber, line.translated)
    }
    return map
  }, [branchCreationFiles, selectedFile])

  const masterIndex = useMemo(() => {
    if (!selectedFile || !masterFiles) return undefined
    const file = masterFiles.find((f) => f.translatedPath === selectedFile.translatedPath)
    if (!file) return undefined
    const map = new Map<number, string>()
    for (const line of file.lines) {
      map.set(line.lineNumber, line.translated)
    }
    return map
  }, [masterFiles, selectedFile])

  const updateGridCell = (lineNumber: number, value: string) => {
    if (!gridApi) return
    const rowIndex = filteredLines?.findIndex((l) => l.lineNumber === lineNumber) ?? -1
    if (rowIndex === -1) return
    const rowNode = gridApi.getDisplayedRowAtIndex(rowIndex)
    if (!rowNode?.data) return
    rowNode.data.translated = value
    gridApi.refreshCells({ rowNodes: [rowNode], columns: ['translated'], force: true })
  }

  const handleResetToCommit = (lineNumber: number) => {
    if (!selectedFile) return
    const key = makeLineKey(selectedFile.translatedPath, lineNumber)
    const committedValue = committedValuesRef.current.get(key)
    if (committedValue === undefined) return

    setChangedLines((prev) => {
      prev.delete(key)
      return new Map(prev)
    })

    updateGridCell(lineNumber, committedValue)
  }

  const handleResetToMaster = (lineNumber: number) => {
    if (!selectedFile) return
    const masterValue = masterIndex?.get(lineNumber)
    if (masterValue === undefined) return

    const key = makeLineKey(selectedFile.translatedPath, lineNumber)
    const committedValue = committedValuesRef.current.get(key)

    setChangedLines((prev) => {
      if (committedValue !== undefined && committedValue === masterValue) {
        prev.delete(key)
      } else {
        prev.set(key, masterValue)
      }
      return new Map(prev)
    })
    setHasUnsavedChanges(true)

    updateGridCell(lineNumber, masterValue)
  }

  const navigate = useNavigate()

  if (!branch) {
    navigate(TRANSLATION_APP_PAGES.OVERVIEW)
    return null
  }

  return (
    <div className="flex flex-row">
      <SidePanel
        title="Fichiers de traduction"
        categories={filesByCategory}
        onSelected={(selected) => setSelectedFile(selected)}
        selected={selectedFile}
        branch={branch}
        changes={changedLines}
        onSaveSuccess={() => setHasUnsavedChanges(false)}
      />
      <div className="flex flex-col items-center w-full px-4">
        <div className="flex flex-row w-full items-center mb-4 pt-2">
          <NavLink to={TRANSLATION_APP_PAGES.OVERVIEW} className="btn btn-circle btn-ghost">
            <ArrowLeftIcon />
          </NavLink>
          <h1 className="text-3xl font-semibold text-center w-full">Traduction de : {prName}</h1>
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
              onLineEdited={({ data, newValue, oldValue }) => {
                const key = makeLineKey(selectedFile.translatedPath, data.lineNumber)
                if (!committedValuesRef.current.has(key)) {
                  committedValuesRef.current.set(key, oldValue)
                }
                setChangedLines((prev) => {
                  if (committedValuesRef.current.get(key) === newValue) prev.delete(key)
                  else prev.set(key, newValue)
                  return new Map(prev)
                })
                setHasUnsavedChanges(true)
              }}
              onCellFocused={(e) => {
                if (!filteredLines || e.rowIndex == null || typeof e.column !== 'object') return
                const value = filteredLines[e.rowIndex]?.[(e.column?.getColId() as keyof LineType) ?? 'translated']
                if (typeof value !== 'string') return
                focusedCellRef.current = value
              }}
              linesToShow={filteredLines ?? []}
              changedLineNumbers={Array.from(changedLines.keys())
                .filter((c) => c.startsWith(selectedFile.translatedPath))
                .map((key) => parseInt(key.split(':')[1], 10))}
              onReady={(e) => setGridApi(e.api)}
              translatedStringSearchResult={stringSearchResult}
              matchLanguage={matchLanguage}
              onResetToCommit={handleResetToCommit}
              onResetToMaster={handleResetToMaster}
              getMasterValue={(lineNumber) => masterIndex?.get(lineNumber)}
              getValueAtBranchCreation={(lineNumber) => branchCreationIndex?.get(lineNumber)}
            />
          </div>
        )}
      </div>
      {branch && files && (
        <UnsavedChangesModal
          hasUnsavedChanges={hasUnsavedChanges}
          onSaveSuccess={() => setHasUnsavedChanges(false)}
          changes={changedLines}
          files={files}
          branch={branch}
        />
      )}
    </div>
  )
}
