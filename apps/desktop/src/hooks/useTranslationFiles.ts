import { useQuery } from '@tanstack/react-query'
import { authedFetch } from '../modules/fetching/fetcher'
import { TRANSLATION_API_URLS } from '../routes/translation/routes'
import { TranslationFile } from '../types/translation'

export const useTranslationFiles = (branch?: string, options?: { atBranchCreation: boolean }) => {
  const { atBranchCreation = false } = options ?? {}

  const filesDownloadUrls = useQuery({
    queryKey: ['files', branch, atBranchCreation],
    queryFn: async () => {
      if (!branch) throw new Error('No branch provided')

      return await authedFetch({
        route: atBranchCreation
          ? TRANSLATION_API_URLS.TRANSLATIONS.FILES_AT_BRANCH_CREATION(branch)
          : TRANSLATION_API_URLS.TRANSLATIONS.FILES(branch)
      })
    }
  })

  const translationFiles = useQuery<TranslationFile[]>({
    queryKey: ['files-content', branch, atBranchCreation],
    queryFn: async () => {
      if (!filesDownloadUrls.data) throw new Error('No files download url found')

      return await Promise.all(
        filesDownloadUrls.data.map(async (file): Promise<TranslationFile> => {
          const originalResponse = await fetch(file.original)
          if (!originalResponse.ok) throw new Error('Could not fetch original file')
          const original = await originalResponse.text()

          const translatedResponse = await fetch(file.translated)
          if (!translatedResponse.ok) throw new Error('Could not fetch translated file')
          const translated = await translatedResponse.text()

          const splittedOriginal = original.split('\n')
          const splittedTranslated = translated.split('\n')

          const lines = Array.from({
            length: Math.max(splittedOriginal.length, splittedTranslated.length)
          }).map((_, i) => ({
            lineNumber: i,
            original: splittedOriginal[i] ?? '',
            translated: splittedTranslated[i] ?? ''
          }))

          return {
            name: file.name,
            category: file.category,
            originalPath: file.originalPath,
            translatedPath: file.translatedPath,
            pathsInGameFolder: file.pathsInGameFolder,
            lines
          }
        })
      )
    },
    enabled: !!filesDownloadUrls.data
  })

  return { translationFiles, filesDownloadUrls }
}
