import { ChangeEvent, useEffect, useRef, useState } from 'react'
import { Modal } from '../../components/Modal'
import { useCreateBetaReport } from '../../hooks/useCreateBetaReport'
import {
  CATEGORY_DISPLAY,
  CATEGORY_KEYS,
  CategoryKey,
  SEVERITY_DISPLAY,
  SEVERITY_KEYS,
  SeverityKey
} from '../../routes/beta-reports/schemas'
import { LinePickerModal } from './LinePickerModal'

type CreateBetaReportModalProps = {
  isVisible: boolean
  onClose: () => void
}

type PickedLine = { filePath: string; lineNumber: number; original: string } | null

const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      if (typeof result !== 'string') return reject(new Error('Unexpected reader result'))
      // result is a data URL like "data:image/png;base64,..."; strip the prefix.
      const commaIndex = result.indexOf(',')
      resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result)
    }
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })

const truncateOriginal = (text: string, max = 60) => {
  const trimmed = text.trim()
  if (trimmed.length <= max) return trimmed
  return trimmed.slice(0, max - 1) + '…'
}

export const CreateBetaReportModal = ({ isVisible, onClose }: CreateBetaReportModalProps) => {
  const [title, setTitle] = useState('')
  const [titleManuallyEdited, setTitleManuallyEdited] = useState(false)
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState<CategoryKey>('orthographe')
  const [severity, setSeverity] = useState<SeverityKey>('minor')
  const [screenshots, setScreenshots] = useState<
    { id: string; name: string; base64: string; previewUrl: string }[]
  >([])
  const [pickedLine, setPickedLine] = useState<PickedLine>(null)
  const [isLinePickerOpen, setIsLinePickerOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const createReport = useCreateBetaReport()

  const revokeScreenshotPreviews = (items: { previewUrl: string }[]) => {
    for (const s of items) URL.revokeObjectURL(s.previewUrl)
  }

  const reset = () => {
    setTitle('')
    setTitleManuallyEdited(false)
    setDescription('')
    setCategory('orthographe')
    setSeverity('minor')
    setScreenshots((prev) => {
      revokeScreenshotPreviews(prev)
      return []
    })
    setPickedLine(null)
    setError(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // Auto-prefill the title from the picked line's English original (or category fallback)
  // unless the user has typed something themselves.
  useEffect(() => {
    if (titleManuallyEdited) return
    if (pickedLine) {
      setTitle(truncateOriginal(pickedLine.original))
    } else if (description.trim()) {
      const firstSentence = description.trim().split(/[.!?\n]/)[0]
      setTitle(`${CATEGORY_DISPLAY[category]}: ${truncateOriginal(firstSentence, 50)}`)
    } else {
      setTitle('')
    }
  }, [pickedLine, description, category, titleManuallyEdited])

  const handleClose = () => {
    if (createReport.isPending) return
    reset()
    onClose()
  }

  const appendScreenshotFromFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError("Le fichier sélectionné n'est pas une image.")
      return
    }
    try {
      const base64 = await fileToBase64(file)
      const previewUrl = URL.createObjectURL(file)
      setScreenshots((prev) => [
        ...prev,
        { id: crypto.randomUUID(), name: file.name || 'pasted-image.png', base64, previewUrl }
      ])
      setError(null)
    } catch (err) {
      setError('Impossible de lire le fichier image.')
      console.error(err)
    }
  }

  const handleScreenshotChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files) return
    for (const file of Array.from(files)) await appendScreenshotFromFile(file)
    // Reset the input so re-picking the same file fires onChange again.
    event.target.value = ''
  }

  const removeScreenshot = (id: string) => {
    setScreenshots((prev) => {
      const removed = prev.find((s) => s.id === id)
      if (removed) URL.revokeObjectURL(removed.previewUrl)
      return prev.filter((s) => s.id !== id)
    })
  }

  // Listen for clipboard paste while the modal is open. Each pasted image (e.g. from a
  // snipping tool) is appended to the screenshots list — much faster than saving to disk.
  useEffect(() => {
    if (!isVisible) return
    const handlePaste = (event: ClipboardEvent) => {
      const items = event.clipboardData?.items
      if (!items) return
      const files: File[] = []
      for (const item of Array.from(items)) {
        if (item.kind !== 'file' || !item.type.startsWith('image/')) continue
        const file = item.getAsFile()
        if (file) files.push(file)
      }
      if (files.length === 0) return
      event.preventDefault()
      for (const file of files) void appendScreenshotFromFile(file)
    }
    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
  }, [isVisible])

  // Free preview URLs on unmount.
  useEffect(() => {
    return () => revokeScreenshotPreviews(screenshots)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSubmit = () => {
    setError(null)
    if (!title.trim()) {
      setError('Le titre est requis.')
      return
    }
    if (screenshots.length === 0) {
      setError("Au moins une capture d'écran est requise.")
      return
    }

    createReport.mutate(
      {
        title: title.trim(),
        description: description.trim() || undefined,
        category,
        severity,
        screenshots: screenshots.map((s) => ({ name: s.name, base64: s.base64 })),
        line: pickedLine ? { filePath: pickedLine.filePath, lineNumber: pickedLine.lineNumber } : undefined
      },
      {
        onSuccess: () => {
          reset()
          onClose()
        },
        onError: (err) => {
          setError(err instanceof Error ? err.message : 'Erreur inconnue')
        }
      }
    )
  }

  return (
    <>
      <Modal
        isVisible={isVisible}
        onClose={handleClose}
        label="Signaler un bug"
        className="!max-w-[700px]"
        actions={
          <>
            <button className="btn btn-ghost" onClick={handleClose} disabled={createReport.isPending}>
              Annuler
            </button>
            <button className="btn btn-primary" onClick={handleSubmit} disabled={createReport.isPending}>
              {createReport.isPending && <span className="loading loading-spinner" />}
              Envoyer
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-row gap-4">
            <div className="flex flex-col gap-1 flex-1">
              <label htmlFor="report-category" className="text-sm font-semibold">
                Catégorie
              </label>
              <select
                id="report-category"
                className="select select-bordered"
                value={category}
                onChange={(e) => setCategory(e.target.value as CategoryKey)}
              >
                {CATEGORY_KEYS.map((key) => (
                  <option key={key} value={key}>
                    {CATEGORY_DISPLAY[key]}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1 flex-1">
              <label htmlFor="report-severity" className="text-sm font-semibold">
                Sévérité
              </label>
              <select
                id="report-severity"
                className="select select-bordered"
                value={severity}
                onChange={(e) => setSeverity(e.target.value as SeverityKey)}
              >
                {SEVERITY_KEYS.map((key) => (
                  <option key={key} value={key}>
                    {SEVERITY_DISPLAY[key]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="report-title" className="text-sm font-semibold">
              Titre
            </label>
            <input
              id="report-title"
              type="text"
              className="input input-bordered"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value)
                setTitleManuallyEdited(true)
              }}
              placeholder="Sera pré-rempli à partir de la ligne ou de la description"
              maxLength={120}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="report-description" className="text-sm font-semibold">
              Description (optionnelle)
            </label>
            <textarea
              id="report-description"
              className="textarea textarea-bordered min-h-[100px]"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Décrivez le problème, le contexte, ce que vous attendiez..."
              maxLength={8000}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-semibold">
              Captures d'écran <span className="opacity-60 font-normal">(ou collez avec Ctrl+V)</span>
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="file-input file-input-bordered"
              onChange={handleScreenshotChange}
            />
            {screenshots.length > 0 && (
              <div className="flex flex-row flex-wrap gap-2 mt-2">
                {screenshots.map((s) => (
                  <div key={s.id} className="relative">
                    <img src={s.previewUrl} alt={s.name} className="rounded-md max-h-32 border border-base-200" />
                    <button
                      type="button"
                      className="btn btn-circle btn-xs btn-error absolute -top-2 -right-2"
                      onClick={() => removeScreenshot(s.id)}
                      aria-label="Retirer cette capture"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-semibold">Ligne associée (optionnelle)</label>
            {pickedLine ? (
              <div className="bg-base-200 p-2 rounded-md flex flex-row items-start gap-2">
                <div className="flex-1 min-w-0">
                  <p className="font-mono text-sm truncate">
                    {pickedLine.filePath}:{pickedLine.lineNumber}
                  </p>
                  <p className="text-sm opacity-70 truncate">{pickedLine.original}</p>
                </div>
                <div className="flex flex-row gap-1">
                  <button className="btn btn-xs btn-ghost" onClick={() => setIsLinePickerOpen(true)}>
                    Changer
                  </button>
                  <button className="btn btn-xs btn-ghost" onClick={() => setPickedLine(null)}>
                    Retirer
                  </button>
                </div>
              </div>
            ) : (
              <button className="btn btn-soft" onClick={() => setIsLinePickerOpen(true)}>
                Sélectionner une ligne
              </button>
            )}
          </div>

          {error && <p className="text-error text-sm">{error}</p>}
        </div>
      </Modal>

      <LinePickerModal
        isVisible={isLinePickerOpen}
        onClose={() => setIsLinePickerOpen(false)}
        onPick={setPickedLine}
      />
    </>
  )
}
