import { useMemo, useState } from 'react'
import { Modal } from '../../components/Modal'
import { ENV } from '../../Env'
import { useTranslationFiles } from '../../hooks/useTranslationFiles'
import { useTranslationView } from '../../hooks/useTranslationView'
import { TranslationStringSearch } from '../translation/edit/TranslationStringSearch'
import { TranslationSidePanel } from '../translation/SidePanel'
import { TranslationGrid } from '../translation/edit/TranslationGrid'
import { isRowVisible } from '../translation/isCellVisible'

type LinePickerModalProps = {
  isVisible: boolean
  onClose: () => void
  onPick: (line: { filePath: string; lineNumber: number; original: string }) => void
}

// Picks a line from master. Reuses the existing translation grid + StringSearch
// so testers can search by what they remember from the game.
export const LinePickerModal = ({ isVisible, onClose, onPick }: LinePickerModalProps) => {
  const {
    translationFiles: { data: files, isPending }
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
    filesByCategory,
    selectedFileContents,
    filteredLines
  } = useTranslationView(files)

  const [pickedLineNumber, setPickedLineNumber] = useState<number | null>(null)

  const pickedLine = useMemo(() => {
    if (pickedLineNumber == null) return null
    return filteredLines?.find((l) => l.lineNumber === pickedLineNumber) ?? null
  }, [filteredLines, pickedLineNumber])

  const handleConfirm = () => {
    if (!selectedFile || !pickedLine) return
    onPick({
      filePath: selectedFile.translatedPath,
      lineNumber: pickedLine.lineNumber,
      original: pickedLine.original
    })
    onClose()
  }

  return (
    <Modal
      isVisible={isVisible}
      onClose={onClose}
      label="Sélectionner la ligne concernée"
      className="!max-w-[1500px] !w-[95vw]"
      actions={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            Annuler
          </button>
          <button className="btn btn-primary" disabled={!pickedLine} onClick={handleConfirm}>
            Sélectionner
          </button>
        </>
      }
    >
      <div className="flex flex-row gap-2" style={{ height: '70vh' }}>
        <div className="w-72 shrink-0 overflow-auto border border-base-200 rounded-md">
          <TranslationSidePanel
            title="Fichiers"
            categories={filesByCategory}
            selected={selectedFile}
            onSelected={(file) => {
              setSelectedFile(file)
              setPickedLineNumber(null)
            }}
          />
        </div>

        <div className="flex flex-col flex-1 min-w-0">
          {isPending && <p className="opacity-60">Chargement des fichiers...</p>}

          {selectedFile && pickedLine && (
            <div className="bg-base-200 p-2 rounded-md mb-2 text-sm">
              <span className="font-semibold">Ligne sélectionnée:</span> {selectedFile.translatedPath}:
              {pickedLine.lineNumber}
              <p className="opacity-70 truncate mt-1">{pickedLine.original}</p>
            </div>
          )}

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

          {selectedFileContents && filteredLines && (
            <div className="flex-1 min-h-0">
              <TranslationGrid
                linesToShow={filteredLines}
                changedLineNumbers={pickedLineNumber != null ? [pickedLineNumber] : []}
                onLineEdited={() => undefined}
                onCellFocused={(e) => {
                  if (e.rowIndex == null) return
                  const lineNumber = filteredLines[e.rowIndex]?.lineNumber
                  if (lineNumber != null) setPickedLineNumber(lineNumber)
                }}
                onReady={(e) => setGridApi(e.api)}
                translatedStringSearchResult={stringSearchResult}
                matchLanguage={matchLanguage}
                editable={false}
                className="!h-full"
              />
            </div>
          )}

          {!selectedFile && !isPending && (
            <div className="flex items-center justify-center flex-1 opacity-60">
              <p>Sélectionnez un fichier dans la liste à gauche</p>
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}
