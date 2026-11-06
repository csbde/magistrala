import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchApi } from '../lib/api'
import { useAuthStore } from '../store/authStore'
import { dict } from '../lib/i18n'
import type { Channel, ChannelMember, ChannelRole, Device, Journal, MessageRecord, Page, User } from '../types'
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
  FileSpreadsheet,
  Braces,
  ScrollText,
  ShieldCheck,
  Users,
  Download,
  Terminal,
  Save,
  Pencil,
} from 'lucide-react'
import { useToast } from '../components/ui/Toast'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'

type TabId = 'general' | 'metadata' | 'devices' | 'roles' | 'members' | 'messages' | 'journals'

export const ChannelsModule: React.FC = () => {
  const { currentWorkspace, language } = useAuthStore()
  const t = dict[language]
  const qc = useQueryClient()
  const { success, error: toastError } = useToast()

  const [search, setSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [csvContent, setCsvContent] = useState('')
  const [detailChannel, setDetailChannel] = useState<Channel | null>(null)
  const [activeTab, setActiveTab] = useState<TabId>('general')
  const [connectOpen, setConnectOpen] = useState(false)
  const [selectedDevId, setSelectedDevId] = useState('')
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)

  const [form, setForm] = useState({
    name: '',
    metadata: '{\n  "protocol": "mqtt"\n}',
    status: 'enabled',
    tags: '',
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

  const bulkCreate = useMutation({
    mutationFn: (channels: any[]) =>
      fetchApi('/api/channels/bulk', {
        method: 'POST',
        body: JSON.stringify({ channels }),
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: wsKey })
      setBulkOpen(false)
      setCsvContent('')
      success(`成功批量创建 ${res.created_count || 0} 个通信通道`)
    },
    onError: (e: any) => toastError(e.message || '批量创建失败'),
  })

    const create = useMutation({
    mutationFn: (payload: any) => fetchApi<Channel>('/api/channels', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: wsKey })
      setCreateOpen(false)
      setForm({ name: '', metadata: '{\n  "protocol": "mqtt"\n}', status: 'enabled', tags: '' })
      success('通信通道创建成功')
    },
    onError: (e: any) => toastError(e.message || '创建通道失败'),
  })

  const deleteChan = useMutation({
    mutationFn: (id: string) => fetchApi(`/api/channels/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: wsKey })
      setDeleteTargetId(null)
      if (detailChannel?.id === deleteTargetId) {
        setDetailChannel(null)
      }
      success('通道已删除')
    },
    onError: (e: any) => toastError(e.message || '删除通道失败'),
  })

  const connectDevice = useMutation({
    mutationFn: (devId: string) =>
      fetchApi(`/api/devices/${devId}/channels/${detailChannel!.id}`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['channel-devices', detailChannel?.id] })
      setConnectOpen(false)
      setSelectedDevId('')
      success('设备已成功接入通道')
    },
    onError: (e: any) => toastError(e.message || '设备接入失败'),
  })

  const disconnectDevice = useMutation({
    mutationFn: (devId: string) =>
      fetchApi(`/api/devices/${devId}/channels/${detailChannel!.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['channel-devices', detailChannel?.id] })
      success('已解除设备与通道的连接')
    },
    onError: (e: any) => toastError(e.message || '解除连接失败'),
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
    { id: 'general', label: '基本设置', icon: Settings },
    { id: 'metadata', label: '元数据', icon: Braces },
    { id: 'devices', label: '连接设备', icon: Cpu, badge: boundDevices.length },
    { id: 'roles', label: '角色权限', icon: ShieldCheck },
    { id: 'members', label: '通道成员', icon: Users },
    { id: 'messages', label: '消息', icon: Activity },
    { id: 'journals', label: '审计日志', icon: ScrollText },
  ]

  const handleImportChannelsCSV = () => {
    if (!csvContent.trim()) {
      toastError('请输入或粘贴 CSV 内容')
      return
    }
    const rows = parseCSV(csvContent)
    if (rows.length < 2) {
      toastError('CSV 数据至少需要包含标题行与 1 行通道数据')
      return
    }
    const headers = rows[0].map((h) => String(h).trim().toLowerCase())
    const nameIdx = headers.indexOf('name')
    if (nameIdx === -1) {
      toastError('CSV 必须包含 Name 列作为通道名称')
      return
    }
    const metaIdx = headers.indexOf('metadata')
    const tagIdx = headers.indexOf('tags')

    const toCreate: any[] = []
    for (let i = 1; i < rows.length; i++) {
      const cols = rows[i]
      const name = String(cols[nameIdx] ?? '').trim()
      if (!name) continue

      let metadata: any = {}
      const metaRaw = metaIdx !== -1 ? String(cols[metaIdx] ?? '').trim() : ''
      if (metaRaw) {
        try {
          metadata = JSON.parse(metaRaw)
        } catch {
          // 忽略非法 JSON，保持为空对象
        }
      }

      const tagsRaw = tagIdx !== -1 ? String(cols[tagIdx] ?? '').trim() : ''
      let tags: string[] = []
      if (tagsRaw.startsWith('[')) {
        try {
          tags = JSON.parse(tagsRaw)
        } catch {
          tags = []
        }
      } else if (tagsRaw) {
        tags = tagsRaw.split(/[;|,\s]+/).map((t) => t.trim()).filter(Boolean)
      }

      toCreate.push({ name, metadata, tags })
    }
    if (toCreate.length === 0) {
      toastError('未能解析到有效的通道数据行')
      return
    }
    bulkCreate.mutate(toCreate)
  }

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
          <Button variant="outline" size="sm" onClick={() => setBulkOpen(true)} className="flex items-center gap-1.5 text-xs text-slate-700 bg-white">
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <span>批量导入通道</span>
          </Button>
          <Button onClick={() => setCreateOpen(true)} className="flex items-center gap-1.5">
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
                <th className="py-3 px-4">MQTT 默认订阅主题</th>
                <th className="py-3 px-4">标签</th>
                <th className="py-3 px-4">创建时间</th>
                <th className="py-3 px-4">{t.status}</th>
                <th className="py-3 px-4 text-right">{t.actions}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50/60 transition">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <Radio className="w-4 h-4 text-indigo-500" />
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
                  <td className="py-3 px-4 font-mono text-xs text-blue-600">
                    <div className="flex items-center gap-1.5">
                      <span>channels/{c.id}/messages</span>
                      <CopyButton text={`channels/${c.id}/messages`} label="" />
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex flex-wrap gap-1 max-w-40">
                      {(c.tags || []).slice(0, 3).map((tg) => (
                        <span key={tg} className="text-[10px] px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200">
                          {tg}
                        </span>
                      ))}
                      {(c.tags || []).length === 0 && <span className="text-[11px] text-slate-300">-</span>}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-xs text-slate-400">
                    {new Date(c.created_at).toLocaleString()}
                  </td>
                  <td className="py-3 px-4">
                    <StatusBadge status={c.status} />
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setDetailChannel(c)
                          setActiveTab('general')
                        }}
                        title="查看通道详情"
                      >
                        <Settings className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setDetailChannel(c)
                          setActiveTab('messages')
                        }}
                        title="消息测试台"
                      >
                        <Activity className="w-3.5 h-3.5 text-blue-600" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeleteTargetId(c.id)}
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

      {/* Create Modal */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} title="新建通信通道 (Channel)">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            let metadata: Record<string, any> = {}
            try {
              metadata = form.metadata ? JSON.parse(form.metadata) : {}
            } catch {
              toastError('Metadata 必须是合法的 JSON 格式')
              return
            }
            create.mutate({
              name: form.name,
              status: form.status,
              metadata,
              tags: form.tags.split(',').map((tg) => tg.trim()).filter(Boolean),
            })
          }}
          className="space-y-4"
        >
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">通道名称 *</label>
            <Input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="例如：厂区环境监测数据流通道"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">状态</label>
            <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option value="enabled">启用 (Enabled)</option>
              <option value="disabled">停用 (Disabled)</option>
            </Select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">标签 (Tags，逗号分隔)</label>
            <Input
              value={form.tags}
              onChange={(e) => setForm({ ...form, tags: e.target.value })}
              placeholder="例如：production, workshop-a"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Metadata (JSON)</label>
            <Textarea rows={4} value={form.metadata} onChange={(e) => setForm({ ...form, metadata: e.target.value })} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
              {t.cancel}
            </Button>
            <Button type="submit" loading={create.isPending}>
              {t.save}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog
        open={!!detailChannel}
        onClose={() => setDetailChannel(null)}
        title={detailChannel ? `通道 · ${detailChannel.name}` : ''}
        description={detailChannel ? `ID: ${detailChannel.id}` : ''}
        width="max-w-3xl"
      >
        {detailChannel && (
          <div className="space-y-4">
            <Tabs items={tabItems} value={activeTab} onChange={(id) => setActiveTab(id as TabId)} />

            {activeTab === 'general' && (
              <ChannelSettingsTab channel={detailChannel} onUpdated={(c) => setDetailChannel(c)} />
            )}

            {activeTab === 'metadata' && (
              <ChannelMetadataTab channel={detailChannel} onUpdated={(c) => setDetailChannel(c)} />
            )}

            {activeTab === 'devices' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="text-xs text-slate-500">
                    当前通道已绑定 {boundDevices.length} 台设备，设备仅能向已连接的通道发布/订阅消息
                  </div>
                  <Button size="sm" onClick={() => setConnectOpen(true)} disabled={unboundDevices.length === 0} className="flex items-center gap-1.5">
                    <Link2 className="w-4 h-4" />
                    <span>连接设备</span>
                  </Button>
                </div>

                {connectedDevicesQuery.isLoading ? (
                  <EmptyState text="" loading />
                ) : boundDevices.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-400 bg-slate-50 rounded-lg border border-dashed border-slate-200">
                    暂无设备连接至该通道，点击上方「连接设备」挂接
                  </div>
                ) : (
                  <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 overflow-hidden">
                    {boundDevices.map((d) => (
                      <div key={d.id} className="flex items-center justify-between p-3 hover:bg-slate-50 transition">
                        <div className="flex items-center gap-2.5">
                          {d.is_gateway ? <Cpu className="w-4 h-4 text-indigo-500" /> : <Radio className="w-4 h-4 text-slate-400" />}
                          <div>
                            <div className="text-sm font-medium text-slate-800">{d.name}</div>
                            <div className="text-[11px] font-mono text-slate-400">{d.id}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <StatusBadge status={d.status} />
                          <Button variant="outline" size="sm" onClick={() => disconnectDevice.mutate(d.id)}>
                            <Unlink className="w-3.5 h-3.5" />
                            <span>断开连接</span>
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'roles' && <ChannelRolesTab channel={detailChannel} />}

            {activeTab === 'members' && <ChannelMembersTab channel={detailChannel} />}

            {activeTab === 'messages' && (
              <ChannelMessagesTab channel={detailChannel} boundDevices={boundDevices} />
            )}

            {activeTab === 'journals' && <ChannelJournalsTab channel={detailChannel} />}
          </div>
        )}
      </Dialog>

      {/* Connect Device Dialog */}
      <Dialog
        open={connectOpen}
        onClose={() => setConnectOpen(false)}
        title="关联设备至通道"
        footer={
          <>
            <Button variant="outline" onClick={() => setConnectOpen(false)}>
              {t.cancel}
            </Button>
            <Button
              disabled={!selectedDevId}
              loading={connectDevice.isPending}
              onClick={() => selectedDevId && connectDevice.mutate(selectedDevId)}
            >
              确认接入
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="text-xs text-slate-500">选择要绑定至该通道的设备：</div>
          <div className="max-h-64 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
            {unboundDevices.length === 0 && <div className="p-6 text-center text-xs text-slate-400">暂无待绑定的设备</div>}
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

      {/* Bulk Channels Modal */}
      <Dialog
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        title="批量导入通信通道"
        description="支持 CSV 格式批量创建消息通道，快速完成通道集群拓扑初始化"
      >
        <div className="space-y-3">
          <div className="text-xs text-slate-500">
            第一行为表头，官方字段顺序：<code>Name,Metadata,Tags</code>（Metadata 为 JSON，Tags 可为 JSON 数组或分号分隔）
          </div>
          <Textarea
            rows={7}
            placeholder={'Name,Metadata,Tags\ntelemetry_sensors,"{"topic":"sensor/data"}",production;lora\ncommand_control,"{"topic":"cmd/downlink"}",control'}
            value={csvContent}
            onChange={(e) => setCsvContent(e.target.value)}
            className="font-mono text-xs"
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setBulkOpen(false)}>
              取消
            </Button>
            <Button onClick={handleImportChannelsCSV} loading={bulkCreate.isPending}>
              确认导入
            </Button>
          </div>
        </div>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTargetId}
        title="确认删除通信通道"
        message="删除通道将断开所有绑定设备的通讯路由，确定要删除吗？"
        loading={deleteChan.isPending}
        onConfirm={() => {
          if (deleteTargetId) deleteChan.mutate(deleteTargetId)
        }}
        onClose={() => setDeleteTargetId(null)}
      />
    </div>
  )
}

/** 支持带引号字段（字段内可含逗号与换行）的简易 CSV 解析器 */
const parseCSV = (text: string): string[][] => {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += ch
      }
      continue
    }
    if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      row.push(field)
      field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      field = ''
      if (row.some((c) => c.trim() !== '')) rows.push(row)
      row = []
    } else {
      field += ch
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    if (row.some((c) => c.trim() !== '')) rows.push(row)
  }
  return rows.map((r) => r.map((c) => c.trim()))
}

/* ----------------------------- 基本设置标签页 ----------------------------- */

const ChannelSettingsTab: React.FC<{ channel: Channel; onUpdated: (c: Channel) => void }> = ({ channel, onUpdated }) => {
  const qc = useQueryClient()
  const { success, error: toastError } = useToast()
  const [name, setName] = useState(channel.name)
  const [status, setStatus] = useState(channel.status)
  const [tags, setTags] = useState((channel.tags || []).join(', '))

  const save = useMutation({
    mutationFn: () =>
      fetchApi<Channel>(`/api/channels/${channel.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name,
          status,
          tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
        }),
      }),
    onSuccess: (saved) => {
      qc.invalidateQueries({ queryKey: ['channels'] })
      onUpdated(saved)
      success('通道基本设置已保存')
    },
    onError: (e: any) => toastError(e.message || '保存失败'),
  })

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
        <Field label="通道 ID" value={channel.id} mono />
        <Field label="所属工作空间" value={channel.workspace_id} mono />
        <Field label="创建时间" value={new Date(channel.created_at).toLocaleString()} />
        <Field label="最后更新" value={channel.updated_at ? new Date(channel.updated_at).toLocaleString() : '-'} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">通道名称</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">状态</label>
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="enabled">enabled（启用）</option>
            <option value="disabled">disabled（停用）</option>
          </Select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">标签 (逗号分隔)</label>
          <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="production, workshop-a" />
        </div>
      </div>

      <div className="p-4 bg-slate-900 text-slate-200 rounded-lg space-y-2">
        <div className="text-xs font-semibold text-slate-400">FluxMQ MQTT 订阅主题</div>
        <div className="flex items-center justify-between gap-2 bg-slate-950 p-2.5 rounded font-mono text-xs">
          <span className="text-emerald-400 select-all">channels/{channel.id}/messages</span>
          <CopyButton text={`channels/${channel.id}/messages`} />
        </div>
        <div className="text-[11px] text-slate-500">
          带子主题格式: <code className="text-slate-400">channels/{channel.id}/messages/&lt;subtopic&gt;</code>
        </div>
      </div>

      <div className="flex justify-end">
        <Button loading={save.isPending} onClick={() => save.mutate()}>
          <Save className="w-4 h-4" />
          <span>保存设置</span>
        </Button>
      </div>
    </div>
  )
}

/* ----------------------------- 元数据标签页 ------------------------------ */

const ChannelMetadataTab: React.FC<{ channel: Channel; onUpdated: (c: Channel) => void }> = ({ channel, onUpdated }) => {
  const qc = useQueryClient()
  const { success, error: toastError } = useToast()
  const [text, setText] = useState(JSON.stringify(channel.metadata ?? {}, null, 2))

  const save = useMutation({
    mutationFn: (metadata: Record<string, any>) =>
      fetchApi<Channel>(`/api/channels/${channel.id}`, {
        method: 'PUT',
        body: JSON.stringify({ metadata }),
      }),
    onSuccess: (saved) => {
      qc.invalidateQueries({ queryKey: ['channels'] })
      onUpdated(saved)
      success('通道元数据已更新')
    },
    onError: (e: any) => toastError(e.message || '更新失败'),
  })

  return (
    <div className="space-y-3">
      <div className="text-xs text-slate-500">
        元数据用于描述通道的自定义属性（如保留策略、消息格式、地区等），以 JSON 结构存储。
      </div>
      <Textarea rows={12} value={text} onChange={(e) => setText(e.target.value)} />
      <div className="flex justify-end">
        <Button
          loading={save.isPending}
          onClick={() => {
            try {
              const parsed = JSON.parse(text || '{}')
              if (typeof parsed !== 'object' || Array.isArray(parsed)) {
                toastError('元数据必须是 JSON 对象')
                return
              }
              save.mutate(parsed)
            } catch {
              toastError('JSON 格式不合法，请检查后重试')
            }
          }}
        >
          <Save className="w-4 h-4" />
          <span>保存元数据</span>
        </Button>
      </div>
    </div>
  )
}

/* ----------------------------- 角色权限标签页 ---------------------------- */

const CHANNEL_ACTIONS = ['read', 'publish', 'subscribe', 'notify', 'delete']

const ChannelRolesTab: React.FC<{ channel: Channel }> = ({ channel }) => {
  const qc = useQueryClient()
  const { success, error: toastError } = useToast()
  const [createOpen, setCreateOpen] = useState(false)
  const [roleName, setRoleName] = useState('')
  const [roleActions, setRoleActions] = useState<string[]>(['read'])
  const [editing, setEditing] = useState<ChannelRole | null>(null)

  const rolesQuery = useQuery({
    queryKey: ['channel-roles', channel.id],
    queryFn: () => fetchApi<ChannelRole[]>(`/api/channels/${channel.id}/roles`),
  })

  const createRole = useMutation({
    mutationFn: () =>
      fetchApi<ChannelRole>(`/api/channels/${channel.id}/roles`, {
        method: 'POST',
        body: JSON.stringify({ name: roleName, actions: roleActions }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['channel-roles', channel.id] })
      setCreateOpen(false)
      setRoleName('')
      setRoleActions(['read'])
      success('通道角色创建成功')
    },
    onError: (e: any) => toastError(e.message || '创建角色失败'),
  })

  const updateRole = useMutation({
    mutationFn: (body: { id: string; name?: string; actions?: string[] }) =>
      fetchApi<ChannelRole>(`/api/roles/${body.id}`, { method: 'PUT', body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['channel-roles', channel.id] })
      setEditing(null)
      success('角色权限已更新')
    },
    onError: (e: any) => toastError(e.message || '更新角色失败'),
  })

  const deleteRole = useMutation({
    mutationFn: (id: string) => fetchApi(`/api/roles/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['channel-roles', channel.id] })
      success('角色已删除')
    },
    onError: (e: any) => toastError(e.message || '删除角色失败'),
  })

  const roles = rolesQuery.data ?? []

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs text-slate-500">
          角色定义一组可执行动作（publish / subscribe / read / notify / delete），并可分配给工作空间成员。
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)} className="flex items-center gap-1.5">
          <Plus className="w-4 h-4" />
          <span>创建角色</span>
        </Button>
      </div>

      {rolesQuery.isLoading ? (
        <EmptyState text="" loading />
      ) : roles.length === 0 ? (
        <div className="p-8 text-center text-xs text-slate-400 bg-slate-50 rounded-lg border border-dashed border-slate-200">
          该通道尚未定义角色，点击「创建角色」新增
        </div>
      ) : (
        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="py-2 px-3 font-semibold">角色名称</th>
                <th className="py-2 px-3 font-semibold">可执行动作</th>
                <th className="py-2 px-3 font-semibold">成员数</th>
                <th className="py-2 px-3 font-semibold">创建时间</th>
                <th className="py-2 px-3 text-right font-semibold">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {roles.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50/60">
                  <td className="py-2 px-3 font-medium text-slate-800">{r.name}</td>
                  <td className="py-2 px-3">
                    <div className="flex flex-wrap gap-1">
                      {(r.actions || []).map((a) => (
                        <span key={a} className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 font-mono">
                          {a}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="py-2 px-3 font-mono">{(r.members || []).length}</td>
                  <td className="py-2 px-3 text-slate-400">{new Date(r.created_at).toLocaleString()}</td>
                  <td className="py-2 px-3 text-right">
                    <div className="inline-flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => setEditing(r)} title="编辑动作">
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => deleteRole.mutate(r.id)} title="删除角色">
                        <Trash2 className="w-3.5 h-3.5 text-red-500" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} title="创建通道角色">
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">角色名称 *</label>
            <Input value={roleName} onChange={(e) => setRoleName(e.target.value)} placeholder="例如：数据订阅者 / 设备运维员" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">可执行动作</label>
            <div className="flex flex-wrap gap-2">
              {CHANNEL_ACTIONS.map((a) => {
                const on = roleActions.includes(a)
                return (
                  <button
                    key={a}
                    type="button"
                    onClick={() => setRoleActions(on ? roleActions.filter((x) => x !== a) : [...roleActions, a])}
                    className={`text-xs px-2.5 py-1 rounded-lg border transition ${
                      on ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:border-blue-400'
                    }`}
                  >
                    {a}
                  </button>
                )
              })}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setCreateOpen(false)}>取消</Button>
            <Button onClick={() => createRole.mutate()} loading={createRole.isPending} disabled={!roleName.trim()}>
              创建
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog open={!!editing} onClose={() => setEditing(null)} title={editing ? `编辑角色 · ${editing.name}` : ''}>
        {editing && (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">角色名称</label>
              <Input defaultValue={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">可执行动作</label>
              <div className="flex flex-wrap gap-2">
                {CHANNEL_ACTIONS.map((a) => {
                  const on = (editing.actions || []).includes(a)
                  return (
                    <button
                      key={a}
                      type="button"
                      onClick={() =>
                        setEditing({ ...editing, actions: on ? editing.actions.filter((x) => x !== a) : [...(editing.actions || []), a] })
                      }
                      className={`text-xs px-2.5 py-1 rounded-lg border transition ${
                        on ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:border-blue-400'
                      }`}
                    >
                      {a}
                    </button>
                  )
                })}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setEditing(null)}>取消</Button>
              <Button loading={updateRole.isPending} onClick={() => updateRole.mutate({ id: editing.id, name: editing.name, actions: editing.actions })}>
                保存修改
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  )
}

/* ----------------------------- 通道成员标签页 ---------------------------- */

const ChannelMembersTab: React.FC<{ channel: Channel }> = ({ channel }) => {
  const qc = useQueryClient()
  const { success, error: toastError } = useToast()
  const [assignOpen, setAssignOpen] = useState(false)
  const [pickUser, setPickUser] = useState('')
  const [pickRole, setPickRole] = useState('')

  const membersQuery = useQuery({
    queryKey: ['channel-members', channel.id],
    queryFn: () => fetchApi<ChannelMember[]>(`/api/channels/${channel.id}/members`),
  })

  const rolesQuery = useQuery({
    queryKey: ['channel-roles', channel.id],
    queryFn: () => fetchApi<ChannelRole[]>(`/api/channels/${channel.id}/roles`),
  })

  const usersQuery = useQuery({
    queryKey: ['users', channel.workspace_id],
    queryFn: () => fetchApi<Page<User>>('/api/users?limit=200'),
  })

  const assign = useMutation({
    mutationFn: () =>
      fetchApi(`/api/roles/${pickRole}/members`, {
        method: 'POST',
        body: JSON.stringify({ member_ids: [pickUser] }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['channel-members', channel.id] })
      qc.invalidateQueries({ queryKey: ['channel-roles', channel.id] })
      setAssignOpen(false)
      setPickUser('')
      setPickRole('')
      success('成员已分配到角色')
    },
    onError: (e: any) => toastError(e.message || '分配失败'),
  })

  const unassign = useMutation({
    mutationFn: (userID: string) => fetchApi(`/api/channels/${channel.id}/members/${userID}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['channel-members', channel.id] })
      qc.invalidateQueries({ queryKey: ['channel-roles', channel.id] })
      success('已解除该成员在本通道的全部角色')
    },
    onError: (e: any) => toastError(e.message || '解除分配失败'),
  })

  const members = membersQuery.data ?? []
  const roles = rolesQuery.data ?? []
  const users = usersQuery.data?.items ?? []

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs text-slate-500">通道成员来自工作空间成员，分配后即拥有对应角色的动作权限。</div>
        <Button size="sm" onClick={() => setAssignOpen(true)} disabled={roles.length === 0} className="flex items-center gap-1.5">
          <Users className="w-4 h-4" />
          <span>分配成员</span>
        </Button>
      </div>

      {roles.length === 0 && (
        <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
          请先在「角色权限」标签中创建至少一个角色，再分配成员。
        </div>
      )}

      {membersQuery.isLoading ? (
        <EmptyState text="" loading />
      ) : members.length === 0 ? (
        <div className="p-8 text-center text-xs text-slate-400 bg-slate-50 rounded-lg border border-dashed border-slate-200">
          该通道还没有分配成员
        </div>
      ) : (
        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="py-2 px-3 font-semibold">成员</th>
                <th className="py-2 px-3 font-semibold">角色</th>
                <th className="py-2 px-3 font-semibold">权限动作</th>
                <th className="py-2 px-3 text-right font-semibold">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {members.map((m) => (
                <tr key={`${m.user_id}-${m.role_id}`} className="hover:bg-slate-50/60">
                  <td className="py-2 px-3">
                    <div className="font-medium text-slate-800">{m.name || m.email || m.user_id}</div>
                    <div className="text-[11px] font-mono text-slate-400">{m.user_id}</div>
                  </td>
                  <td className="py-2 px-3">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200">
                      {m.role_name}
                    </span>
                  </td>
                  <td className="py-2 px-3 font-mono text-[11px] text-slate-500">{(m.actions || []).join(' / ')}</td>
                  <td className="py-2 px-3 text-right">
                    <Button variant="ghost" size="sm" onClick={() => unassign.mutate(m.user_id)} title="解除分配">
                      <Trash2 className="w-3.5 h-3.5 text-red-500" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={assignOpen} onClose={() => setAssignOpen(false)} title="分配通道成员与角色">
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">选择角色 *</label>
            <Select value={pickRole} onChange={(e) => setPickRole(e.target.value)}>
              <option value="">— 请选择角色 —</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}（{(r.actions || []).join('/')}）
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">选择成员 *</label>
            <Select value={pickUser} onChange={(e) => setPickUser(e.target.value)}>
              <option value="">— 请选择工作空间成员 —</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name || u.email}（{u.email}）
                </option>
              ))}
            </Select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setAssignOpen(false)}>取消</Button>
            <Button onClick={() => assign.mutate()} loading={assign.isPending} disabled={!pickUser || !pickRole}>
              确认分配
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}

/* ----------------------------- 审计日志标签页 ---------------------------- */

const ChannelJournalsTab: React.FC<{ channel: Channel }> = ({ channel }) => {
  const [search, setSearch] = useState('')

  const journalsQuery = useQuery({
    queryKey: ['channel-journals', channel.id],
    queryFn: () => fetchApi<Journal[]>(`/api/journals?entity_id=${channel.id}&limit=100`),
  })

  const journals = (journalsQuery.data ?? []).filter(
    (j) => !search || j.operation.toLowerCase().includes(search.toLowerCase()),
  )

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs text-slate-500">追踪通道的创建、更新、停用、设备连接与角色变更等全部事件。</div>
        <div className="relative w-56">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
          <Input placeholder="按操作类型搜索..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 text-xs" />
        </div>
      </div>

      {journalsQuery.isLoading ? (
        <EmptyState text="" loading />
      ) : journals.length === 0 ? (
        <div className="p-8 text-center text-xs text-slate-400 bg-slate-50 rounded-lg border border-dashed border-slate-200">
          暂无该通道的操作日志
        </div>
      ) : (
        <div className="border border-slate-200 rounded-lg overflow-hidden divide-y divide-slate-100 max-h-80 overflow-y-auto">
          {journals.map((j) => (
            <div key={j.id} className="p-3 text-xs hover:bg-slate-50/60">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                  {j.operation}
                </span>
                <span className="text-slate-400">{new Date(j.created_at).toLocaleString()}</span>
              </div>
              {j.attributes && Object.keys(j.attributes).length > 0 && (
                <div className="mt-1.5 text-[11px] font-mono text-slate-500 break-all">
                  {JSON.stringify(j.attributes)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* --------------------------- 消息标签页（含 CLI 生成） -------------------------- */

const ChannelMessagesTab: React.FC<{ channel: Channel; boundDevices: Device[] }> = ({ channel, boundDevices }) => {
  const { success, error: toastError } = useToast()
  const [publisher, setPublisher] = useState(boundDevices[0]?.id || 'simulator')
  const [messageName, setMessageName] = useState('temperature')
  const [subtopic, setSubtopic] = useState('telemetry')
  const [protocol, setProtocol] = useState('mqtt')
  const [payload, setPayload] = useState('{\n  "temperature": 26.8,\n  "humidity": 58.2\n}')
  const [refreshTrigger, setRefreshTrigger] = useState(0)

  // 过滤条件（对应官方文档 Filter Messages）
  const [fName, setFName] = useState('')
  const [fProtocol, setFProtocol] = useState('')
  const [fPublisher, setFPublisher] = useState('')
  const [fValue, setFValue] = useState('')

  const messagesQuery = useQuery({
    queryKey: ['channel-messages', channel.id, refreshTrigger],
    queryFn: () => fetchApi<MessageRecord[]>(`/api/channels/${channel.id}/messages?limit=200`),
    refetchInterval: 5000,
  })

  const send = useMutation({
    mutationFn: () =>
      fetchApi<MessageRecord>(`/api/channels/${channel.id}/messages`, {
        method: 'POST',
        body: JSON.stringify({ publisher, subtopic, protocol, payload, name: messageName }),
      }),
    onSuccess: () => {
      setRefreshTrigger((x) => x + 1)
      success('消息已发布并入库')
    },
    onError: (e: any) => toastError(e.message || '消息发送失败'),
  })

  const all = messagesQuery.data ?? []
  const filtered = all.filter((m) => {
    if (fName && !(m.name || '').toLowerCase().includes(fName.toLowerCase())) return false
    if (fProtocol && (m.protocol || '') !== fProtocol) return false
    if (fPublisher && !(m.publisher || '').toLowerCase().includes(fPublisher.toLowerCase())) return false
    if (fValue && !(m.value || '').includes(fValue)) return false
    return true
  })

  const selectedDevice = boundDevices.find((d) => d.id === publisher)
  const secret = selectedDevice?.credentials?.secret || '<device_secret>'
  const host = window.location.hostname || 'localhost'
  const topic = `channels/${channel.id}/messages${subtopic ? '/' + subtopic : ''}`

  const cliCommands: Record<string, string> = {
    mqtt: `mosquitto_pub -i "${publisher}" -u ${publisher} -P ${secret} -h ${host} -p 1883 -t ${topic} -m '${payload.replace(/'/g, "'\\''")}'`,
    http: `curl -X POST "https://${host}/api/v1/channels/${channel.id}/messages" \\
  -H "Authorization: Bearer ${secret}" \\
  -H "Content-Type: application/json" \\
  -d '${payload.replace(/'/g, "'\\''")}'`,
    coap: `coap-client -m POST "coap://${host}:5683/${topic}" -u "${publisher}:${secret}" -P '${payload.replace(/'/g, "'\\''")}'`,
    ws: `wscat -c "ws://${host}:8083/mqtt" --user ${publisher} --password ${secret} \\
  # 连接后发送: {"cmd":"publish","topic":"${topic}","message":${payload.replace(/\n/g, '')}}`,
  }

  const download = (format: 'json' | 'csv') => {
    if (filtered.length === 0) {
      toastError('当前筛选条件下没有可下载的消息')
      return
    }
    let blob: Blob
    if (format === 'json') {
      blob = new Blob([JSON.stringify(filtered, null, 2)], { type: 'application/json' })
    } else {
      const header = 'id,publisher,subtopic,name,value,unit,protocol,created_at,payload'
      const rows = filtered.map((m) =>
        [
          m.id,
          m.publisher,
          m.subtopic || '',
          m.name || '',
          m.value || '',
          m.unit || '',
          m.protocol,
          m.created_at,
          '"' + (m.payload || '').replace(/"/g, '""').replace(/\n/g, ' ') + '"',
        ].join(','),
      )
      blob = new Blob([header + '\n' + rows.join('\n')], { type: 'text/csv;charset=utf-8' })
    }
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `channel-${channel.id}-messages.${format}`
    a.click()
    URL.revokeObjectURL(url)
    success(`已导出 ${filtered.length} 条消息为 ${format.toUpperCase()}`)
  }

  return (
    <div className="space-y-4">
      <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
        <div className="text-xs font-bold text-slate-700">发送消息 (Send Message)</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">发送者 (Publisher)</label>
            <Select value={publisher} onChange={(e) => setPublisher(e.target.value)}>
              <option value="simulator">simulator（模拟）</option>
              {boundDevices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">消息名称 (Name)</label>
            <Input value={messageName} onChange={(e) => setMessageName(e.target.value)} placeholder="temperature" />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">子主题 (Subtopic)</label>
            <Input value={subtopic} onChange={(e) => setSubtopic(e.target.value)} placeholder="telemetry" />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">协议 (Protocol)</label>
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

        <div className="p-3 bg-slate-950 rounded-lg">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Terminal className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-[11px] font-semibold text-slate-300">CLI 命令（{protocol.toUpperCase()} 自动生成，可直接复制到终端）</span>
          </div>
          <pre className="text-[11px] font-mono text-emerald-300 whitespace-pre-wrap break-all">{cliCommands[protocol]}</pre>
          <div className="flex justify-end mt-1.5">
            <CopyButton text={cliCommands[protocol]} label="复制命令" />
          </div>
        </div>

        <div className="flex items-center justify-between">
          <code className="text-[11px] font-mono text-slate-500">主题: {topic}</code>
          <Button loading={send.isPending} onClick={() => send.mutate()}>
            <Send className="w-4 h-4" />
            <span>立即发送消息</span>
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-bold text-slate-700">消息列表（{filtered.length} / {all.length} 条）</div>
          <div className="flex items-center gap-1.5">
            <Button variant="ghost" size="sm" onClick={() => setRefreshTrigger((x) => x + 1)}>
              <RefreshCw className="w-3.5 h-3.5" />
              <span>刷新</span>
            </Button>
            <Button variant="outline" size="sm" onClick={() => download('json')}>
              <Download className="w-3.5 h-3.5" />
              <span>JSON</span>
            </Button>
            <Button variant="outline" size="sm" onClick={() => download('csv')}>
              <Download className="w-3.5 h-3.5" />
              <span>CSV</span>
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Input placeholder="按名称筛选" value={fName} onChange={(e) => setFName(e.target.value)} className="text-xs" />
          <Input placeholder="按发布者筛选" value={fPublisher} onChange={(e) => setFPublisher(e.target.value)} className="text-xs" />
          <Select value={fProtocol} onChange={(e) => setFProtocol(e.target.value)} className="text-xs">
            <option value="">全部协议</option>
            <option value="mqtt">mqtt</option>
            <option value="http">http</option>
            <option value="coap">coap</option>
            <option value="ws">ws</option>
            <option value="gateway-relay">gateway-relay</option>
          </Select>
          <Input placeholder="按数值筛选" value={fValue} onChange={(e) => setFValue(e.target.value)} className="text-xs" />
        </div>

        <div className="border border-slate-200 rounded-lg max-h-72 overflow-y-auto divide-y divide-slate-100 font-mono text-[11px] bg-slate-950 text-slate-200 p-2">
          {filtered.map((m) => (
            <div key={m.id} className="py-1.5 px-2 hover:bg-slate-900">
              <div className="flex items-start gap-2">
                <span className="text-slate-500 shrink-0">{new Date(m.created_at).toLocaleTimeString()}</span>
                <span className="text-emerald-400 shrink-0">[{(m.protocol || '').toUpperCase()}]</span>
                <span className="text-blue-400 shrink-0">/{m.subtopic || ''}</span>
                <span className="text-slate-400 shrink-0">&lt;{m.publisher}&gt;:</span>
                <span className="text-slate-100 break-all">{m.payload}</span>
              </div>
              {(m.name || m.value) && (
                <div className="mt-1 pl-2 flex flex-wrap gap-1.5">
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-300 border border-blue-500/25">
                    {m.name || 'metric'}
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/25">
                    = {m.value}
                    {m.unit ? ` ${m.unit}` : ''}
                  </span>
                </div>
              )}
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="p-8 text-center text-slate-500">
              {all.length === 0 ? '该通道暂无历史消息，使用上方表单即可模拟发布' : '当前筛选条件下没有匹配消息'}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
