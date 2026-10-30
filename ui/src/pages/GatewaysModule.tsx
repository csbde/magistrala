import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchApi } from '../lib/api'
import { useAuthStore } from '../store/authStore'
import { dict } from '../lib/i18n'
import type { Device, Page } from '../types'
import {
  Button,
  Dialog,
  Input,
  StatusBadge,
  CopyButton,
  EmptyState,
} from '../components/ui/primitives'
import { Plus, Cpu, Radio, Unlink, Link2, Trash2 } from 'lucide-react'

export const GatewaysModule: React.FC = () => {
  const { currentWorkspace, language } = useAuthStore()
  const t = dict[language]
  const qc = useQueryClient()

  const [createOpen, setCreateOpen] = useState(false)
  const [selectedGw, setSelectedGw] = useState<Device | null>(null)
  const [bindOpen, setBindOpen] = useState(false)
  const [bindDeviceId, setBindDeviceId] = useState('')
  const [name, setName] = useState('')

  const wsKey = ['gateways', currentWorkspace?.id]

  const { data, isLoading } = useQuery({
    queryKey: wsKey,
    queryFn: () => fetchApi<Page<Device>>('/api/gateways?limit=500'),
    enabled: !!currentWorkspace?.id,
  })

  const { data: allDevices } = useQuery({
    queryKey: ['devices', currentWorkspace?.id],
    queryFn: () => fetchApi<Page<Device>>('/api/devices?limit=500'),
    enabled: !!currentWorkspace?.id,
  })

  const childrenQuery = useQuery({
    queryKey: ['gateway-devices', selectedGw?.id],
    queryFn: () => fetchApi<Device[]>(`/api/gateways/${selectedGw!.id}/devices`),
    enabled: !!selectedGw?.id,
  })

  const create = useMutation({
    mutationFn: () =>
      fetchApi<Device>('/api/gateways', {
        method: 'POST',
        body: JSON.stringify({ name, is_gateway: true, status: 'enabled' }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: wsKey })
      setCreateOpen(false)
      setName('')
    },
    onError: (e: any) => alert(e.message),
  })

  const bind = useMutation({
    mutationFn: (deviceId: string) =>
      fetchApi(`/api/gateways/${selectedGw!.id}/devices`, {
        method: 'POST',
        body: JSON.stringify({ device_id: deviceId }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['gateway-devices', selectedGw?.id] })
      setBindOpen(false)
      setBindDeviceId('')
    },
    onError: (e: any) => alert(e.message),
  })

  const unbind = useMutation({
    mutationFn: (childId: string) =>
      fetchApi(`/api/gateways/${selectedGw!.id}/devices/${childId}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['gateway-devices', selectedGw?.id] }),
    onError: (e: any) => alert(e.message),
  })

  const deleteGw = useMutation({
    mutationFn: (id: string) => fetchApi(`/api/devices/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: wsKey }),
    onError: (e: any) => alert(e.message),
  })

  const gateways = data?.items ?? []
  const availableChildren = (allDevices?.items ?? []).filter(
    (d) => !d.is_gateway && !(childrenQuery.data ?? []).some((c) => c.id === d.id),
  )

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-800">{t.gateways}</h2>
          <p className="text-xs text-slate-500 mt-0.5">边缘网关负责汇聚现场子设备通信，支持协议转换与集中接入</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="w-4 h-4" />
          <span>新建边缘网关</span>
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Gateway List */}
        <div className="md:col-span-1 bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="p-3 border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">网关列表</div>
          {isLoading && <EmptyState text="" loading />}
          {!isLoading && gateways.length === 0 && <EmptyState text="暂无网关" />}
          <div className="divide-y divide-slate-100">
            {gateways.map((g) => {
              const active = selectedGw?.id === g.id
              return (
                <div
                  key={g.id}
                  onClick={() => setSelectedGw(g)}
                  className={`p-3.5 flex items-center justify-between cursor-pointer transition ${
                    active ? 'bg-blue-50 border-l-4 border-l-blue-600' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Cpu className={`w-5 h-5 ${active ? 'text-blue-600' : 'text-slate-400'}`} />
                    <div>
                      <div className="text-sm font-medium text-slate-800">{g.name}</div>
                      <div className="text-[11px] font-mono text-slate-400">{g.id}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <StatusBadge status={g.status} />
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        if (confirm(t.confirmDelete)) deleteGw.mutate(g.id)
                      }}
                      className="text-slate-400 hover:text-red-500 p-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Children Management */}
        <div className="md:col-span-2 bg-white border border-slate-200 rounded-xl shadow-sm p-6 space-y-4">
          {!selectedGw ? (
            <div className="p-16 text-center text-slate-400 text-sm">请在左侧选择一个网关以管理其挂载的子设备</div>
          ) : (
            <>
              <div className="flex items-center justify-between border-b border-slate-200 pb-4">
                <div>
                  <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                    <Cpu className="w-5 h-5 text-indigo-600" />
                    <span>{selectedGw.name}</span>
                  </h3>
                  <div className="flex items-center gap-2 text-xs text-slate-500 font-mono mt-0.5">
                    <span>ID: {selectedGw.id}</span>
                    <CopyButton text={selectedGw.id} />
                  </div>
                </div>
                <Button size="sm" onClick={() => setBindOpen(true)}>
                  <Link2 className="w-4 h-4" />
                  <span>添加子设备</span>
                </Button>
              </div>

              <div>
                <div className="text-xs font-semibold text-slate-700 mb-2">挂载子设备列表（{childrenQuery.data?.length ?? 0}）</div>
                {childrenQuery.isLoading ? (
                  <EmptyState text="" loading />
                ) : (childrenQuery.data ?? []).length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-400 bg-slate-50 rounded-lg border border-dashed border-slate-200">
                    该网关尚未挂载任何子设备，点击上方「添加子设备」按钮进行挂载
                  </div>
                ) : (
                  <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 overflow-hidden">
                    {(childrenQuery.data ?? []).map((c) => (
                      <div key={c.id} className="flex items-center justify-between p-3 hover:bg-slate-50">
                        <div className="flex items-center gap-2.5">
                          <Radio className="w-4 h-4 text-slate-400" />
                          <div>
                            <div className="text-sm font-medium text-slate-800">{c.name}</div>
                            <div className="text-[11px] font-mono text-slate-400">{c.id}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <StatusBadge status={c.status} />
                          <Button variant="outline" size="sm" onClick={() => unbind.mutate(c.id)}>
                            <Unlink className="w-3.5 h-3.5" />
                            <span>解挂</span>
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Create Dialog */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} title="新建边缘网关">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            create.mutate()
          }}
          className="space-y-4"
        >
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">网关名称 *</label>
            <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：工业边缘计算网关 A01" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>{t.cancel}</Button>
            <Button type="submit" loading={create.isPending}>{t.save}</Button>
          </div>
        </form>
      </Dialog>

      {/* Bind Child Dialog */}
      <Dialog
        open={bindOpen}
        onClose={() => setBindOpen(false)}
        title={`挂载子设备至 · ${selectedGw?.name ?? ''}`}
        footer={
          <>
            <Button variant="outline" onClick={() => setBindOpen(false)}>{t.cancel}</Button>
            <Button disabled={!bindDeviceId} onClick={() => bindDeviceId && bind.mutate(bindDeviceId)}>确认挂载</Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="text-xs text-slate-500">选择要挂载到当前网关的直连设备：</div>
          <div className="max-h-64 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
            {availableChildren.length === 0 && <div className="p-6 text-center text-xs text-slate-400">无可挂载的直连设备</div>}
            {availableChildren.map((d) => (
              <label key={d.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 cursor-pointer">
                <input
                  type="radio"
                  name="child"
                  checked={bindDeviceId === d.id}
                  onChange={() => setBindDeviceId(d.id)}
                  className="accent-blue-600"
                />
                <div className="flex-1">
                  <div className="text-sm text-slate-800">{d.name}</div>
                  <div className="text-[11px] font-mono text-slate-400">{d.id}</div>
                </div>
                <StatusBadge status={d.status} />
              </label>
            ))}
          </div>
        </div>
      </Dialog>
    </div>
  )
}
