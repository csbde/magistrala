import React, { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchApi } from '../lib/api'
import { useAuthStore } from '../store/authStore'
import { dict } from '../lib/i18n'
import type { Device, Channel, MessageRecord, Alarm, Journal, Page } from '../types'
import {
  Button,
  Dialog,
  Field,
  Input,
  Select,
  Tabs,
  Textarea,
  StatusBadge,
  SeverityBadge,
  Badge,
  CopyButton,
  EmptyState,
} from '../components/ui/primitives'
import {
  Plus,
  Eye,
  EyeOff,
  Trash2,
  KeyRound,
  Link2,
  Unlink,
  Settings,
  Radio,
  Activity,
  BellRing,
  ScrollText,
  Search,
  RefreshCw,
  Cpu,
  Send,
  Power,
} from 'lucide-react'

type TabId = 'general' | 'credentials' | 'channels' | 'telemetry' | 'alarms' | 'journals'

export const DevicesModule: React.FC = () => {
  const { currentWorkspace, language } = useAuthStore()
  const t = dict[language]
  const qc = useQueryClient()

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [detailDevice, setDetailDevice] = useState<Device | null>(null)
  const [activeTab, setActiveTab] = useState<TabId>('general')
  const [connectTarget, setConnectTarget] = useState<Device | null>(null)
  const [secretTarget, setSecretTarget] = useState<Device | null>(null)
  const [newSecret, setNewSecret] = useState('')
  const [revealed, setRevealed] = useState<Record<string, boolean>>({})

  const [form, setForm] = useState({
    name: '',
    device_type: '',
    is_gateway: false,
    tags: '',
    metadata: '{\n  "location": "",\n  "firmware": "v1.0.0"\n}',
    status: 'enabled',
  })

  const wsKey = ['devices', currentWorkspace?.id]

  const { data, isLoading, refetch } = useQuery({
    queryKey: wsKey,
    queryFn: () => fetchApi<Page<Device>>(`/api/devices?limit=500`),
    enabled: !!currentWorkspace?.id,
  })

  const { data: channelsData } = useQuery({
    queryKey: ['channels', currentWorkspace?.id],
    queryFn: () => fetchApi<Page<Channel>>('/api/channels?limit=500'),
    enabled: !!currentWorkspace?.id,
  })

  const createMutation = useMutation({
    mutationFn: (payload: any) => fetchApi<Device>('/api/devices', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: wsKey })
      setCreateOpen(false)
      setForm({ name: '', device_type: '', is_gateway: false, tags: '', metadata: '{\n  "location": "",\n  "firmware": "v1.0.0"\n}', status: 'enabled' })
    },
    onError: (e: any) => alert(e.message),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => fetchApi(`${'/api/devices'}/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: wsKey }),
    onError: (e: any) => alert(e.message),
  })

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      fetchApi<Device>(`/api/devices/${id}`, { method: 'PUT', body: JSON.stringify({ status }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: wsKey }),
    onError: (e: any) => alert(e.message),
  })

  const resetMutation = useMutation({
    mutationFn: (id: string) => fetchApi<{ secret: string }>(`/api/devices/${id}/secret`, { method: 'POST' }),
    onSuccess: (res) => {
      setNewSecret(res.secret)
      qc.invalidateQueries({ queryKey: wsKey })
    },
    onError: (e: any) => alert(e.message),
  })

  const connectMutation = useMutation({
    mutationFn: ({ deviceId, channelId, disconnect }: { deviceId: string; channelId: string; disconnect?: boolean }) =>
      fetchApi(`/api/devices/${deviceId}/channels/${channelId}`, { method: disconnect ? 'DELETE' : 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: wsKey })
      qc.invalidateQueries({ queryKey: ['device-channels', detailDevice?.id] })
    },
    onError: (e: any) => alert(e.message),
  })

  const devices = data?.items ?? []
  const channels = channelsData?.items ?? []

  const filtered = useMemo(
    () =>
      devices.filter((d) => {
        if (statusFilter && d.status !== statusFilter) return false
        if (!search) return true
        const q = search.toLowerCase()
        return (
          d.name?.toLowerCase().includes(q) ||
          d.id?.toLowerCase().includes(q) ||
          (d.tags ?? []).some((tag) => tag.toLowerCase().includes(q))
        )
      }),
    [devices, search, statusFilter],
  )

  const openDetail = (d: Device) => {
    setDetailDevice(d)
    setActiveTab('general')
  }

  const submitCreate = (e: React.FormEvent) => {
    e.preventDefault()
    let metadata: Record<string, any> = {}
    try {
      metadata = form.metadata ? JSON.parse(form.metadata) : {}
    } catch {
      alert('Metadata 必须是合法的 JSON 格式')
      return
    }
    createMutation.mutate({
      name: form.name,
      device_type: form.device_type || undefined,
      is_gateway: form.is_gateway,
      status: form.status,
      tags: form.tags ? form.tags.split(',').map((s) => s.trim()).filter(Boolean) : [],
      metadata,
    })
  }

  const tabItems = [
    { id: 'general', label: '基本信息', icon: Settings },
    { id: 'credentials', label: '通信凭证', icon: KeyRound },
    { id: 'channels', label: '通道连接', icon: Link2 },
    { id: 'telemetry', label: '遥测测试台', icon: Activity },
    { id: 'alarms', label: '关联告警', icon: BellRing },
    { id: 'journals', label: '审计日志', icon: ScrollText },
  ]

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-800">{t.devices}</h2>
          <p className="text-xs text-slate-500 mt-0.5">租户内资源，受 Casbin 细粒度权限保护与租户隔离</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
            <Input
              placeholder={t.search}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 w-52"
            />
          </div>
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-32">
            <option value="">全部状态</option>
            <option value="enabled">启用</option>
            <option value="disabled">停用</option>
          </Select>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4" />
            <span>新建设备</span>
          </Button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        {isLoading ? (
          <EmptyState text="" loading />
        ) : filtered.length === 0 ? (
          <EmptyState text={t.noData} />
        ) : (
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-xs font-semibold uppercase tracking-wider">
                <th className="py-3 px-4">设备名称</th>
                <th className="py-3 px-4">设备 ID</th>
                <th className="py-3 px-4">类型</th>
                <th className="py-3 px-4">通信密钥</th>
                <th className="py-3 px-4">标签</th>
                <th className="py-3 px-4">{t.status}</th>
                <th className="py-3 px-4 text-right">{t.actions}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((d) => {
                const secret = d.credentials?.secret ?? ''
                return (
                  <tr key={d.id} className="hover:bg-slate-50/60 transition">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        {d.is_gateway ? <Cpu className="w-4 h-4 text-indigo-500" /> : <Radio className="w-4 h-4 text-slate-400" />}
                        <button onClick={() => openDetail(d)} className="font-medium text-slate-800 hover:text-blue-600 text-left">
                          {d.name}
                        </button>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-[11px] text-slate-500 truncate max-w-[120px]">{d.id}</span>
                        <CopyButton text={d.id} label="" />
                      </div>
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      {d.is_gateway ? <Badge className="bg-indigo-100 text-indigo-800 border-indigo-200">网关</Badge> : <span>{d.device_type || '直连设备'}</span>}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-[11px] text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
                          {revealed[d.id] ? secret || '未配置' : secret ? `${secret.slice(0, 6)}••••••` : '未配置'}
                        </span>
                        {secret && (
                          <>
                            <button onClick={() => setRevealed({ ...revealed, [d.id]: !revealed[d.id] })} className="text-slate-400 hover:text-slate-700">
                              {revealed[d.id] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                            </button>
                            <CopyButton text={secret} label="" />
                          </>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex flex-wrap gap-1">
                        {(d.tags ?? []).map((tag) => (
                          <Badge key={tag}>{tag}</Badge>
                        ))}
                        {(!d.tags || d.tags.length === 0) && <span className="text-slate-300 text-xs">-</span>}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <StatusBadge status={d.status} />
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openDetail(d)} title="查看详情">
                          <Settings className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setConnectTarget(d)} title={t.connectChannel}>
                          <Link2 className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => statusMutation.mutate({ id: d.id, status: d.status === 'enabled' ? 'disabled' : 'enabled' })}
                          title={d.status === 'enabled' ? '停用设备' : '启用设备'}
                        >
                          <Power className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setNewSecret('')
                            setSecretTarget(d)
                          }}
                          title={t.resetSecret}
                        >
                          <KeyRound className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            if (confirm(t.confirmDelete)) deleteMutation.mutate(d.id)
                          }}
                          title={t.delete}
                        >
                          <Trash2 className="w-3.5 h-3.5 text-red-500" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ------------------------------ Create dialog ------------------------------ */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} title="新建设备" description="创建设备后系统会自动分配 MQTT 通信密钥">
        <form onSubmit={submitCreate} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">设备名称 *</label>
            <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="例如：厂区温湿度传感器 01" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">设备类型</label>
              <Input value={form.device_type} onChange={(e) => setForm({ ...form, device_type: e.target.value })} placeholder="sensor / actuator" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">{t.status}</label>
              <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="enabled">启用</option>
                <option value="disabled">停用</option>
              </Select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">标签（逗号分隔）</label>
            <Input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="车间A, 温湿度, 重要" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Metadata (JSON)</label>
            <Textarea rows={4} value={form.metadata} onChange={(e) => setForm({ ...form, metadata: e.target.value })} />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.is_gateway}
              onChange={(e) => setForm({ ...form, is_gateway: e.target.checked })}
              className="rounded border-slate-300"
            />
            <span>标记为边缘网关（可挂载子设备）</span>
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>{t.cancel}</Button>
            <Button type="submit" loading={createMutation.isPending}>{t.save}</Button>
          </div>
        </form>
      </Dialog>

      {/* --------------------------- Reset secret dialog --------------------------- */}
      <Dialog
        open={!!secretTarget}
        onClose={() => {
          setSecretTarget(null)
          setNewSecret('')
        }}
        title="重置设备通信密钥"
        description={secretTarget ? `设备：${secretTarget.name} (${secretTarget.id})` : ''}
        footer={
          <>
            <Button variant="outline" onClick={() => { setSecretTarget(null); setNewSecret('') }}>{t.cancel}</Button>
            {!newSecret ? (
              <Button variant="danger" loading={resetMutation.isPending} onClick={() => secretTarget && resetMutation.mutate(secretTarget.id)}>
                <KeyRound className="w-4 h-4" />
                <span>确认重置</span>
              </Button>
            ) : (
              <Button variant="success" onClick={() => { setSecretTarget(null); setNewSecret('') }}>完成</Button>
            )}
          </>
        }
      >
        {!newSecret ? (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
            重置后旧密钥立即失效，所有使用该密钥连接的 MQTT 设备必须更新凭证后重连。
          </div>
        ) : (
          <div className="space-y-3">
            <div className="text-xs text-emerald-700 font-medium">新密钥已生成，请立即复制并下发至设备（仅显示一次）：</div>
            <div className="flex items-center gap-2 p-3 bg-slate-900 rounded-lg">
              <code className="text-emerald-300 font-mono text-xs flex-1 break-all">{newSecret}</code>
              <CopyButton text={newSecret} label="复制" />
            </div>
            <div className="text-[11px] text-slate-500">
              MQTT 用户名：<code className="font-mono text-slate-700">{secretTarget?.id}</code>
            </div>
          </div>
        )}
      </Dialog>

      {/* --------------------------- Connect channel dialog ------------------------ */}
      <ConnectChannelDialog
        device={connectTarget}
        channels={channels}
        onClose={() => setConnectTarget(null)}
        onConfirm={(channelId) => {
          if (connectTarget) connectMutation.mutate({ deviceId: connectTarget.id, channelId })
          setConnectTarget(null)
        }}
      />

      {/* ------------------------------ Detail dialog ----------------------------- */}
      <Dialog
        open={!!detailDevice}
        onClose={() => setDetailDevice(null)}
        title={detailDevice ? `设备详情 · ${detailDevice.name}` : ''}
        description={detailDevice ? detailDevice.id : ''}
        width="max-w-3xl"
      >
        {detailDevice && (
          <div className="space-y-4">
            <Tabs items={tabItems} value={activeTab} onChange={(id) => setActiveTab(id as TabId)} />
            {activeTab === 'general' && <DeviceGeneralTab device={detailDevice} onChanged={() => {
              qc.invalidateQueries({ queryKey: wsKey })
              setDetailDevice(null)
            }} />}
            {activeTab === 'credentials' && <DeviceCredentialsTab device={detailDevice} />}
            {activeTab === 'channels' && (
              <DeviceChannelsTab
                device={detailDevice}
                channels={channels}
                onConnect={(channelId) => connectMutation.mutate({ deviceId: detailDevice.id, channelId })}
                onDisconnect={(channelId) => connectMutation.mutate({ deviceId: detailDevice.id, channelId, disconnect: true })}
              />
            )}
            {activeTab === 'telemetry' && <DeviceTelemetryTab device={detailDevice} channels={channels} />}
            {activeTab === 'alarms' && <DeviceAlarmsTab deviceId={detailDevice.id} />}
            {activeTab === 'journals' && <DeviceJournalsTab deviceId={detailDevice.id} />}
          </div>
        )}
      </Dialog>
    </div>
  )
}

/* ------------------------------ Sub components ------------------------------ */

const ConnectChannelDialog: React.FC<{
  device: Device | null
  channels: Channel[]
  onClose: () => void
  onConfirm: (channelId: string) => void
}> = ({ device, channels, onClose, onConfirm }) => {
  const [selected, setSelected] = useState('')
  const [keyword, setKeyword] = useState('')
  const list = channels.filter((c) => c.name.toLowerCase().includes(keyword.toLowerCase()) || c.id.includes(keyword))

  return (
    <Dialog
      open={!!device}
      onClose={onClose}
      title={`绑定通信通道 · ${device?.name ?? ''}`}
      description="设备只能向已绑定的通道收发消息（由 Webhook ACL 校验）"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>{dict.zh.cancel}</Button>
          <Button disabled={!selected} onClick={() => selected && onConfirm(selected)}>确认绑定</Button>
        </>
      }
    >
      <div className="space-y-3">
        <Input placeholder="搜索通道名称或 ID" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
        <div className="max-h-64 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
          {list.length === 0 && <div className="p-6 text-center text-xs text-slate-400">暂无可用通道</div>}
          {list.map((c) => (
            <label key={c.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 cursor-pointer">
              <input type="radio" name="chan" checked={selected === c.id} onChange={() => setSelected(c.id)} className="accent-blue-600" />
              <div className="flex-1">
                <div className="text-sm text-slate-800">{c.name}</div>
                <div className="text-[11px] font-mono text-slate-400">{c.id}</div>
              </div>
              <StatusBadge status={c.status} />
            </label>
          ))}
        </div>
      </div>
    </Dialog>
  )
}

const DeviceGeneralTab: React.FC<{ device: Device; onChanged: () => void }> = ({ device, onChanged }) => {
  const [name, setName] = useState(device.name)
  const [status, setStatus] = useState(device.status)
  const [tags, setTags] = useState((device.tags ?? []).join(', '))
  const [metadata, setMetadata] = useState(JSON.stringify(device.metadata ?? {}, null, 2))
  const qc = useQueryClient()

  const save = useMutation({
    mutationFn: (payload: any) => fetchApi(`/api/devices/${device.id}`, { method: 'PUT', body: JSON.stringify(payload) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['devices'] })
      onChanged()
    },
    onError: (e: any) => alert(e.message),
  })

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
        <Field label="设备 ID" value={device.id} mono />
        <Field label="所属工作区" value={device.workspace_id} mono />
        <Field label="创建时间" value={new Date(device.created_at).toLocaleString()} />
        <Field label="设备类型" value={device.device_type || '直连设备'} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">设备名称</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">状态</label>
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="enabled">启用</option>
            <option value="disabled">停用</option>
          </Select>
        </div>
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-1">标签（逗号分隔）</label>
        <Input value={tags} onChange={(e) => setTags(e.target.value)} />
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-1">Metadata (JSON)</label>
        <Textarea rows={5} value={metadata} onChange={(e) => setMetadata(e.target.value)} />
      </div>
      <div className="flex justify-end">
        <Button
          loading={save.isPending}
          onClick={() => {
            let parsed: Record<string, any> = {}
            try {
              parsed = JSON.parse(metadata || '{}')
            } catch {
              alert('Metadata JSON 格式错误')
              return
            }
            save.mutate({
              name,
              status,
              tags: tags.split(',').map((s) => s.trim()).filter(Boolean),
              metadata: parsed,
            })
          }}
        >
          保存修改
        </Button>
      </div>
    </div>
  )
}

const DeviceCredentialsTab: React.FC<{ device: Device }> = ({ device }) => {
  const secret = device.credentials?.secret ?? ''
  const clientId = device.id
  const [confirmReset, setConfirmReset] = useState(false)
  const [newSecret, setNewSecret] = useState('')
  const qc = useQueryClient()

  const reset = useMutation({
    mutationFn: () => fetchApi<{ secret: string }>(`/api/devices/${device.id}/secret`, { method: 'POST' }),
    onSuccess: (res) => {
      setNewSecret(res.secret)
      setConfirmReset(false)
      qc.invalidateQueries({ queryKey: ['devices'] })
    },
    onError: (e: any) => alert(e.message),
  })

  const mqttCommand = `mosquitto_sub -h localhost -p 1883 -u "${clientId}" -P "${newSecret || secret}" -t "channels/<channel_id>/messages"`

  return (
    <div className="space-y-4">
      <div className="p-4 bg-slate-900 rounded-lg space-y-3">
        <div className="text-xs text-slate-400 font-medium">MQTT 接入凭证 (FluxMQ / EMQX)</div>
        <div className="grid grid-cols-1 gap-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-slate-400 w-24">Username</span>
            <code className="text-emerald-300 font-mono text-xs flex-1 break-all">{clientId}</code>
            <CopyButton text={clientId} />
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-slate-400 w-24">Password</span>
            <code className="text-emerald-300 font-mono text-xs flex-1 break-all">{newSecret || secret || '未配置'}</code>
            {(newSecret || secret) && <CopyButton text={newSecret || secret} />}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <div className="text-xs font-semibold text-slate-700">一键复制连接命令</div>
        <pre className="p-3 bg-slate-50 border border-slate-200 rounded-lg font-mono text-[11px] text-slate-700 whitespace-pre-wrap">{mqttCommand}</pre>
        <CopyButton text={mqttCommand} label="复制命令" />
      </div>

      <div className="flex justify-end">
        {!confirmReset ? (
          <Button variant="outline" onClick={() => setConfirmReset(true)}>
            <KeyRound className="w-4 h-4" />
            <span>重置密钥</span>
          </Button>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-xs text-red-600">确认重置？旧密钥立即失效</span>
            <Button variant="outline" size="sm" onClick={() => setConfirmReset(false)}>取消</Button>
            <Button variant="danger" size="sm" loading={reset.isPending} onClick={() => reset.mutate()}>确认</Button>
          </div>
        )}
      </div>
    </div>
  )
}

const DeviceChannelsTab: React.FC<{
  device: Device
  channels: Channel[]
  onConnect: (channelId: string) => void
  onDisconnect: (channelId: string) => void
}> = ({ device, channels, onConnect, onDisconnect }) => {
  const [pickOpen, setPickOpen] = useState(false)
  const { data, isLoading } = useQuery({
    queryKey: ['device-channels', device.id],
    queryFn: () => fetchApi<Channel[]>(`/api/devices/${device.id}/channels`),
  })

  const connected = data ?? []
  const available = channels.filter((c) => !connected.some((x) => x.id === c.id))

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs text-slate-500">设备已绑定 {connected.length} 个通道，可绑定 {available.length} 个</div>
        <Button size="sm" onClick={() => setPickOpen(true)} disabled={available.length === 0}>
          <Link2 className="w-3.5 h-3.5" />
          <span>绑定通道</span>
        </Button>
      </div>

      <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 overflow-hidden">
        {isLoading && <div className="p-6 text-center text-xs text-slate-400">加载中...</div>}
        {!isLoading && connected.length === 0 && <div className="p-6 text-center text-xs text-slate-400">尚未绑定任何通道</div>}
        {connected.map((c) => (
          <div key={c.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50">
            <Radio className="w-4 h-4 text-blue-500" />
            <div className="flex-1">
              <div className="text-sm text-slate-800">{c.name}</div>
              <div className="text-[11px] font-mono text-slate-400">{c.id}</div>
              <div className="text-[10px] font-mono text-slate-400">
                主题: channels/{c.id}/messages
              </div>
            </div>
            <StatusBadge status={c.status} />
            <Button variant="outline" size="sm" onClick={() => onDisconnect(c.id)}>
              <Unlink className="w-3.5 h-3.5" />
              <span>解绑</span>
            </Button>
          </div>
        ))}
      </div>

      <ConnectChannelDialog
        device={pickOpen ? device : null}
        channels={available}
        onClose={() => setPickOpen(false)}
        onConfirm={(channelId) => {
          onConnect(channelId)
          setPickOpen(false)
        }}
      />
    </div>
  )
}

const DeviceTelemetryTab: React.FC<{ device: Device; channels?: Channel[] }> = ({ device }) => {
  const connectedQuery = useQuery({
    queryKey: ['device-channels', device.id],
    queryFn: () => fetchApi<Channel[]>(`/api/devices/${device.id}/channels`),
  })
  const bound = connectedQuery.data ?? []
  const [channelId, setChannelId] = useState('')
  const [subtopic, setSubtopic] = useState('temperature')
  const [payload, setPayload] = useState('{\n  "temperature": 26.5,\n  "humidity": 58.2,\n  "unit": "celsius"\n}')
  const [sent, setSent] = useState<MessageRecord | null>(null)

  const activeChannel = channelId || bound[0]?.id || ''

  const send = useMutation({
    mutationFn: () =>
      fetchApi<MessageRecord>(`/api/channels/${activeChannel}/messages`, {
        method: 'POST',
        body: JSON.stringify({
          publisher: device.id,
          protocol: 'mqtt',
          subtopic,
          payload,
          name: subtopic,
        }),
      }),
    onSuccess: (m) => setSent(m),
    onError: (e: any) => alert(e.message),
  })

  const historyQuery = useQuery({
    queryKey: ['messages', activeChannel, sent?.id],
    queryFn: () => fetchApi<MessageRecord[]>(`/api/channels/${activeChannel}/messages?limit=20`),
    enabled: !!activeChannel,
  })

  if (bound.length === 0) {
    return <div className="p-6 text-center text-xs text-amber-600 bg-amber-50 rounded-lg border border-amber-200">请先在「通道连接」标签中绑定至少一个通道，再模拟发送遥测数据。</div>
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">目标通道</label>
          <Select value={activeChannel} onChange={(e) => setChannelId(e.target.value)}>
            {bound.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">子主题 Subtopic</label>
          <Input value={subtopic} onChange={(e) => setSubtopic(e.target.value)} placeholder="temperature" />
        </div>
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-1">Payload (JSON / SenML)</label>
        <Textarea rows={5} value={payload} onChange={(e) => setPayload(e.target.value)} />
      </div>
      <div className="flex items-center justify-between">
        <code className="text-[11px] font-mono text-slate-500">channels/{activeChannel}/messages/{subtopic}</code>
        <Button loading={send.isPending} onClick={() => send.mutate()}>
          <Send className="w-4 h-4" />
          <span>模拟上报遥测</span>
        </Button>
      </div>

      <div>
        <div className="text-xs font-semibold text-slate-700 mb-2">通道最新消息（{historyQuery.data?.length ?? 0}）</div>
        <div className="border border-slate-200 rounded-lg max-h-48 overflow-y-auto divide-y divide-slate-100 font-mono text-[11px]">
          {(historyQuery.data ?? []).map((m) => (
            <div key={m.id} className="px-3 py-2 flex items-start gap-2">
              <span className="text-slate-400 shrink-0">{new Date(m.created_at).toLocaleTimeString()}</span>
              <span className="text-blue-600 shrink-0">[{m.subtopic || '-'}]</span>
              <span className="text-slate-700 break-all whitespace-pre-wrap">{m.payload}</span>
            </div>
          ))}
          {historyQuery.data?.length === 0 && <div className="p-4 text-center text-slate-400">暂无消息</div>}
        </div>
      </div>
    </div>
  )
}

const DeviceAlarmsTab: React.FC<{ deviceId: string }> = ({ deviceId }) => {
  const { data, isLoading } = useQuery({
    queryKey: ['alarms-all'],
    queryFn: () => fetchApi<Page<Alarm>>('/api/alarms?limit=500'),
  })
  const list = (data?.items ?? []).filter((a) => a.device_id === deviceId)
  if (isLoading) return <EmptyState text="" loading />
  if (list.length === 0) return <div className="p-6 text-center text-xs text-slate-400">该设备暂无告警记录</div>
  return (
    <div className="space-y-2">
      {list.map((a) => (
        <div key={a.id} className="flex items-center gap-3 p-3 border border-slate-200 rounded-lg">
          <BellRing className="w-4 h-4 text-red-500" />
          <div className="flex-1">
            <div className="text-sm text-slate-800">{a.summary}</div>
            <div className="text-[11px] text-slate-400">{new Date(a.created_at).toLocaleString()}</div>
          </div>
          <SeverityBadge severity={a.severity} />
          <StatusBadge status={a.status} />
        </div>
      ))}
    </div>
  )
}

const DeviceJournalsTab: React.FC<{ deviceId: string }> = ({ deviceId }) => {
  const { data, isLoading } = useQuery({
    queryKey: ['journals', deviceId],
    queryFn: () => fetchApi<Journal[]>(`/api/journals?entity_id=${deviceId}&limit=50`),
  })
  if (isLoading) return <EmptyState text="" loading />
  const list = data ?? []
  if (list.length === 0) return <div className="p-6 text-center text-xs text-slate-400">暂无审计日志</div>
  return (
    <div className="relative pl-4">
      <div className="absolute left-1 top-1 bottom-1 w-px bg-slate-200" />
      <div className="space-y-3">
        {list.map((j) => (
          <div key={j.id} className="relative">
            <div className="absolute -left-[13px] top-1.5 w-2 h-2 rounded-full bg-blue-500" />
            <div className="text-xs text-slate-700">
              <span className="font-mono text-blue-600">{j.operation}</span>
              <span className="text-slate-400 ml-2">{new Date(j.created_at).toLocaleString()}</span>
            </div>
            {j.attributes && Object.keys(j.attributes).length > 0 && (
              <div className="text-[11px] font-mono text-slate-500 mt-0.5">{JSON.stringify(j.attributes)}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
