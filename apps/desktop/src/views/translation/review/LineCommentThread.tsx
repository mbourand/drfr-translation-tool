import { MutableRefObject } from 'react'
import { z } from 'zod'
import { TRANSLATION_API_URLS } from '../../../routes/translation/routes'
import { SendIcon } from '../../../components/icons/SendIcon'
import { TrashIcon } from '../../../components/icons/TrashIcon'

export const RESOLVED_COMMENT = '[RESOLVED]'

type Comment = z.infer<ReturnType<(typeof TRANSLATION_API_URLS)['TRANSLATIONS']['LIST_COMMENTS']>['responseSchema']>[number]

type LineCommentThreadProps = {
  lineNumber: number
  lineComments: Comment[]
  userLogin: string
  isAddingNewComment: boolean
  answersRef: MutableRefObject<Map<number, string>>
  textAreaRefsMap: MutableRefObject<Map<number, HTMLTextAreaElement | null>>
  onSendComment: (params: { body: string; line: number; inReplyTo?: number }) => void
  onDeleteComment: (params: { commentId: number; pullRequestNumber: number }) => void
  onCancelAdd: () => void
}

export const LineCommentThread = ({
  lineNumber,
  lineComments,
  userLogin,
  isAddingNewComment,
  answersRef,
  textAreaRefsMap,
  onSendComment,
  onDeleteComment,
  onCancelAdd
}: LineCommentThreadProps) => {
  const lastCommentId = lineComments[lineComments.length - 1]?.id
  const replyTarget = isAddingNewComment ? undefined : lastCommentId

  const clearAnswer = () => {
    answersRef.current.delete(lineNumber)
    const textArea = textAreaRefsMap.current.get(lineNumber)
    if (textArea) textArea.value = ''
  }

  return (
    <div
      className="flex flex-col border-2 rounded-md border-base-content/10 mt-4 gap-2 mb-2 bg-base-100"
      onDoubleClickCapture={(e) => e.stopPropagation()}
    >
      <div className="flex justify-between px-2 pt-2">
        <h2 className="font-bold text-lg">Commentaires</h2>
        <button
          onClick={() => {
            onCancelAdd()
            onSendComment({
              body: RESOLVED_COMMENT,
              line: lineNumber + 1,
              inReplyTo: replyTarget
            })
          }}
          className="btn btn-sm btn-soft"
        >
          <p className="h-fit">Marquer comme résolu</p>
        </button>
      </div>
      {lineComments.map((comment) => (
        <div key={comment.id}>
          <div className="border-b border-base-content/10" />
          <div className="flex flex-col gap-2 py-3 px-2">
            <div className="flex justify-between">
              <div className="flex items-center gap-2">
                <div className="avatar w-7">
                  <img className="rounded-full" src={comment.user.avatar_url} alt="" />
                </div>
                <h3 className="font-semibold">{comment.user.login}</h3>
              </div>
              <div className="flex gap-2">
                {comment.user.login === userLogin && (
                  <button
                    className="btn btn-ghost btn-circle btn-neutral text-error btn-xs p-0.5"
                    onClick={() => {
                      const pullRequestNumber = parseInt(comment.pull_request_url.split('/').pop() ?? '', 10)
                      if (isNaN(pullRequestNumber)) return
                      onDeleteComment({ commentId: comment.id, pullRequestNumber })
                    }}
                  >
                    <TrashIcon />
                  </button>
                )}
              </div>
            </div>
            <p className="ml-4">{comment.body}</p>
          </div>
        </div>
      ))}
      <div className="p-2 flex flex-col gap-2 items-end">
        <textarea
          onKeyDownCapture={(e) => e.stopPropagation()}
          ref={(elem) => textAreaRefsMap.current.set(lineNumber, elem)}
          onChange={(e) => answersRef.current.set(lineNumber, e.target.value)}
          className="textarea w-full pr-14 "
          placeholder={isAddingNewComment ? 'Ajouter un commentaire...' : 'Répondre...'}
          defaultValue={answersRef.current.get(lineNumber) || ''}
        />
        <div className="flex gap-2">
          {isAddingNewComment && (
            <button
              className="btn btn-sm btn-soft"
              onClick={() => {
                onCancelAdd()
                clearAnswer()
              }}
            >
              Annuler
            </button>
          )}
          <button
            onClick={() => {
              const comment = answersRef.current.get(lineNumber)
              clearAnswer()
              if (!comment || comment.trim() === '') return
              onCancelAdd()
              onSendComment({
                body: comment,
                line: lineNumber + 1,
                inReplyTo: replyTarget
              })
            }}
            className="btn btn-sm btn-primary"
          >
            <p className="h-fit">Envoyer</p>
            <SendIcon />
          </button>
        </div>
      </div>
    </div>
  )
}
