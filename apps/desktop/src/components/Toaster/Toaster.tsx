import { twMerge } from 'tailwind-merge'
import { createPortal } from 'react-dom'
import { dismissToast, ToastType, useToasts } from './toastStore'

const TYPE_CLASSES = {
  error: 'alert-error',
  success: 'alert-success',
  info: 'alert-info'
} as const satisfies Record<ToastType, string>

export const Toaster = () => {
  const toasts = useToasts()

  return createPortal(
    <div className="toast toast-end toast-bottom z-200">
      {toasts.map((toast) => (
        <button
          key={toast.id}
          type="button"
          className={twMerge('alert text-left', TYPE_CLASSES[toast.type])}
          onClick={() => dismissToast(toast.id)}
        >
          <span>{toast.message}</span>
        </button>
      ))}
    </div>,
    document.body
  )
}
