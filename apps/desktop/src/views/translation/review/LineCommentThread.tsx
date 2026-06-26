import { DragEvent, MutableRefObject, useEffect, useState } from 'react'
import { z } from 'zod'
import { open } from '@tauri-apps/plugin-dialog'
import { readFile } from '@tauri-apps/plugin-fs'
import { readImage } from '@tauri-apps/plugin-clipboard-manager'
import { TRANSLATION_API_URLS } from '../../../routes/translation/routes'
import { SendIcon } from '../../../components/icons/SendIcon'
import { TrashIcon } from '../../../components/icons/TrashIcon'
import { ImageIcon } from '../../../components/icons/ImageIcon'
import { CrossIcon } from '../../../components/icons/CrossIcon'

export const RESOLVED_COMMENT = '[RESOLVED]'

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp']

// Read an image off the OS clipboard via the Tauri plugin (`readImage`) rather than the DOM `paste`
// event, chosen for reliable Linux/WebKitGTK support. The plugin only exposes raw RGBA pixels, so we
// re-encode them to a PNG blob the backend (`sharp`) can decode — flowing into the same staging path
// as a picked file. Returns null when the clipboard holds no image (so a plain text paste falls
// through untouched).
const readClipboardImage = async (): Promise<Blob | null> => {
  let image
  try {
    image = await readImage()
  } catch {
    return null
  }
  const [{ width, height }, rgba] = await Promise.all([image.size(), image.rgba()])
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) return null
  context.putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0)
  return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
}

// The tool itself appends `![](url)` tokens to a comment body on send. Minimal extraction pulls exactly
// those tokens back out so embedded screenshots render as thumbnails while everything else stays plain text
// (a comment with no token is returned untouched, so existing text-only threads look identical to before).
const IMAGE_TOKEN = /!\[\]\(([^)]+)\)/g
const extractScreenshots = (body: string): { text: string; screenshotUrls: string[] } => {
  const screenshotUrls: string[] = []
  const stripped = body.replace(IMAGE_TOKEN, (_, url: string) => {
    screenshotUrls.push(url)
    return ''
  })
  return { text: screenshotUrls.length > 0 ? stripped.trim() : body, screenshotUrls }
}

/** Renders a posted comment body: its text, followed by any embedded screenshots as a thumbnail strip. */
const CommentBody = ({ body }: { body: string }) => {
  const { text, screenshotUrls } = extractScreenshots(body)
  return (
    <>
      {text !== '' && <p className="ml-4">{text}</p>}
      {screenshotUrls.length > 0 && (
        <div className="ml-4 flex flex-wrap gap-2">
          {screenshotUrls.map((url) => (
            <img
              key={url}
              src={url}
              alt="Capture d'écran"
              className="max-h-40 rounded-md border border-base-content/10"
            />
          ))}
        </div>
      )}
    </>
  )
}

type Comment = z.infer<ReturnType<(typeof TRANSLATION_API_URLS)['TRANSLATIONS']['LIST_COMMENTS']>['responseSchema']>[number]

type LineCommentThreadProps = {
  lineNumber: number
  lineComments: Comment[]
  userLogin: string
  isAddingNewComment: boolean
  answersRef: MutableRefObject<Map<number, string>>
  textAreaRefsMap: MutableRefObject<Map<number, HTMLTextAreaElement | null>>
  screenshotsRef: MutableRefObject<Map<number, Blob>>
  onSendComment: (params: { body: string; line: number; inReplyTo?: number; screenshot?: Blob }) => void
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
  screenshotsRef,
  onSendComment,
  onDeleteComment,
  onCancelAdd
}: LineCommentThreadProps) => {
  const lastCommentId = lineComments[lineComments.length - 1]?.id
  const replyTarget = isAddingNewComment ? undefined : lastCommentId

  // Mirror the parent-held staged screenshot into local state so the thumbnail re-renders, while the ref
  // keeps it alive across cell-renderer remounts (same pattern as the text draft in `answersRef`).
  const [screenshot, setScreenshot] = useState<Blob | null>(() => screenshotsRef.current.get(lineNumber) ?? null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [isDraggingOver, setIsDraggingOver] = useState(false)

  useEffect(() => {
    if (!screenshot) {
      setPreviewUrl(null)
      return
    }
    const url = URL.createObjectURL(screenshot)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [screenshot])

  const stageScreenshot = (blob: Blob) => {
    screenshotsRef.current.set(lineNumber, blob)
    setScreenshot(blob)
  }

  const clearScreenshot = () => {
    screenshotsRef.current.delete(lineNumber)
    setScreenshot(null)
  }

  const pickScreenshot = async () => {
    const selected = await open({
      multiple: false,
      directory: false,
      filters: [{ name: 'Images', extensions: IMAGE_EXTENSIONS }]
    })
    if (typeof selected !== 'string') return
    const bytes = await readFile(selected)
    // `readFile` types its result as `Uint8Array<ArrayBufferLike>`, which the DOM `Blob` ctor won't accept
    // directly; the bytes are a plain owned buffer, so this widening to `BlobPart` is safe.
    stageScreenshot(new Blob([bytes as unknown as BlobPart]))
  }

  // Ctrl+V in the comment box: stage any clipboard image as a thumbnail. A text-only clipboard yields
  // null, so the textarea's default paste still inserts the text normally.
  const pasteScreenshot = async () => {
    const blob = await readClipboardImage()
    if (blob) stageScreenshot(blob)
  }

  // Drag-and-drop staging. `dragDropEnabled: false` in `tauri.conf.json` disables Tauri's native
  // webview file-drop interception, so the browser's HTML5 DOM drop events fire here with real `File`
  // objects (which are `Blob`s) — letting a dropped image flow into the same staging path as the
  // picker and clipboard.
  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDraggingOver(true)
  }

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    // Ignore leave events fired while moving between the box's own children, so the highlight doesn't flicker.
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
    setIsDraggingOver(false)
  }

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDraggingOver(false)
    // Stage the first dropped image; non-image drops are rejected without staging.
    const image = Array.from(e.dataTransfer.files).find((file) => file.type.startsWith('image/'))
    if (image) stageScreenshot(image)
  }

  const clearAnswer = () => {
    answersRef.current.delete(lineNumber)
    const textArea = textAreaRefsMap.current.get(lineNumber)
    if (textArea) textArea.value = ''
  }

  const send = () => {
    const body = answersRef.current.get(lineNumber) ?? ''
    const staged = screenshot
    clearAnswer()
    if (body.trim() === '' && !staged) return
    clearScreenshot()
    onCancelAdd()
    onSendComment({ body, line: lineNumber + 1, inReplyTo: replyTarget, screenshot: staged ?? undefined })
  }

  return (
    <div
      className={`flex flex-col border-2 rounded-md mt-4 gap-2 mb-2 bg-base-100 transition-colors ${
        isDraggingOver ? 'border-primary border-dashed bg-primary/5' : 'border-base-content/10'
      }`}
      onDoubleClickCapture={(e) => e.stopPropagation()}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
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
            <CommentBody body={comment.body} />
          </div>
        </div>
      ))}
      <div className="p-2 flex flex-col gap-2 items-end">
        <textarea
          onKeyDownCapture={(e) => e.stopPropagation()}
          onPaste={pasteScreenshot}
          ref={(elem) => textAreaRefsMap.current.set(lineNumber, elem)}
          onChange={(e) => answersRef.current.set(lineNumber, e.target.value)}
          className="textarea w-full pr-14 "
          placeholder={isAddingNewComment ? 'Ajouter un commentaire...' : 'Répondre...'}
          defaultValue={answersRef.current.get(lineNumber) || ''}
        />
        {previewUrl && (
          <div className="self-start flex flex-wrap gap-2">
            <div className="relative">
              <img
                src={previewUrl}
                alt="Capture d'écran à envoyer"
                className="max-h-28 rounded-md border border-base-content/10"
              />
              <button
                onClick={clearScreenshot}
                className="btn btn-circle btn-xs btn-error absolute -top-2 -right-2 p-0.5"
                aria-label="Retirer la capture"
              >
                <CrossIcon />
              </button>
            </div>
          </div>
        )}
        <div className="flex gap-2">
          {isAddingNewComment && (
            <button
              className="btn btn-sm btn-soft"
              onClick={() => {
                onCancelAdd()
                clearAnswer()
                clearScreenshot()
              }}
            >
              Annuler
            </button>
          )}
          <button onClick={pickScreenshot} className="btn btn-sm btn-soft" aria-label="Joindre une capture d'écran">
            <ImageIcon />
          </button>
          <button onClick={send} className="btn btn-sm btn-primary">
            <p className="h-fit">Envoyer</p>
            <SendIcon />
          </button>
        </div>
      </div>
    </div>
  )
}
