import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { CrossIcon } from './icons/CrossIcon'

type LightboxProps = {
  src: string | null
  onClose: () => void
}

/**
 * A full-screen overlay that shows a single image at full size. Clicking the backdrop (anywhere
 * outside the image) or pressing Escape closes it. Display-only — it never touches the comment body
 * or storage, it just enlarges a thumbnail that is already rendered. Rendered into the shared `#modal`
 * portal root so it overlays the whole app (same pattern as `Modal`); a null `src` renders nothing.
 */
export const Lightbox = ({ src, onClose }: LightboxProps) => {
  const modalRoot = document.getElementById('modal')

  useEffect(() => {
    if (src === null) return

    const abortController = new AbortController()
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown, { signal: abortController.signal })

    return () => abortController.abort()
  }, [src, onClose])

  if (!modalRoot || src === null) return null

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Capture d'écran agrandie"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-8"
      onClick={onClose}
    >
      <button
        className="btn btn-sm btn-circle btn-ghost absolute right-4 top-4 text-white"
        onClick={onClose}
        aria-label="Fermer"
      >
        <CrossIcon />
      </button>
      <img
        src={src}
        alt="Capture d'écran agrandie"
        // Stop the backdrop's close handler so clicking the image itself keeps the lightbox open.
        onClick={(e) => e.stopPropagation()}
        className="max-h-full max-w-full rounded-md object-contain"
      />
    </div>,
    modalRoot
  )
}
