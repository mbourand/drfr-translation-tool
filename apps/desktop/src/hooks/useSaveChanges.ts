import { useMutation } from '@tanstack/react-query'
import { authedFetch } from '../modules/fetching/fetcher'
import { TRANSLATION_API_URLS } from '../routes/translation/routes'
import { TranslationFile } from '../types/translation'
import { parseLineKey } from '../views/translation/edit/changes'

const computeFileContentsAfterChanges = (files: TranslationFile[], changes: Map<string, string>) => {
  const newFiles = [...files]
  for (const [key, value] of changes.entries()) {
    const parsed = parseLineKey(key)
    if (!parsed) continue

    const fileIndex = newFiles.findIndex((file) => file.translatedPath === parsed.translatedPath)
    if (fileIndex === -1) continue

    newFiles[fileIndex].lines[parsed.lineNumber].translated = value
  }

  return newFiles
}

// After this delay a save is considered failed so the UI can recover instead of waiting forever.
const SAVE_TIMEOUT_MS = 90_000

export const useSaveChanges = ({
  changes,
  files,
  branch,
  onSaveSuccess,
  onSaveError,
  timeoutMs = SAVE_TIMEOUT_MS
}: {
  changes: Map<string, string>
  files: TranslationFile[]
  branch: string
  onSaveSuccess?: () => void
  onSaveError?: (error: Error) => void
  timeoutMs?: number
}) => {
  return useMutation({
    mutationKey: ['save-changes'],
    mutationFn: async () => {
      if (changes.size === 0) return

      const filesThatChanged = files.filter((file) =>
        Array.from(changes.entries()).find(([key]) => key.startsWith(file.translatedPath))
      )
      const withAppliedChanges = computeFileContentsAfterChanges(filesThatChanged ?? [], changes)

      await authedFetch({
        route: TRANSLATION_API_URLS.TRANSLATIONS.SAVE_FILES,
        signal: AbortSignal.timeout(timeoutMs),
        body: {
          branch,
          message: `Sauvegarde ${new Date().toLocaleString('fr-FR', {
            timeZone: 'Europe/Paris'
          })}`,
          files: withAppliedChanges.map((file) => ({
            path: file.translatedPath,
            content: file.lines.map((line) => line.translated).join('\n')
          }))
        }
      })
    },
    onSuccess: onSaveSuccess,
    onError: onSaveError
  })
}
