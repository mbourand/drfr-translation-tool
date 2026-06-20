import { useEffect, useRef } from 'react'

export type ContextMenuAction = {
  label: string
  onClick: () => void
  disabled?: boolean
}

type ContextMenuProps = {
  x: number
  y: number
  actions: ContextMenuAction[]
  onClose: () => void
}

export const ContextMenu = ({ x, y, actions, onClose }: ContextMenuProps) => {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [onClose])

  return (
    <div
      ref={ref}
      className="fixed z-50 bg-base-100 border border-base-300 rounded-lg shadow-lg py-1 min-w-48"
      style={{ left: x, top: y }}
    >
      {actions.map((action, i) => (
        <button
          key={i}
          className="w-full text-left px-4 py-2 hover:bg-base-200 disabled:opacity-40 disabled:cursor-not-allowed text-sm"
          onClick={() => {
            action.onClick()
            onClose()
          }}
          disabled={action.disabled}
        >
          {action.label}
        </button>
      ))}
    </div>
  )
}
