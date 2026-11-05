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
import {
  Plus,
  Cpu,
  Radio,
  Unlink,
  Link2,
  Trash2,
  Activity,
  CheckCircle2,
  Clock,
  Send,
  HelpCircle,
  Network,
} from 'lucide-react'
import { useToast } from '../components/ui/Toast'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'

export const GatewaysModule: React.FC = () => {
  const { currentWorkspace, language } = useAuthStore()
  const t = dict[language]
  const qc = useQueryClient()
  const { success, error: toastError } = useToast()

  const [createOpen, setCreateOpen] = useState(false)
  const [selectedGw, setSelectedGw] = useState<Device | null>(null)
  const [bindOpen, setBindOpen] = useState(false)
  const [selectedChildIds, setSelectedChildIds] = useState<string[]>([])
  const [name, setName] = useState('')
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)

  // Relay test state
  const [relayChildId, setRelayChildId] = useState('')
  const [relayPayload, setRelayPayload] = useState('{\n  "temperature": 25.6,\n  "humidity": 62\n}')
  const [relaySending, setRelaySending] = useState(false)

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
    queryFn: () => fetchApi<any>(`/api/gateways/${selectedGw!.id}/devices`),
    enabled: !!selectedGw?.id,
  })

  const create = useMutation({
    mutationFn: () =>
      fetchApi<Device>('/api/gateways', {
        method: 'POST',
        body: JSON.stringify({ name, is_gateway: true, status: 'enabled' }),
      }),
    onSuccess: (newGw) => {
      qc.invalidateQueries({ queryKey: wsKey })
      setCreateOpen(false)
      setName('')
      setSelectedGw(newGw)
      success('边缘网关创建成功')
    },
    onError: (e: any) => toastError(e.message || '创建网关失败'),
  })

  const bindBatch = useMutation({
    mutationFn: (deviceIds: string[]) =>
      fetchApi(`/api/gateways/${selectedGw!.id}/devices`, {
        method: 'POST',
        body: JSON.stringify({ device_ids: deviceIds }),
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['gateway-devices', selectedGw?.id] })
      setBindOpen(false)
      setSelectedChildIds([])
      success(`已成功挂载 ${res.count || selectedChildIds.length} 台子设备到网关`)
    },
    onError: (e: any) => toastError(e.message || '挂载子设备失败'),
  })

  const unbind = useMutation({
    mutationFn: (childId: string) =>
      fetchApi(`/api/gateways/${selectedGw!.id}/devices/${childId}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['gateway-devices', selectedGw?.id] })
      success('已解除子设备挂载')
    },
    onError: (e: any) => toastError(e.message || '解除挂载失败'),
  })

  const deleteGw = useMutation({
    mutationFn: (id: string) => fetchApi(`/api/devices/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: wsKey })
      setDeleteTargetId(null)
      if (selectedGw?.id === deleteTargetId) {
        setSelectedGw(null)
      }
      success('边缘网关已删除')
    },
    onError: (e: any) => toastError(e.message || '删除网关失败'),
  })

  const handleSimulateRelay = async () => {
    if (!selectedGw || !relayChildId) {
      toastError('请选择被中继的子设备')
      return
    }
    setRelaySending(true)
    try {
      // Find a default channel to send message
      const channelsRes = await fetchApi<Page<any>>('/api/channels?limit=1')
      const targetChan = channelsRes.items?.[0]
      if (!targetChan) {
        throw new Error('未检测到可用的通信通道，请先创建通道')
      }

      await fetchApi(`/api/channels/${targetChan.id}/messages`, {
        method: 'POST',
        body: JSON.stringify({
          subtopic: `subdevice/${relayChildId}`,
          protocol: 'gateway-relay',
          payload: relayPayload,
          name: 'gateway_relay_test',
          value: '1',
        }),
      })

      success(`网关已成功代表子设备「${relayChildId}」向通道转发遥测数据`)
      qc.invalidateQueries({ queryKey: ['gateway-devices', selectedGw.id] })
    } catch (e: any) {
      toastError(e.message || '代发测试失败')
    } finally {
      setRelaySending(false)
    }
  }

  const gateways = data?.items ?? []
  const childList: any[] = childrenQuery.data?.items ?? []
  const availableChildren = (allDevices?.items ?? []).filter(
    (d) => !d.is_gateway && !childList.some((c) => c.id === d.id),
  )

  const toggleSelectChild = (id: string) => {
    setSelectedChildIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Network className="w-5 h-5 text-blue-600" />
            <span>{t.gateways} (Gateway Reachability Management)</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            边缘网关是一条中继可达路径 (Reachability Path)，负责汇聚转发现场受限传感器，支持多路径挂载与健康监测
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="flex items-center gap-1.5">
          <Plus className="w-4 h-4" />
          <span>新建边缘网关</span>
        </Button>
      </div>

      {/* Info Banner */}
      <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900 flex items-start gap-2.5">
        <HelpCircle className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <div className="font-semibold">官方架构规范：网关是设备能力而非分组容器</div>
          <p className="text-blue-700">
            移除网关绝不会删除背后的子设备；同一台传感器可同时声明多个网关以实现冗余多路径可达；网关之间不可链式级联嵌套。
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Gateway List */}
        <div className="md:col-span-1 bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col">
          <div className="p-3 border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600 flex items-center justify-between">
            <span>已注册边缘网关</span>
            <span className="text-[11px] text-slate-400 font-mono">{gateways.length} 台</span>
          </div>
          {isLoading && <EmptyState text="" loading />}
          {!isLoading && gateways.length === 0 && <EmptyState text="暂无网关" />}
          <div className="divide-y divide-slate-100 overflow-y-auto max-h-[600px]">
            {gateways.map((g) => {
              const active = selectedGw?.id === g.id
              return (
                <div
                  key={g.id}
                  onClick={() => setSelectedGw(g)}
                  className={`p-3.5 cursor-pointer transition flex items-center justify-between ${
                    active ? 'bg-blue-50/80 border-l-4 border-blue-600' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                      <Cpu className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-slate-800">{g.name}</div>
                      <div className="text-[11px] font-mono text-slate-400">{g.id}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <StatusBadge status={g.status} />
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setDeleteTargetId(g.id)
                      }}
                      className="text-slate-400 hover:text-red-600 p-1 rounded transition"
                      title="删除网关"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Gateway Detail & Child Devices */}
        <div className="md:col-span-2 bg-white border border-slate-200 rounded-xl shadow-sm p-5 space-y-5">
          {!selectedGw ? (
            <div className="h-64 flex flex-col items-center justify-center text-xs text-slate-400 gap-2">
              <Cpu className="w-8 h-8 text-slate-300" />
              <span>请从左侧选择一个边缘网关以管理其挂载设备与拓扑</span>
            </div>
          ) : (
            <>
              {/* Selected Gateway Info */}
              <div className="flex flex-wrap items-center justify-between pb-4 border-b border-slate-200 gap-3">
                <div>
                  <div className="text-base font-bold text-slate-800 flex items-center gap-2">
                    <span>{selectedGw.name}</span>
                    <span className="text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded border border-emerald-200 font-medium">
                      网关能力已启用
                    </span>
                  </div>
                  <div className="text-xs font-mono text-slate-400 mt-1 flex items-center gap-2">
                    <span>ID: {selectedGw.id}</span>
                    <CopyButton text={selectedGw.id} label="复制 ID" />
                    <span className="text-slate-300">|</span>
                    <span>Secret: {selectedGw.credentials?.secret || '-'}</span>
                    <CopyButton text={selectedGw.credentials?.secret || ''} label="复制 Secret" />
                  </div>
                </div>
                <Button onClick={() => setBindOpen(true)} className="flex items-center gap-1.5 text-xs">
                  <Link2 className="w-4 h-4" />
                  <span>添加挂载子设备</span>
                </Button>
              </div>

              {/* Declared vs Observed Subdevices Panel */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs font-bold text-slate-800 flex items-center gap-2">
                    <span>挂载子设备声明与活跃监测 (Declared & Observed)</span>
                    <span className="text-[11px] text-slate-400 font-normal">（{childList.length} 台）</span>
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-slate-500">
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                      <span>Healthy 在线活跃</span>
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-slate-300 inline-block" />
                      <span>Silent 静默中</span>
                    </span>
                  </div>
                </div>

                {childrenQuery.isLoading ? (
                  <EmptyState text="" loading />
                ) : childList.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-400 bg-slate-50 rounded-lg border border-dashed border-slate-200">
                    该网关尚未声明任何中继子设备，点击右上角「添加挂载子设备」声明可达路径
                  </div>
                ) : (
                  <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 overflow-hidden">
                    {childList.map((c) => {
                      const isHealthy = c.liveness_status === 'healthy'
                      return (
                        <div key={c.id} className="flex items-center justify-between p-3 hover:bg-slate-50 transition text-xs">
                          <div className="flex items-center gap-3">
                            <Radio className={`w-4 h-4 ${isHealthy ? 'text-emerald-600' : 'text-slate-400'}`} />
                            <div>
                              <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                                <span>{c.name}</span>
                                {isHealthy ? (
                                  <span className="inline-flex items-center gap-0.5 text-[10px] bg-emerald-50 text-emerald-700 px-1.5 py-0.2 rounded border border-emerald-200 font-medium">
                                    <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" />
                                    <span>Healthy</span>
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-0.5 text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded font-medium">
                                    <Clock className="w-2.5 h-2.5 text-slate-400" />
                                    <span>Silent</span>
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] font-mono text-slate-400">{c.id}</div>
                            </div>
                          </div>

                          <div className="flex items-center gap-3">
                            {c.last_seen_at ? (
                              <span className="text-[11px] text-slate-500">
                                最近上报: {new Date(c.last_seen_at).toLocaleTimeString()}
                              </span>
                            ) : (
                              <span className="text-[11px] text-slate-400">尚无上报流量</span>
                            )}
                            <StatusBadge status={c.status} />
                            <Button variant="outline" size="sm" onClick={() => unbind.mutate(c.id)} className="text-xs">
                              <Unlink className="w-3.5 h-3.5" />
                              <span>解挂</span>
                            </Button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Gateway Relay Simulation Console */}
              {childList.length > 0 && (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <Activity className="w-4 h-4 text-blue-600" />
                      <span>网关中继代发遥测测试台 (Relay Publisher)</span>
                    </span>
                    <span className="text-[11px] text-slate-400">
                      模拟网关携带子设备凭证代理上报
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                        选择代理子设备 (Subdevice) *
                      </label>
                      <select
                        className="w-full text-xs border border-slate-300 rounded-lg p-2 bg-white"
                        value={relayChildId}
                        onChange={(e) => setRelayChildId(e.target.value)}
                      >
                        <option value="">-- 选择要代表的子设备 --</option>
                        {childList.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} ({c.id})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                        遥测数据 JSON Payload
                      </label>
                      <input
                        className="w-full text-xs font-mono border border-slate-300 rounded-lg p-2 bg-white"
                        value={relayPayload}
                        onChange={(e) => setRelayPayload(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="flex justify-end pt-1">
                    <Button
                      size="sm"
                      disabled={!relayChildId || relaySending}
                      loading={relaySending}
                      onClick={handleSimulateRelay}
                      className="flex items-center gap-1.5 text-xs"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>模拟网关中继上报</span>
                    </Button>
                  </div>
                </div>
              )}
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

      {/* Batch Bind Child Dialog */}
      <Dialog
        open={bindOpen}
        onClose={() => setBindOpen(false)}
        title={`批量挂载子设备至网关 · ${selectedGw?.name ?? ''}`}
        footer={
          <>
            <Button variant="outline" onClick={() => setBindOpen(false)}>{t.cancel}</Button>
            <Button
              disabled={selectedChildIds.length === 0}
              loading={bindBatch.isPending}
              onClick={() => bindBatch.mutate(selectedChildIds)}
            >
              确认挂载 ({selectedChildIds.length} 台)
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="text-xs text-slate-500">勾选要声明在该网关可达路径下的直连设备（支持多选）：</div>
          <div className="max-h-64 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
            {availableChildren.length === 0 && <div className="p-6 text-center text-xs text-slate-400">当前没有可挂载的直连设备</div>}
            {availableChildren.map((d) => (
              <label key={d.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedChildIds.includes(d.id)}
                  onChange={() => toggleSelectChild(d.id)}
                  className="accent-blue-600 rounded"
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

      <ConfirmDialog
        open={!!deleteTargetId}
        title="确认删除网关"
        message="删除边缘网关将解除所有子设备的中继路径绑定，但子设备本身不会被删除。确定要继续吗？"
        loading={deleteGw.isPending}
        onConfirm={() => {
          if (deleteTargetId) deleteGw.mutate(deleteTargetId)
        }}
        onClose={() => setDeleteTargetId(null)}
      />
    </div>
  )
}
