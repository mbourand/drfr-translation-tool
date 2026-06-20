import { NavLink, useParams, useSearchParams } from 'react-router'
import { useTranslationFiles } from '../../../hooks/useTranslationFiles'
import { useTranslationView } from '../../../hooks/useTranslationView'
import { ReviewTranslationGrid } from './ReviewTranslationGrid'
import { ArrowLeftIcon } from '../../../components/icons/ArrowLeftIcon'
import { DifferenceIcon } from '../../../components/icons/DifferenceIcon'
import { TRANSLATION_APP_PAGES } from '../../../routes/pages/routes'
import { Line, TranslationFile } from '../../../types/translation'
import { useMemo, useState } from 'react'
import { TranslationSidePanel } from '../SidePanel'
import { LaunchGameButton } from '../edit/SidePanel/LaunchGameButton'
import { SaveChangesButton } from '../edit/SidePanel/SaveChangesButton'
import { SubmitToReviewButton } from '../edit/SidePanel/SubmitToReviewButton'
import { ApproveButtonButton } from './ApproveButton'
import { AskForChangesButton } from './AskForChangesButton'
import { QaReviewPanel } from './QaReviewPanel'
import { isEligibleQaReviewer, reviewSignoffs } from '../../../modules/prMarkers/reviewSignoffs'
import { binarySearch } from '../../../utils'
import { ENV } from '../../../Env'
import { useMutation, useQuery } from '@tanstack/react-query'
import { authedFetch } from '../../../modules/fetching/fetcher'
import { TRANSLATION_API_URLS } from '../../../routes/translation/routes'
import { store, STORE_KEYS, StoreUserInfos } from '../../../store/store'
import { z } from 'zod'
import { makeLineKey } from '../edit/changes'
import { DialogVisualizer } from '../../../components/DialogVisualizer/DialogVisualizer'
import { ReviewStringSearch } from './ReviewStringSearch'
import { isRowVisible } from '../isCellVisible'
import { UnsavedChangesModal } from './UnsavedChangesModal'

export const ReviewTranslationView = () => {
  const [searchParams] = useSearchParams()
  const branch = useParams().branch
  const isYours = searchParams.get('isYours') === 'true'
  const isReviewed = searchParams.get('isReviewed') === 'true'
  const prName = searchParams.get('name') ?? ''

  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)

  const {
    translationFiles: {
      data: branchTranslationFiles,
      isLoading: isBranchTranslationFilesLoading,
      isError: isBranchTranslationFilesError,
      error: branchTranslationFilesError
    }
  } = useTranslationFiles(branch)

  const {
    translationFiles: {
      data: masterTranslationFiles,
      isLoading: isMasterTranslationFilesLoading,
      isError: isMasterTranslationFilesError,
      error: masterTranslationFilesError
    }
  } = useTranslationFiles(ENV.GITHUB_BASE_BRANCH)

  const {
    translationFiles: {
      data: translationFilesAtCreation,
      isLoading: isTranslationFilesAtCreationLoading,
      isError: isTranslationFilesAtCreationError,
      error: translationFilesAtCreationError
    }
  } = useTranslationFiles(branch, { atBranchCreation: true })

  const {
    data: comments,
    isPending: isCommentsLoading,
    isError: isCommentsError,
    error: commentsError,
    refetch: refetchComments
  } = useQuery({
    queryKey: ['comments', branch],
    queryFn: async () => {
      if (!branch) throw new Error('No branch provided')

      return await authedFetch({
        route: TRANSLATION_API_URLS.TRANSLATIONS.LIST_COMMENTS(branch)
      })
    }
  })

  const userLogin = useQuery({
    queryKey: ['user-login'],
    queryFn: async () => {
      const userInfos = await store.get<StoreUserInfos>(STORE_KEYS.USER_INFOS)
      if (!userInfos) throw new Error('No user infos found')
      return userInfos.login
    }
  })

  // The backing PR for this branch, so the review surface can derive the QA stage and counts from
  // the sign-off markers (the same data the Overview board derives its columns from).
  const translationPr = useQuery({
    queryKey: ['translation-pr', branch],
    queryFn: async () => {
      if (!branch) throw new Error('No branch provided')
      const translations = await authedFetch({ route: TRANSLATION_API_URLS.TRANSLATIONS.LIST })
      const pr = translations.find((translation) => translation.head.ref === branch)
      if (!pr) throw new Error(`No translation found for branch ${branch}`)
      return pr
    }
  })

  // QA review opens once a translation has its two corrector approvals (it sits in "À tester").
  const prBody = translationPr.data?.body
  const isQaStage = reviewSignoffs.approvals(prBody).length >= 2
  const qaApprovalCount = reviewSignoffs.qaApprovals(prBody).length
  const isQaReady = qaApprovalCount >= 2
  const canQaReview =
    !!userLogin.data && isEligibleQaReviewer(prBody, translationPr.data?.user.login ?? '', userLogin.data)

  const deleteComments = useMutation({
    mutationKey: ['delete-comment'],
    mutationFn: async ({ commentId, pullRequestNumber }: { commentId: number; pullRequestNumber: number }) => {
      await authedFetch({
        route: TRANSLATION_API_URLS.TRANSLATIONS.DELETE_COMMENT(commentId, pullRequestNumber)
      })

      refetchComments()
    }
  })

  const sendComment = useMutation({
    mutationKey: ['send-comment'],
    mutationFn: async ({
      line,
      body,
      inReplyTo,
      filePath
    }: z.infer<typeof TRANSLATION_API_URLS.TRANSLATIONS.ADD_COMMENT.bodySchema>) => {
      if (!branch) throw new Error('No branch provided')

      await authedFetch({
        route: TRANSLATION_API_URLS.TRANSLATIONS.ADD_COMMENT,
        body: {
          branch,
          filePath,
          body,
          line,
          inReplyTo
        }
      })

      refetchComments()
    }
  })

  const isPending =
    isBranchTranslationFilesLoading ||
    isMasterTranslationFilesLoading ||
    isTranslationFilesAtCreationLoading ||
    isCommentsLoading
  const isError =
    isBranchTranslationFilesError ||
    isMasterTranslationFilesError ||
    isTranslationFilesAtCreationError ||
    isCommentsError
  const error =
    branchTranslationFilesError ?? masterTranslationFilesError ?? translationFilesAtCreationError ?? commentsError

  const [rowData, setRowData] = useState<Line[]>([])

  const gridFiles = useMemo(() => {
    if (!branchTranslationFiles || !translationFilesAtCreation || !masterTranslationFiles) return undefined

    const result: TranslationFile[] = []

    for (let i = 0; i < branchTranslationFiles?.length; i++) {
      const branchFile = branchTranslationFiles[i]
      const masterFile = masterTranslationFiles[i]
      const atCreationFile = translationFilesAtCreation[i]

      const lines = []
      let hasChanges = false
      for (let j = 0; j < branchFile.lines.length; j++) {
        const line = branchFile.lines[j]
        lines.push({
          category: branchFile.category,
          lineNumber: line.lineNumber,
          original: line.original,
          oldTranslated: masterFile.lines[j]?.translated ?? '[DELETED_LINE]',
          translated: line.translated
        })
        if (!hasChanges && line.translated !== atCreationFile.lines[j].translated) {
          hasChanges = true
        }
      }

      result.push({
        ...branchFile,
        lines,
        hasChanges
      })
    }

    return result
  }, [branchTranslationFiles, masterTranslationFiles, translationFilesAtCreation])

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
  } = useTranslationView(gridFiles)

  const changedLines = useMemo(() => {
    if (!filteredLines) return []
    const fileFromMasterAtCreation = translationFilesAtCreation?.find(
      (f) => f.translatedPath === selectedFileContents?.translatedPath
    )
    if (!fileFromMasterAtCreation) return []
    return filteredLines
      .filter((line) => {
        const indexInMasterLines = binarySearch(
          fileFromMasterAtCreation.lines,
          (masterLine) => masterLine.lineNumber - line.lineNumber
        )
        return (
          line.oldTranslated !== line.translated &&
          line.translated !== fileFromMasterAtCreation.lines[indexInMasterLines].translated
        )
      })
      .map((line) => line.lineNumber)
  }, [selectedFileContents])

  const [editedLines, setEditedLines] = useState(new Map<string, string>())

  const conflictedLines = useMemo(() => {
    if (!filteredLines) return []
    const fileFromMasterAtCreation = translationFilesAtCreation?.find(
      (f) => f.translatedPath === selectedFileContents?.translatedPath
    )
    if (!fileFromMasterAtCreation) return []
    return filteredLines
      .filter((line) => {
        const indexInMasterLines = binarySearch(
          fileFromMasterAtCreation.lines,
          (masterLine) => masterLine.lineNumber - line.lineNumber
        )
        return (
          line.oldTranslated !== line.translated &&
          line.oldTranslated !== fileFromMasterAtCreation.lines[indexInMasterLines].translated
        )
      })
      .map((line) => line.lineNumber)
  }, [selectedFileContents])

  return (
    <div className="flex flex-row">
      <TranslationSidePanel
        title="Fichiers de traduction"
        categories={filesByCategory}
        onSelected={setSelectedFile}
        selected={selectedFile}
        renderFileDecoration={(file) =>
          file.hasChanges ? (
            <div className="text-success">
              <DifferenceIcon />
            </div>
          ) : null
        }
        footer={
          <>
            <LaunchGameButton
              files={(gridFiles ?? []).map((file) => ({
                pathsInGameFolder: file.pathsInGameFolder,
                content: file.lines
                  .map((line) => editedLines.get(makeLineKey(file.translatedPath, line.lineNumber)) ?? line.translated)
                  .join('\n'),
                pathInGitFolder: file.translatedPath
              }))}
              changes={editedLines}
            />
            {isYours && isReviewed && (
              <SubmitToReviewButton branch={branch ?? ''} files={gridFiles ?? []} changes={editedLines} />
            )}
            {isYours && (
              <SaveChangesButton
                branch={branch ?? ''}
                files={gridFiles ?? []}
                changes={editedLines}
                onSaveSuccess={() => setHasUnsavedChanges(false)}
              />
            )}
            {translationPr.data &&
              (isQaStage ? (
                <QaReviewPanel
                  branch={branch ?? ''}
                  qaApprovalCount={qaApprovalCount}
                  isReady={isQaReady}
                  isEligible={canQaReview}
                />
              ) : (
                !isYours && (
                  <>
                    <AskForChangesButton branch={branch ?? ''} />
                    <ApproveButtonButton branch={branch ?? ''} />
                  </>
                )
              ))}
          </>
        }
      />
      <div className="flex flex-col items-center w-full px-4">
        <div className="flex flex-row w-full items-center mb-4 pt-2">
          <NavLink to={TRANSLATION_APP_PAGES.OVERVIEW} className="btn btn-circle btn-ghost">
            <ArrowLeftIcon />
          </NavLink>
          <h1 className="text-3xl font-semibold text-center w-full">Correction de : {prName}</h1>
        </div>
        {isPending && <div>Téléchargement des fichiers...</div>}
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
          <div className="w-full h-full pb-4 flex flex-row justify-center">
            <ReviewTranslationGrid
              onCellFocused={(e) => {
                if (!filteredLines || e.rowIndex == null || typeof e.column !== 'object') return

                const value = e.api.getDisplayedRowAtIndex(e.rowIndex)?.data?.[
                  (e.column?.getColId() as keyof Line) ?? 'translated'
                ]
                if (typeof value !== 'string') return

                focusedCellRef.current = value
              }}
              editable={isYours}
              onLineEdited={({ data, newValue }) => {
                const key = makeLineKey(selectedFile.translatedPath, data.lineNumber)
                setEditedLines((prev) => {
                  const newEditedLines = new Map(prev)
                  newEditedLines.set(key, newValue)
                  return newEditedLines
                })
                setHasUnsavedChanges(true)
              }}
              userLogin={userLogin.data ?? ''}
              comments={comments?.filter((comment) => comment.path === selectedFile.translatedPath) ?? []}
              filteredLines={filteredLines}
              showAllLines={!selectedFile.hasChanges}
              changedLineNumbers={changedLines}
              conflictedLinesNumber={conflictedLines}
              onReady={(e) => setGridApi(e.api)}
              onSendComment={({ line, body, inReplyTo }) => {
                sendComment.mutate({
                  line,
                  body,
                  branch: branch ?? '',
                  filePath: selectedFile.translatedPath,
                  inReplyTo: inReplyTo ?? undefined
                })
              }}
              onDeleteCommentClicked={(params) => deleteComments.mutate(params)}
              matchLanguage={matchLanguage}
              onRowDataChanged={setRowData}
              stringSearchResult={stringSearchResult}
            />
          </div>
        )}
      </div>
      {branch && gridFiles && (
        <UnsavedChangesModal
          hasUnsavedChanges={hasUnsavedChanges}
          onSaveSuccess={() => setHasUnsavedChanges(false)}
          changes={editedLines}
          files={gridFiles}
          branch={branch}
        />
      )}
    </div>
  )
}
