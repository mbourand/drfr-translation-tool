import { useSyncExternalStore } from 'react'

export type ToastType = 'error' | 'success' | 'info'

export type Toast = {
  id: number
  message: string
  type: ToastType
}

let toasts: Toast[] = []
let nextId = 0
const listeners = new Set<() => void>()

const emit = () => listeners.forEach((listener) => listener())

export const dismissToast = (id: number) => {
  toasts = toasts.filter((toast) => toast.id !== id)
  emit()
}

export const showToast = (message: string, type: ToastType = 'info', durationMs = 5000) => {
  const id = nextId++
  toasts = [...toasts, { id, message, type }]
  emit()

  if (durationMs > 0) {
    setTimeout(() => dismissToast(id), durationMs)
  }

  return id
}

export const useToasts = () =>
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => toasts
  )
