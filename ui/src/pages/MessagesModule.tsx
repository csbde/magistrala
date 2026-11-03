import React, { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchApi } from '../lib/api'
import { useAuthStore } from '../store/authStore'
import type { MessageRecord, Channel, Page } from '../types'
import {
  Button,
  Dialog,
  Input,
  Select,
  CopyButton,
  EmptyState,
} from '../components/ui/primitives'
import {
  Database,
  Search,
  RefreshCw,
  Terminal,
  Activity,
  Filter,
} from 'lucide-react'

export const MessagesModule: React.FC = () => {
  const { currentWorkspace } = useAuthStore()
  const [selectedChannel, setSelectedChannel] = useState('')
  const [search, setSearch] = useState('')
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [viewMessage, setViewMessage] = useState<MessageRecord | null>(null)

  const { data: channelsData } = useQuery({
    queryKey: ['channels', currentWorkspace?.id],
    queryFn: () => fetchApi<Page<Channel>>('/api/channels?limit=500'),
    enabled: !!currentWorkspace?.id,
  })

  const { data: rawMessages, isLoading, refetch } = useQuery({
    queryKey: ['all-messages', currentWorkspace?.id, selectedChannel],
    queryFn: () => {
      const url = selectedChannel
        ? `/api/messages?channel_id=${encodeURIComponent(selectedChannel)}&limit=150`
        : `/api/messages?limit=150`
      return fetchApi<MessageRecord[]>(url)
    },
    enabled: !!currentWorkspace?.id,
    refetchInterval: autoRefresh ? 3000 : false,
  })

  const channels = channelsData?.items ?? []
  const messages = useMemo(() => rawMessages ?? [], [rawMessages])

  const filtered = useMemo(() => {
    if (!search) return messages
    const q = search.toLowerCase()
    return messages.filter(
      (m) =>
        m.publisher?.toLowerCase().includes(q) ||
        m.subtopic?.toLowerCase().includes(q) ||
        m.channel_id?.toLowerCase().includes(q) ||
        m.payload?.toLowerCase().includes(q)
    )
  }, [messages, search])

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Database className="w-5 h-5 text-blue-600" />
            <span>消息数据中心 (Messages)</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            数据库中持久化存储的设备遥测与通信消息记录，支持按通道、设备、主题筛选与实时同步
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={autoRefresh ? 'primary' : 'outline'}
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
            className="flex items-center gap-1.5"
          >
            <Activity className={`w-3.5 h-3.5 ${autoRefresh ? 'animate-pulse text-emerald-300' : ''}`} />
            <span>{autoRefresh ? '实时监听中 (3s)' : '已暂停自动刷新'}</span>
          </Button>
          <Button variant="outline" size="sm" onClick={() => refetch()} title="立即手动刷新">
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400" />
          <span className="text-xs font-semibold text-slate-600">通道筛选:</span>
          <Select
            value={selectedChannel}
            onChange={(e) => setSelectedChannel(e.target.value)}
            className="w-52"
          >
            <option value="">全部通道</option>
            {channels.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.id})
              </option>
            ))}
          </Select>
        </div>

        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
          <Input
            placeholder="搜索设备 ID、子主题、Payload 关键字..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 w-full"
          />
        </div>

        <div className="text-xs text-slate-400 font-mono">
          共查询到 <strong className="text-slate-700">{filtered.length}</strong> 条历史记录
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        {isLoading ? (
          <EmptyState text="" loading />
        ) : filtered.length === 0 ? (
          <EmptyState text="当前暂无消息记录，可通过设备上报或消息测试台发布数据" />
        ) : (
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-xs font-semibold uppercase tracking-wider">
                <th className="py-3 px-4">时间</th>
                <th className="py-3 px-4">通道 ID</th>
                <th className="py-3 px-4">发送者 (Publisher)</th>
                <th className="py-3 px-4">协议</th>
                <th className="py-3 px-4">子主题 (Subtopic)</th>
                <th className="py-3 px-4">Payload 内容</th>
                <th className="py-3 px-4 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono text-xs">
              {filtered.map((m) => (
                <tr key={m.id} className="hover:bg-slate-50/70 transition">
                  <td className="py-3 px-4 text-slate-400 whitespace-nowrap">
                    {new Date(m.created_at).toLocaleTimeString()}{' '}
                    <span className="text-[10px] text-slate-300">
                      {new Date(m.created_at).toLocaleDateString()}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-blue-600 font-semibold">{m.channel_id}</td>
                  <td className="py-3 px-4 text-slate-700">{m.publisher || 'simulator'}</td>
                  <td className="py-3 px-4">
                    <span className="inline-block uppercase text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                      {m.protocol || 'mqtt'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-indigo-600">/{m.subtopic || ''}</td>
                  <td className="py-3 px-4 max-w-md truncate text-slate-600" title={m.payload}>
                    {m.payload}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => setViewMessage(m)}>
                        查看详情
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* View Detail Modal */}
      <Dialog
        open={!!viewMessage}
        onClose={() => setViewMessage(null)}
        title="消息数据详情"
        description={viewMessage ? `ID: ${viewMessage.id}` : ''}
      >
        {viewMessage && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs">
              <div>
                <span className="text-slate-400">时间:</span>{' '}
                <span className="font-mono text-slate-700">
                  {new Date(viewMessage.created_at).toLocaleString()}
                </span>
              </div>
              <div>
                <span className="text-slate-400">协议:</span>{' '}
                <span className="uppercase font-bold text-emerald-600">
                  {viewMessage.protocol}
                </span>
              </div>
              <div>
                <span className="text-slate-400">通道:</span>{' '}
                <span className="font-mono text-blue-600">{viewMessage.channel_id}</span>
              </div>
              <div>
                <span className="text-slate-400">发送者:</span>{' '}
                <span className="font-mono text-slate-800">{viewMessage.publisher}</span>
              </div>
              <div className="col-span-2">
                <span className="text-slate-400">主题:</span>{' '}
                <span className="font-mono text-slate-800">
                  channels/{viewMessage.channel_id}/messages/{viewMessage.subtopic || ''}
                </span>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                  <Terminal className="w-3.5 h-3.5 text-slate-500" />
                  <span>Payload 数据内容</span>
                </label>
                <CopyButton text={viewMessage.payload} label="复制数据" />
              </div>
              <pre className="p-3 bg-slate-950 text-emerald-400 font-mono text-xs rounded-lg overflow-x-auto max-h-60 leading-relaxed border border-slate-800">
                {(() => {
                  try {
                    return JSON.stringify(JSON.parse(viewMessage.payload), null, 2)
                  } catch {
                    return viewMessage.payload
                  }
                })()}
              </pre>
            </div>

            <div className="flex justify-end pt-2">
              <Button variant="outline" onClick={() => setViewMessage(null)}>
                关闭
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  )
}
