import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchApi } from '../lib/api'
import { useAuthStore } from '../store/authStore'
import { dict } from '../lib/i18n'
import type { Channel, Device, MessageRecord, Page } from '../types'
import {
  Button,
  Dialog,
  Field,
  Input,
  Select,
  Tabs,
  Textarea,
  StatusBadge,
  CopyButton,
  EmptyState,
} from '../components/ui/primitives'
import {
  Plus,
  Radio,
  Cpu,
  Trash2,
  Unlink,
  Link2,
  Send,
  RefreshCw,
  Activity,
  Settings,
  Search,
} from 'lucide-react'

type TabId = 'general' | 'devices' | 'simulator'

export const ChannelsModule: React.FC = () => {
  const { currentWorkspace, language } = useAuthStore()
  const t = dict[language]
  const qc = useQueryClient()

  const [search, setSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [detailChannel, setDetailChannel] = useState<Channel | null>(null)
  const [activeTab, setActiveTab] = useState<TabId>('general')
  const [connectOpen, setConnectOpen] = useState(false)
  const [selectedDevId, setSelectedDevId] = useState('')

  const [form, setForm] = useState({
    name: '',
    metadata: '{\n  "protocol": "mqtt"\n}',
    status: 'enabled',
  })

  const wsKey = ['channels', currentWorkspace?.id]

  const { data, isLoading, refetch } = useQuery({
    queryKey: wsKey,
    queryFn: () => fetchApi<Page<Channel>>('/api/channels?limit=500'),
    enabled: !!currentWorkspace?.id,
  })

  const { data: allDevices } = useQuery({
    queryKey: ['devices', currentWorkspace?.id],
    queryFn: () => fetchApi<Page<Device>>('/api/devices?limit=500'),
    enabled: !!currentWorkspace?.id,
  })

  const connectedDevicesQuery = useQuery({
    queryKey: ['channel-devices', detailChannel?.id],
    queryFn: () => fetchApi<Device[]>(`/api/channels/${detailChannel!.id}/devices`),
    enabled: !!detailChannel?.id,
  })

  const create = useMutation({
    mutationFn: (payload: any) => fetchApi<Channel>('/api/channels', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: wsKey })
      setCreateOpen(false)
      setForm({ name: '', metadata: '{\n  "protocol": "mqtt"\n}', status: 'enabled' })
    },
    onError: (e: any) => alert(e.message),
  })

  const deleteChan = useMutation({
    mutationFn: (id: string) => fetchApi(`/api/channels/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: wsKey }),
    onError: (e: any) => alert(e.message),
  })

  const connectDevice = useMutation({
    mutationFn: (devId: string) =>
      fetchApi(`/api/devices/${devId}/channels/${detailChannel!.id}`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['channel-devices', detailChannel?.id] })
      setConnectOpen(false)
      setSelectedDevId('')
    },
    onError: (e: any) => alert(e.message),
  })

  const disconnectDevice = useMutation({
    mutationFn: (devId: string) =>
      fetchApi(`/api/devices/${devId}/channels/${detailChannel!.id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['channel-devices', detailChannel?.id] }),
    onError: (e: any) => alert(e.message),
  })

  const channels = data?.items ?? []
  const filtered = channels.filter(
    (c) =>
      !search ||
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.id.toLowerCase().includes(search.toLowerCase()),
  )

  const boundDevices = connectedDevicesQuery.data ?? []
  const unboundDevices = (allDevices?.items ?? []).filter((d) => !boundDevices.some((b) => b.id === d.id))

  const tabItems = [
    { id: 'general', label: '通道信息', icon: Settings },
    { id: 'devices', label: '已接入设备', icon: Cpu, badge: boundDevices.length },
    { id: 'simulator', label: '消息测试台 (Simulator)', icon: Activity },
  ]

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-800">{t.channels}</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            通道是发布/订阅逻辑管道，MQTT 主题格式为: <code className="text-blue-600 font-mono">channels/&lt;channel_id&gt;/messages</code>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
            <Input
              placeholder="搜索通道名称或 ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 w-56"
            />
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4" />
            <span>新建通道</span>
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
                <th className="py-3 px-4">通道名称</th>
                <th className="py-3 px-4">通道 ID</th>
                <th className="py-3 px-4">MQTT 消息主题</th>
                <th className="py-3 px-4">{t.status}</th>
                <th className="py-3 px-4">创建时间</th>
                <th className="py-3 px-4 text-right">{t.actions}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50/60 transition">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <Radio className="w-4 h-4 text-blue-500" />
                      <button
                        onClick={() => {
                          setDetailChannel(c)
                          setActiveTab('general')
                        }}
                        className="font-medium text-slate-800 hover:text-blue-600 text-left"
                      >
                        {c.name}
                      </button>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-[11px] text-slate-500">{c.id}</span>
                      <CopyButton text={c.id} label="" />
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-1.5 font-mono text-[11px] text-slate-600">
                      <span>channels/{c.id}/messages</span>
                      <CopyButton text={`channels/${c.id}/messages`} label="" />
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <StatusBadge status={c.status} />
                  </td>
                  <td className="py-3 px-4 text-xs text-slate-500">
                    {new Date(c.created_at).toLocaleString()}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setDetailChannel(c)
                          setActiveTab('simulator')
                        }}
                        title="打开消息测试台"
                      >
                        <Activity className="w-3.5 h-3.5 text-blue-600" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setDetailChannel(c)
                          setActiveTab('devices')
                        }}
                        title="查看接入设备"
                      >
                        <Cpu className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          if (confirm(t.confirmDelete)) deleteChan.mutate(c.id)
                        }}
                        title={t.delete}
                      >
                        <Trash2 className="w-3.5 h-3.5 text-red-500" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Create Dialog */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} title="新建通信通道">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            let metadata = {}
            try {
              metadata = form.metadata ? JSON.parse(form.metadata) : {}
            } catch {
              alert('Metadata 必须是合法的 JSON 格式')
              return
            }
            create.mutate({ name: form.name, status: form.status, metadata })
          }}
          className="space-y-4"
        >
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">通道名称 *</label>
            <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="例如：车间环境监控数据通道" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">{t.status}</label>
            <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option value="enabled">启用</option>
              <option value="disabled">停用</option>
            </Select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Metadata (JSON)</label>
            <Textarea rows={4} value={form.metadata} onChange={(e) => setForm({ ...form, metadata: e.target.value })} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>{t.cancel}</Button>
            <Button type="submit" loading={create.isPending}>{t.save}</Button>
          </div>
        </form>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog
        open={!!detailChannel}
        onClose={() => setDetailChannel(null)}
        title={detailChannel ? `通道详情 · ${detailChannel.name}` : ''}
        description={detailChannel ? `ID: ${detailChannel.id}` : ''}
        width="max-w-3xl"
      >
        {detailChannel && (
          <div className="space-y-4">
            <Tabs items={tabItems} value={activeTab} onChange={(id) => setActiveTab(id as TabId)} />

            {activeTab === 'general' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
                  <Field label="通道 ID" value={detailChannel.id} mono />
                  <Field label="状态" value={detailChannel.status} />
                  <Field label="MQTT 默认主题" value={`channels/${detailChannel.id}/messages`} mono />
                  <Field label="创建时间" value={new Date(detailChannel.created_at).toLocaleString()} />
                </div>
                <Field label="Metadata">
                  <pre className="p-3 bg-slate-900 text-slate-200 font-mono text-xs rounded-lg overflow-x-auto">
                    {JSON.stringify(detailChannel.metadata ?? {}, null, 2)}
                  </pre>
                </Field>
              </div>
            )}

            {activeTab === 'devices' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs text-slate-500">已连接 {boundDevices.length} 台设备</div>
                  <Button size="sm" onClick={() => setConnectOpen(true)} disabled={unboundDevices.length === 0}>
                    <Link2 className="w-3.5 h-3.5" />
                    <span>添加设备连接</span>
                  </Button>
                </div>

                <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 overflow-hidden">
                  {connectedDevicesQuery.isLoading && <div className="p-6 text-center text-xs text-slate-400">加载中...</div>}
                  {!connectedDevicesQuery.isLoading && boundDevices.length === 0 && (
                    <div className="p-6 text-center text-xs text-slate-400">暂无接入设备</div>
                  )}
                  {boundDevices.map((d) => (
                    <div key={d.id} className="flex items-center justify-between p-3 hover:bg-slate-50">
                      <div className="flex items-center gap-2.5">
                        <Cpu className="w-4 h-4 text-slate-400" />
                        <div>
                          <div className="text-sm font-medium text-slate-800">{d.name}</div>
                          <div className="text-[11px] font-mono text-slate-400">{d.id}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={d.status} />
                        <Button variant="outline" size="sm" onClick={() => disconnectDevice.mutate(d.id)}>
                          <Unlink className="w-3.5 h-3.5" />
                          <span>解绑</span>
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'simulator' && (
              <ChannelSimulatorTab channel={detailChannel} boundDevices={boundDevices} />
            )}
          </div>
        )}
      </Dialog>

      {/* Connect Device Dialog */}
      <Dialog
        open={connectOpen}
        onClose={() => setConnectOpen(false)}
        title={`向通道添加设备 · ${detailChannel?.name ?? ''}`}
        footer={
          <>
            <Button variant="outline" onClick={() => setConnectOpen(false)}>{t.cancel}</Button>
            <Button disabled={!selectedDevId} onClick={() => selectedDevId && connectDevice.mutate(selectedDevId)}>确认添加</Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="text-xs text-slate-500">选择要连接到该通道的设备：</div>
          <div className="max-h-64 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
            {unboundDevices.length === 0 && <div className="p-6 text-center text-xs text-slate-400">所有设备均已连接</div>}
            {unboundDevices.map((d) => (
              <label key={d.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 cursor-pointer">
                <input
                  type="radio"
                  name="dev"
                  checked={selectedDevId === d.id}
                  onChange={() => setSelectedDevId(d.id)}
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

const ChannelSimulatorTab: React.FC<{ channel: Channel; boundDevices: Device[] }> = ({ channel, boundDevices }) => {
  const [publisher, setPublisher] = useState(boundDevices[0]?.id || 'simulator')
  const [subtopic, setSubtopic] = useState('telemetry')
  const [protocol, setProtocol] = useState('mqtt')
  const [payload, setPayload] = useState('{\n  "voltage": 220.4,\n  "current": 4.8,\n  "power": 1057.92\n}')
  const [refreshTrigger, setRefreshTrigger] = useState(0)

  const messagesQuery = useQuery({
    queryKey: ['channel-messages', channel.id, refreshTrigger],
    queryFn: () => fetchApi<MessageRecord[]>(`/api/channels/${channel.id}/messages?limit=50`),
    refetchInterval: 5000,
  })

  const send = useMutation({
    mutationFn: () =>
      fetchApi<MessageRecord>(`/api/channels/${channel.id}/messages`, {
        method: 'POST',
        body: JSON.stringify({
          publisher,
          subtopic,
          protocol,
          payload,
          name: subtopic,
        }),
      }),
    onSuccess: () => setRefreshTrigger((x) => x + 1),
    onError: (e: any) => alert(e.message),
  })

  return (
    <div className="space-y-4">
      <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
        <div className="text-xs font-bold text-slate-700">消息发布器 (Publisher)</div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">发送者 (Publisher)</label>
            <Input value={publisher} onChange={(e) => setPublisher(e.target.value)} placeholder="dev-xxx" />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">子主题 (Subtopic)</label>
            <Input value={subtopic} onChange={(e) => setSubtopic(e.target.value)} placeholder="telemetry" />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">传输协议</label>
            <Select value={protocol} onChange={(e) => setProtocol(e.target.value)}>
              <option value="mqtt">MQTT</option>
              <option value="http">HTTP</option>
              <option value="coap">CoAP</option>
              <option value="ws">WebSocket</option>
            </Select>
          </div>
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-slate-600 mb-1">消息 Payload (JSON / SenML)</label>
          <Textarea rows={4} value={payload} onChange={(e) => setPayload(e.target.value)} />
        </div>
        <div className="flex items-center justify-between">
          <code className="text-[11px] font-mono text-slate-500">
            POST /api/channels/{channel.id}/messages
          </code>
          <Button loading={send.isPending} onClick={() => send.mutate()}>
            <Send className="w-4 h-4" />
            <span>立即发送消息</span>
          </Button>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs font-bold text-slate-700">实时消息流 (每 5 秒自动轮询)</div>
          <Button variant="ghost" size="sm" onClick={() => setRefreshTrigger((x) => x + 1)}>
            <RefreshCw className="w-3.5 h-3.5" />
            <span>刷新</span>
          </Button>
        </div>
        <div className="border border-slate-200 rounded-lg max-h-56 overflow-y-auto divide-y divide-slate-100 font-mono text-[11px] bg-slate-950 text-slate-200 p-2">
          {(messagesQuery.data ?? []).map((m) => (
            <div key={m.id} className="py-1.5 px-2 hover:bg-slate-900 flex items-start gap-2">
              <span className="text-slate-500 shrink-0">{new Date(m.created_at).toLocaleTimeString()}</span>
              <span className="text-emerald-400 shrink-0">[{m.protocol.toUpperCase()}]</span>
              <span className="text-blue-400 shrink-0">/{m.subtopic || ''}</span>
              <span className="text-slate-400 shrink-0">&lt;{m.publisher}&gt;:</span>
              <span className="text-slate-100 break-all">{m.payload}</span>
            </div>
          ))}
          {(messagesQuery.data ?? []).length === 0 && (
            <div className="p-8 text-center text-slate-500">该通道暂无历史消息，使用上方表单即可模拟发布</div>
          )}
        </div>
      </div>
    </div>
  )
}
