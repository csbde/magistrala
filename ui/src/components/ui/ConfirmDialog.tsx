import React from 'react'
import { Dialog, Button } from './primitives'
import { AlertTriangle } from 'lucide-react'

interface ConfirmDialogProps {
  open: boolean
  title?: string
  message: string
  confirmText?: string
  cancelText?: string
  variant?: 'danger' | 'primary'
  loading?: boolean
  onConfirm: () => void
  onClose: () => void
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title = '确认操作',
  message,
  confirmText = '确认',
  cancelText = '取消',
  variant = 'danger',
  loading,
  onConfirm,
  onClose,
}) => {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      width="max-w-md"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            {cancelText}
          </Button>
          <Button
            variant={variant}
            loading={loading}
            onClick={() => {
              onConfirm()
            }}
          >
            {confirmText}
          </Button>
        </>
      }
    >
      <div className="flex items-start gap-3 py-2">
        <div className="p-2 rounded-full bg-rose-50 text-rose-600 shrink-0">
          <AlertTriangle className="w-5 h-5" />
        </div>
        <div className="text-sm text-slate-600 leading-relaxed pt-0.5">{message}</div>
      </div>
    </Dialog>
  )
}
