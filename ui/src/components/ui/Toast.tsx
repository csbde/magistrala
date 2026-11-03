import React, { createContext, useContext, useState, useCallback } from 'react'
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react'
import { cn } from '../../lib/utils'

type ToastType = 'success' | 'error' | 'info'

interface Toast {
  id: string
  type: ToastType
  message: string
}

interface ToastContextType {
  toast: (message: string, type?: ToastType) => void
  success: (message: string) => void
  error: (message: string) => void
  info: (message: string) => void
}

const ToastContext = createContext<ToastContextType | undefined>(undefined)

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([])

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const addToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = Math.random().toString(36).substring(2, 9)
    setToasts((prev) => [...prev, { id, type, message }])
    setTimeout(() => {
      removeToast(id)
    }, 3500)
  }, [removeToast])

  const success = useCallback((msg: string) => addToast(msg, 'success'), [addToast])
  const error = useCallback((msg: string) => addToast(msg, 'error'), [addToast])
  const info = useCallback((msg: string) => addToast(msg, 'info'), [addToast])

  return (
    <ToastContext.Provider value={{ toast: addToast, success, error, info }}>
      {children}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-sm pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              'pointer-events-auto flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-lg border text-xs font-medium transition-all duration-300 animate-in slide-in-from-bottom-2',
              t.type === 'success' && 'bg-emerald-950/90 text-emerald-100 border-emerald-800 shadow-emerald-950/20 backdrop-blur-sm',
              t.type === 'error' && 'bg-rose-950/90 text-rose-100 border-rose-800 shadow-rose-950/20 backdrop-blur-sm',
              t.type === 'info' && 'bg-slate-900/90 text-slate-100 border-slate-700 shadow-slate-950/20 backdrop-blur-sm',
            )}
          >
            {t.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
            {t.type === 'error' && <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />}
            {t.type === 'info' && <Info className="w-4 h-4 text-blue-400 shrink-0" />}
            <span className="flex-1 break-words">{t.message}</span>
            <button
              onClick={() => removeToast(t.id)}
              className="p-1 text-slate-400 hover:text-slate-200 rounded transition"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

// oxlint-disable-next-line react/only-export-components
export const useToast = () => {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    throw new Error('useToast must be used within ToastProvider')
  }
  return ctx
}
