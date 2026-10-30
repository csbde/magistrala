import React, { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchApi } from '../lib/api'
import { useAuthStore } from '../store/authStore'
import { dict } from '../lib/i18n'
import type { Alarm, Page, User } from '../types'
import {
  Button,
  Dialog,
  Input,
  Select,
  SeverityBadge,
  StatusBadge,
  EmptyState,
} from '../components/ui/primitives'
import {
  Plus,
  BellRing,
  CheckCircle2,
  Clock,
  UserCheck,
  RotateCcw,
  History,
  
} from 'lucide-react'

export const AlarmsModule: React.FC = () => {
  const { currentWorkspace, language } = useAuthStore()
  const t = dict[language]
  const qc = useQueryClient()

  const [statusTab, setStatusTab] = useState<'all' | 'active' | 'acknowledged' | 'resolved'>('all')
  const [severityFilter, setSeverityFilter] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [historyAlarm, setHistoryAlarm] = useState<Alarm | null>(null)
  const [assignAlarm, setAssignAlarm] = useState<Alarm | null>(null)
  const [assigneeId, setAssigneeId] = useState('')

  const [form, setForm] = useState({
    title: '',
    summary: '',
    severity: 'critical' as 'critical' | 'high' | 'medium' | 'low',
    device_id: '',
  })

  const wsKey = ['alarms', currentWorkspace?.id]

  const { data, isLoading } = useQuery({
    queryKey: wsKey,
    queryFn: () => fetchApi<Page<Alarm>>('/api/alarms?limit=500'),
    enabled: !!currentWorkspace?.id,
  })

  const { data: usersData } = useQuery({
    queryKey: ['workspace-users', currentWorkspace?.id],
    queryFn: () => fetchApi<Page<User>>('/api/users?limit=100'),
    enabled: !!currentWorkspace?.id,
  })

  const actionMutation = useMutation({
    mutationFn: ({ id, action, assignee_id }: { id: string; action: string; assignee_id?: string }) =>
      fetchApi(`/api/alarms/${id}/action`, {
        method: 'POST',
        body: JSON.stringify({ action, assignee_id }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: wsKey })
      setAssignAlarm(null)
    },
    onError: (e: any) => alert(e.message),
  })

  const createMutation = useMutation({
    mutationFn: (payload: any) =>
      fetchApi<Alarm>('/api/alarms', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: wsKey })
      setCreateOpen(false)
      setForm({ title: '', summary: '', severity: 'critical', device_id: '' })
    },
    onError: (e: any) => alert(e.message),
  })

  const alarms = data?.items ?? []

  const counts = useMemo(() => {
    return {
      all: alarms.length,
      active: alarms.filter((a) => a.status === 'active').length,
      acknowledged: alarms.filter((a) => a.status === 'acknowledged').length,
      resolved: alarms.filter((a) => a.status === 'resolved').length,
      critical: alarms.filter((a) => a.severity === 'critical' && a.status !== 'resolved').length,
    }
  }, [alarms])

  const filtered = useMemo(() => {
    return alarms.filter((a) => {
      if (statusTab !== 'all' && a.status !== statusTab) return false
      if (severityFilter && a.severity !== severityFilter) return false
      return true
    })
  }, [alarms, statusTab, severityFilter])

  const users = usersData?.items ?? []

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-800">{t.alarms}</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            告警全生命周期跟踪：触发 (Active) → 确认接单 (Acknowledged) → 解决闭环 (Resolved)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value)} className="w-36">
            <option value="">全部等级</option>
            <option value="critical">严重 (Critical)</option>
            <option value="high">重要 (High)</option>
            <option value="medium">中度 (Medium)</option>
            <option value="low">轻微 (Low)</option>
          </Select>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4" />
            <span>手动触发告警</span>
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div
          onClick={() => setStatusTab('all')}
          className={`p-4 rounded-xl border bg-white cursor-pointer transition shadow-sm ${
            statusTab === 'all' ? 'border-blue-500 ring-2 ring-blue-100' : 'border-slate-200'
          }`}
        >
          <div className="text-xs text-slate-500">告警总数</div>
          <div className="text-2xl font-bold text-slate-800 mt-1">{counts.all}</div>
        </div>
        <div
          onClick={() => setStatusTab('active')}
          className={`p-4 rounded-xl border bg-white cursor-pointer transition shadow-sm ${
            statusTab === 'active' ? 'border-red-500 ring-2 ring-red-100' : 'border-slate-200'
          }`}
        >
          <div className="text-xs text-red-600 flex items-center justify-between">
            <span>未处理告警</span>
            <span className="text-[10px] bg-red-100 text-red-800 px-1.5 py-0.5 rounded font-bold">待响应</span>
          </div>
          <div className="text-2xl font-bold text-red-600 mt-1">{counts.active}</div>
        </div>
        <div
          onClick={() => setStatusTab('acknowledged')}
          className={`p-4 rounded-xl border bg-white cursor-pointer transition shadow-sm ${
            statusTab === 'acknowledged' ? 'border-blue-500 ring-2 ring-blue-100' : 'border-slate-200'
          }`}
        >
          <div className="text-xs text-blue-600">处理中 (已确认)</div>
          <div className="text-2xl font-bold text-blue-600 mt-1">{counts.acknowledged}</div>
        </div>
        <div
          onClick={() => setStatusTab('resolved')}
          className={`p-4 rounded-xl border bg-white cursor-pointer transition shadow-sm ${
            statusTab === 'resolved' ? 'border-emerald-500 ring-2 ring-emerald-100' : 'border-slate-200'
          }`}
        >
          <div className="text-xs text-emerald-600">已解决闭环</div>
          <div className="text-2xl font-bold text-emerald-600 mt-1">{counts.resolved}</div>
        </div>
      </div>

      {/* Alarms Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        {isLoading ? (
          <EmptyState text="" loading />
        ) : filtered.length === 0 ? (
          <EmptyState text={t.noData} />
        ) : (
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-xs font-semibold uppercase tracking-wider">
                <th className="py-3 px-4">告警摘要</th>
                <th className="py-3 px-4">等级</th>
                <th className="py-3 px-4">{t.status}</th>
                <th className="py-3 px-4">关联设备</th>
                <th className="py-3 px-4">负责人</th>
                <th className="py-3 px-4">发生时间</th>
                <th className="py-3 px-4 text-right">{t.actions}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((a) => (
                <tr key={a.id} className="hover:bg-slate-50/60 transition">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <BellRing
                        className={`w-4 h-4 shrink-0 ${
                          a.severity === 'critical' ? 'text-red-500' : a.severity === 'high' ? 'text-orange-500' : 'text-amber-500'
                        }`}
                      />
                      <div>
                        <div className="font-medium text-slate-800">{a.summary}</div>
                        {a.title && <div className="text-xs text-slate-500">{a.title}</div>}
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <SeverityBadge severity={a.severity} />
                  </td>
                  <td className="py-3 px-4">
                    <StatusBadge status={a.status} />
                  </td>
                  <td className="py-3 px-4 font-mono text-xs text-slate-500">
                    {a.device_id || '系统规则'}
                  </td>
                  <td className="py-3 px-4 text-xs text-slate-600">
                    {a.assignee_id ? (
                      <span className="font-medium text-blue-600">{a.assignee_id}</span>
                    ) : (
                      <span className="text-slate-400">未指派</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-xs text-slate-500">
                    {new Date(a.created_at).toLocaleString()}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {a.status === 'active' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => actionMutation.mutate({ id: a.id, action: 'acknowledge' })}
                          title="确认接单 (Acknowledge)"
                        >
                          <Clock className="w-3.5 h-3.5 text-blue-600" />
                          <span className="text-xs text-blue-600">确认</span>
                        </Button>
                      )}

                      {a.status !== 'resolved' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => actionMutation.mutate({ id: a.id, action: 'resolve' })}
                          title="标记解决 (Resolve)"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          <span className="text-xs text-emerald-600">解决</span>
                        </Button>
                      )}

                      {a.status === 'resolved' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => actionMutation.mutate({ id: a.id, action: 'reopen' })}
                          title="重新激活 (Reopen)"
                        >
                          <RotateCcw className="w-3.5 h-3.5 text-amber-600" />
                          <span className="text-xs text-amber-600">重开</span>
                        </Button>
                      )}

                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setAssigneeId(a.assignee_id || '')
                          setAssignAlarm(a)
                        }}
                        title="指派负责人"
                      >
                        <UserCheck className="w-3.5 h-3.5 text-slate-600" />
                      </Button>

                      <Button variant="ghost" size="sm" onClick={() => setHistoryAlarm(a)} title="处置历史日志">
                        <History className="w-3.5 h-3.5 text-slate-600" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Manual Trigger Dialog */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} title="手动触发告警 (测试)">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            createMutation.mutate({
              title: form.title || form.summary,
              summary: form.summary,
              severity: form.severity,
              device_id: form.device_id || undefined,
            })
          }}
          className="space-y-4"
        >
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">告警摘要 *</label>
            <Input required value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} placeholder="例如：设备电机过热温度超 85℃" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">告警标题</label>
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="温度阈值突破告警" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">告警等级</label>
              <Select value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value as any })}>
                <option value="critical">严重 (Critical)</option>
                <option value="high">重要 (High)</option>
                <option value="medium">中度 (Medium)</option>
                <option value="low">轻微 (Low)</option>
              </Select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">关联设备 ID (选填)</label>
              <Input value={form.device_id} onChange={(e) => setForm({ ...form, device_id: e.target.value })} placeholder="dev-xxx" />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>{t.cancel}</Button>
            <Button type="submit" loading={createMutation.isPending}>{t.save}</Button>
          </div>
        </form>
      </Dialog>

      {/* History Dialog */}
      <Dialog open={!!historyAlarm} onClose={() => setHistoryAlarm(null)} title="告警流转与处置记录" description={historyAlarm?.summary ?? ''}>
        <div className="space-y-3">
          {(historyAlarm?.history ?? []).length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-400">暂无历史记录</div>
          ) : (
            <div className="border border-slate-200 rounded-lg p-3 space-y-2 bg-slate-50 font-mono text-xs">
              {(historyAlarm?.history ?? []).map((h, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="text-blue-600 font-bold">[{i + 1}]</span>
                  <span className="text-slate-700">{h}</span>
                </div>
              ))}
            </div>
          )}
          <div className="flex justify-end">
            <Button variant="outline" onClick={() => setHistoryAlarm(null)}>关闭</Button>
          </div>
        </div>
      </Dialog>

      {/* Assign Dialog */}
      <Dialog
        open={!!assignAlarm}
        onClose={() => setAssignAlarm(null)}
        title="指派告警负责人"
        description={assignAlarm?.summary ?? ''}
        footer={
          <>
            <Button variant="outline" onClick={() => setAssignAlarm(null)}>{t.cancel}</Button>
            <Button
              disabled={!assigneeId}
              onClick={() => {
                if (assignAlarm && assigneeId) {
                  actionMutation.mutate({ id: assignAlarm.id, action: 'assign', assignee_id: assigneeId })
                }
              }}
            >
              确认指派
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <label className="block text-xs font-semibold text-slate-700">选择工作区成员</label>
          <Select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
            <option value="">-- 请选择处理人 --</option>
            {users.map((u) => (
              <option key={u.id} value={u.name || u.email}>
                {u.name || u.email} ({u.email})
              </option>
            ))}
          </Select>
        </div>
      </Dialog>
    </div>
  )
}
