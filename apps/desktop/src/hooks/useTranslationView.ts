import { useMemo, useRef, useState } from 'react'
import { GridApi } from 'ag-grid-community'
import { Line, MatchLanguages, TranslationFile } from '../types/translation'
import { StringSearchResult } from '../components/StringSearch/types'
import { isTechnicalString } from '../modules/game/strings'

export const useTranslationView = (files: TranslationFile[] | undefined) => {
  const [selectedFile, setSelectedFile] = useState<TranslationFile | null>(null)
  const [gridApi, setGridApi] = useState<GridApi<Line> | null>(null)
  const [stringSearchResult, setStringSearchResult] = useState<StringSearchResult | null>(null)
  const [matchLanguage, setMatchLanguage] = useState<MatchLanguages>('fr')
  const focusedCellRef = useRef<string | null>(null)

  const filesByCategory = useMemo(
    () =>
      files?.reduce((acc, file) => {
        if (!acc[file.category]) acc[file.category] = []
        acc[file.category].push(file)
        return acc
      }, {} as Record<string, TranslationFile[]>) ?? {},
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

  return {
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
  }
}
