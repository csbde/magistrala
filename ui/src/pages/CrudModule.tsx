import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchApi } from '../lib/api'
import { useAuthStore } from '../store/authStore'
import { dict } from '../lib/i18n'
import { Plus, Trash2, ShieldAlert } from 'lucide-react'

interface CrudModuleProps {
  endpoint: string
  title: string
  columns: { key: string; label: string; render?: (val: any, row: any) => React.ReactNode }[]
  createFields: { name: string; label: string; placeholder?: string; type?: string }[]
}

export const CrudModule: React.FC<CrudModuleProps> = ({
  endpoint,
  title,
  columns,
  createFields,
}) => {
  const { currentWorkspace, language } = useAuthStore()
  const t = dict[language]
  const queryClient = useQueryClient()

  const [isOpen, setIsOpen] = useState(false)
  const [formData, setFormData] = useState<Record<string, string>>({})
  const [errorMsg, setErrorMsg] = useState('')

  const queryKey = [endpoint, currentWorkspace?.id]

  const { data = [], isLoading, error } = useQuery({
    queryKey,
    queryFn: () => fetchApi<any[]>(endpoint),
    enabled: !!currentWorkspace?.id,
  })

  const createMutation = useMutation({
    mutationFn: (newObj: any) =>
      fetchApi(endpoint, {
        method: 'POST',
        body: JSON.stringify(newObj),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey })
      setIsOpen(false)
      setFormData({})
      setErrorMsg('')
    },
    onError: (err: any) => {
      setErrorMsg(err.message || '操作失败')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      fetchApi(`${endpoint}/${id}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey })
    },
    onError: (err: any) => {
      alert(err.message || '删除失败')
    },
  })

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg('')
    createMutation.mutate(formData)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-800">{title}</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            租户内资源，受 Casbin 细粒度权限保护与租户隔离
          </p>
        </div>
        <button
          onClick={() => {
            setErrorMsg('')
            setIsOpen(true)
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg shadow-sm transition"
        >
          <Plus className="w-4 h-4" />
          <span>{t.create}</span>
        </button>
      </div>

      {/* Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-lg font-bold text-slate-800">{t.create} {title}</h3>

            {errorMsg && (
              <div className="p-3 bg-red-50 text-red-600 text-xs rounded-lg border border-red-200 flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleCreate} className="space-y-4">
              {createFields.map((field) => (
                <div key={field.name}>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {field.label}
                  </label>
                  <input
                    type={field.type || 'text'}
                    required
                    placeholder={field.placeholder || ''}
                    value={formData[field.name] || ''}
                    onChange={(e) =>
                      setFormData({ ...formData, [field.name]: e.target.value })
                    }
                    className="w-full text-sm rounded-lg border border-slate-300 px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              ))}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="px-3 py-1.5 border border-slate-300 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-50"
                >
                  {t.cancel}
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                >
                  {createMutation.isPending ? t.loading : t.save}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Data Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-slate-400 text-sm">{t.loading}</div>
        ) : error ? (
          <div className="p-8 text-center text-red-500 text-sm">
            {(error as any).message}
          </div>
        ) : data.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-sm">{t.noData}</div>
        ) : (
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-xs font-semibold uppercase tracking-wider">
                {columns.map((c) => (
                  <th key={c.key} className="py-3 px-4">
                    {c.label}
                  </th>
                ))}
                <th className="py-3 px-4 text-right">{t.actions}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.map((row: any) => (
                <tr key={row.id} className="hover:bg-slate-50/60 transition">
                  {columns.map((col) => (
                    <td key={col.key} className="py-3 px-4 text-slate-700">
                      {col.render ? col.render(row[col.key], row) : row[col.key] || '-'}
                    </td>
                  ))}
                  <td className="py-3 px-4 text-right">
                    <button
                      onClick={() => {
                        if (confirm(t.confirmDelete)) {
                          deleteMutation.mutate(row.id)
                        }
                      }}
                      className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50"
                      title={t.delete}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
