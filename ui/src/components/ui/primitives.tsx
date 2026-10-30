import React, { useEffect } from 'react'
import { cn } from '../../lib/utils'
import { X, Loader2, Check } from 'lucide-react'

/* ---------------------------------- Button --------------------------------- */
type ButtonVariant = 'primary' | 'outline' | 'ghost' | 'danger' | 'success' | 'secondary'
type ButtonSize = 'sm' | 'md' | 'lg' | 'icon'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-blue-600 text-white hover:bg-blue-500 shadow-sm border border-transparent',
  secondary: 'bg-slate-800 text-white hover:bg-slate-700 border border-transparent',
  outline: 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50',
  ghost: 'bg-transparent text-slate-600 hover:bg-slate-100 border border-transparent',
  danger: 'bg-red-600 text-white hover:bg-red-500 border border-transparent shadow-sm',
  success: 'bg-emerald-600 text-white hover:bg-emerald-500 border border-transparent shadow-sm',
}

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'px-2.5 py-1 text-xs rounded-md gap-1.5',
  md: 'px-3 py-1.5 text-sm rounded-lg gap-1.5',
  lg: 'px-4 py-2 text-sm rounded-lg gap-2',
  icon: 'p-1.5 rounded-md',
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', loading, children, disabled, ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center font-medium transition disabled:opacity-50 disabled:pointer-events-none',
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    >
      {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
      {children}
    </button>
  ),
)
Button.displayName = 'Button'

/* ---------------------------------- Badge ---------------------------------- */
export const Badge: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <span
    className={cn(
      'inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border',
      className || 'bg-slate-100 text-slate-700 border-slate-200',
    )}
  >
    {children}
  </span>
)

export const StatusBadge: React.FC<{ status?: string }> = ({ status }) => {
  const s = (status || '').toLowerCase()
  const map: Record<string, string> = {
    enabled: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    active: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    connected: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    generated: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    released: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    disabled: 'bg-slate-200 text-slate-700 border-slate-300',
    offline: 'bg-slate-200 text-slate-700 border-slate-300',
    pending: 'bg-amber-100 text-amber-800 border-amber-200',
    acknowledged: 'bg-blue-100 text-blue-800 border-blue-200',
    resolved: 'bg-slate-100 text-slate-600 border-slate-200 line-through',
    failed: 'bg-red-100 text-red-800 border-red-200',
  }
  return <Badge className={map[s] || 'bg-slate-100 text-slate-700 border-slate-200'}>{status || '未知'}</Badge>
}

export const SeverityBadge: React.FC<{ severity?: string }> = ({ severity }) => {
  const s = (severity || '').toLowerCase()
  const map: Record<string, string> = {
    critical: 'bg-red-100 text-red-800 border-red-300',
    high: 'bg-orange-100 text-orange-800 border-orange-300',
    medium: 'bg-amber-100 text-amber-800 border-amber-300',
    low: 'bg-sky-100 text-sky-800 border-sky-300',
  }
  return <Badge className={map[s] || 'bg-slate-100 text-slate-700 border-slate-200'}>{severity || 'medium'}</Badge>
}

/* ---------------------------------- Dialog --------------------------------- */
interface DialogProps {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children: React.ReactNode
  footer?: React.ReactNode
  width?: string
}

export const Dialog: React.FC<DialogProps> = ({ open, onClose, title, description, children, footer, width = 'max-w-lg' }) => {
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 overflow-y-auto" onClick={onClose}>
      <div
        className={cn('bg-white rounded-xl shadow-2xl w-full my-8', width)}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h3 className="text-base font-bold text-slate-800">{title}</h3>
            {description && <p className="text-xs text-slate-500 mt-0.5">{description}</p>}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 p-1 rounded-md hover:bg-slate-100">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-6 py-5 max-h-[70vh] overflow-y-auto">{children}</div>
        {footer && <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-xl">{footer}</div>}
      </div>
    </div>
  )
}

/* ----------------------------------- Tabs ---------------------------------- */
export interface TabItem {
  id: string
  label: string
  icon?: React.ComponentType<{ className?: string }>
  badge?: number | string
}

export const Tabs: React.FC<{ items: TabItem[]; value: string; onChange: (id: string) => void }> = ({ items, value, onChange }) => (
  <div className="flex gap-1 border-b border-slate-200 overflow-x-auto">
    {items.map((it) => {
      const Icon = it.icon
      const active = value === it.id
      return (
        <button
          key={it.id}
          onClick={() => onChange(it.id)}
          className={cn(
            'flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 whitespace-nowrap transition -mb-px',
            active ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300',
          )}
        >
          {Icon && <Icon className="w-3.5 h-3.5" />}
          <span>{it.label}</span>
          {it.badge !== undefined && it.badge !== 0 && (
            <span className="ml-0.5 bg-slate-200 text-slate-700 rounded-full px-1.5 text-[10px]">{it.badge}</span>
          )}
        </button>
      )
    })}
  </div>
)

/* ---------------------------------- Fields --------------------------------- */
export const Field: React.FC<{
  label: string
  value?: string
  children?: React.ReactNode
  mono?: boolean
}> = ({ label, value, children, mono }) => (
  <div className="space-y-1">
    <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</label>
    {children || <div className={cn('text-sm text-slate-800', mono && 'font-mono text-xs')}>{value ?? '-'}</div>}
  </div>
)

export const Input: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = ({ className, ...props }) => (
  <input
    className={cn(
      'w-full text-sm rounded-lg border border-slate-300 px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white',
      className,
    )}
    {...props}
  />
)

export const Textarea: React.FC<React.TextareaHTMLAttributes<HTMLTextAreaElement>> = ({ className, ...props }) => (
  <textarea
    className={cn(
      'w-full text-sm rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white',
      className,
    )}
    {...props}
  />
)

export const Select: React.FC<React.SelectHTMLAttributes<HTMLSelectElement>> = ({ className, children, ...props }) => (
  <select
    className={cn(
      'w-full text-sm rounded-lg border border-slate-300 px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white',
      className,
    )}
    {...props}
  >
    {children}
  </select>
)

/* -------------------------------- CopyButton ------------------------------- */
export const CopyButton: React.FC<{ text?: string; label?: string }> = ({ text, label = '复制' }) => {
  const [copied, setCopied] = React.useState(false)
  if (!text) return null
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
      className="text-[11px] text-blue-600 hover:text-blue-800 inline-flex items-center gap-1 font-medium"
    >
      {copied ? <Check className="w-3 h-3 text-emerald-600" /> : null}
      <span>{copied ? '已复制' : label}</span>
    </button>
  )
}

/* ------------------------------- EmptyState -------------------------------- */
export const EmptyState: React.FC<{ text: string; loading?: boolean }> = ({ text, loading }) => (
  <div className="p-12 text-center text-slate-400 text-sm flex items-center justify-center gap-2">
    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
    <span>{loading ? '加载中...' : text}</span>
  </div>
)
