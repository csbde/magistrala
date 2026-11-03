import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchApi } from '../lib/api'
import { useAuthStore } from '../store/authStore'
import type { Rule, Channel, Page } from '../types'
import {
  Button,
  Dialog,
  Input,
  Select,
  StatusBadge,
  EmptyState,
} from '../components/ui/primitives'
import {
  Workflow,
  Plus,
  Trash2,
  Globe,
  BellRing,
  ArrowRight,
} from 'lucide-react'
import { useToast } from '../components/ui/Toast'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'

export const RulesModule: React.FC = () => {
  const { currentWorkspace } = useAuthStore()
  const qc = useQueryClient()
  const { success, error: toastError } = useToast()

  const [createOpen, setCreateOpen] = useState(false)
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)

  const [form, setForm] = useState({
    name: '',
    input_channel: '',
    input_topic: '',
    has_condition: false,
    field: 'temperature',
    operator: '>',
    value: '30',
    action_type: 'webhook' as 'webhook' | 'alarm',
    webhook_url: 'https://webhook.site/test-sink',
    alarm_severity: 'high',
  })

  const { data: channelsData } = useQuery({
    queryKey: ['channels', currentWorkspace?.id],
    queryFn: () => fetchApi<Page<Channel>>('/api/channels?limit=500'),
    enabled: !!currentWorkspace?.id,
  })

  const { data: rulesData, isLoading } = useQuery({
    queryKey: ['/api/rules', currentWorkspace?.id],
    queryFn: () => fetchApi<Page<Rule>>('/api/rules'),
    enabled: !!currentWorkspace?.id,
  })

  const createMutation = useMutation({
    mutationFn: (newRule: any) =>
      fetchApi('/api/rules', {
        method: 'POST',
        body: JSON.stringify(newRule),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/rules'] })
      setCreateOpen(false)
      setForm({
        name: '',
        input_channel: '',
        input_topic: '',
        has_condition: false,
        field: 'temperature',
        operator: '>',
        value: '30',
        action_type: 'webhook',
        webhook_url: 'https://webhook.site/test-sink',
        alarm_severity: 'high',
      })
      success('联动规则创建成功')
    },
    onError: (e: any) => toastError(e.message || '创建规则失败'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => fetchApi(`/api/rules/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/rules'] })
      setDeleteTargetId(null)
      success('规则已删除')
    },
    onError: (e: any) => toastError(e.message || '删除规则失败'),
  })

  const channels = channelsData?.items ?? []
  const rules = rulesData?.items ?? []

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault()

    const logic: Record<string, any> = {}
    if (form.has_condition && form.field) {
      logic.field = form.field
      logic.operator = form.operator
      logic.value = parseFloat(form.value) || 0
    }

    const outputs: Record<string, any> = {
      action: form.action_type,
    }
    if (form.action_type === 'webhook') {
      outputs.url = form.webhook_url
    } else {
      outputs.severity = form.alarm_severity
    }

    createMutation.mutate({
      name: form.name,
      input_channel: form.input_channel || undefined,
      input_topic: form.input_topic || undefined,
      logic,
      outputs,
      status: 'enabled',
    })
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Workflow className="w-5 h-5 text-indigo-600" />
            <span>规则引擎 (Rules Engine)</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            监听设备通道数据流，满足阈值或条件时自动将数据<strong>推送至第三方平台 Webhook</strong> 或 <strong>触发系统告警</strong>
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="flex items-center gap-1.5">
          <Plus className="w-4 h-4" />
          <span>新建联动规则</span>
        </Button>
      </div>

      {/* Rules Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        {isLoading ? (
          <EmptyState text="" loading />
        ) : rules.length === 0 ? (
          <EmptyState text="暂无规则，点击上方「新建联动规则」添加数据流转与推送动作" />
        ) : (
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-xs font-semibold uppercase tracking-wider">
                <th className="py-3 px-4">规则名称</th>
                <th className="py-3 px-4">监听通道 / Topic</th>
                <th className="py-3 px-4">触发条件 (Logic)</th>
                <th className="py-3 px-4">执行动作 (Action)</th>
                <th className="py-3 px-4">状态</th>
                <th className="py-3 px-4 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rules.map((r) => {
                const action = (r.outputs?.action as string) || 'webhook'
                const isWebhook = action === 'webhook'
                const targetUrl = (r.outputs?.url as string) || ''
                const hasLogic = r.logic && r.logic.field

                return (
                  <tr key={r.id} className="hover:bg-slate-50/60 transition">
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-800">{r.name}</div>
                      <div className="text-[11px] font-mono text-slate-400">{r.id}</div>
                    </td>
                    <td className="py-3 px-4 font-mono text-xs text-slate-600">
                      <div>通道: {r.input_channel || '<全部通道>'}</div>
                      <div className="text-slate-400">主题: {r.input_topic || '# (全部)'}</div>
                    </td>
                    <td className="py-3 px-4">
                      {hasLogic ? (
                        <span className="inline-flex items-center gap-1 font-mono text-xs bg-amber-50 text-amber-800 px-2 py-0.5 rounded border border-amber-200">
                          {r.logic?.field} {r.logic?.operator} {r.logic?.value}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">无条件 (流经即触发)</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {isWebhook ? (
                        <div className="space-y-0.5">
                          <span className="inline-flex items-center gap-1 text-xs font-medium bg-blue-50 text-blue-700 px-2 py-0.5 rounded border border-blue-200">
                            <Globe className="w-3 h-3" />
                            <span>HTTP Webhook 推送</span>
                          </span>
                          {targetUrl && (
                            <div className="font-mono text-[11px] text-slate-500 truncate max-w-xs" title={targetUrl}>
                              {targetUrl}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-medium bg-red-50 text-red-700 px-2 py-0.5 rounded border border-red-200">
                          <BellRing className="w-3 h-3" />
                          <span>自动触发告警 ({r.outputs?.severity || 'high'})</span>
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => setDeleteTargetId(r.id)}
                        className="text-slate-400 hover:text-red-600 p-1.5 rounded hover:bg-red-50 transition"
                        title="删除规则"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Create Dialog */}
      <Dialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="新建数据流转规则 (Rules Engine)"
        description="配置数据监听、过滤条件以及推送至外部平台或告警中心"
        width="max-w-xl"
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">规则名称 *</label>
            <Input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="例如：温度过高外部平台推送规则"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">监听通道 (Channel)</label>
              <Select
                value={form.input_channel}
                onChange={(e) => setForm({ ...form, input_channel: e.target.value })}
              >
                <option value="">-- 全部通道 --</option>
                {channels.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.id})
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">匹配子主题 (Subtopic)</label>
              <Input
                value={form.input_topic}
                onChange={(e) => setForm({ ...form, input_topic: e.target.value })}
                placeholder="例如：temperature 或留空匹配全部"
              />
            </div>
          </div>

          {/* Condition settings */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-800 cursor-pointer">
              <input
                type="checkbox"
                checked={form.has_condition}
                onChange={(e) => setForm({ ...form, has_condition: e.target.checked })}
                className="rounded text-blue-600"
              />
              <span>设置字段数值过滤条件（默认无条件全量转发）</span>
            </label>

            {form.has_condition && (
              <div className="grid grid-cols-3 gap-2 pt-1">
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">JSON 字段名</label>
                  <Input
                    required={form.has_condition}
                    value={form.field}
                    onChange={(e) => setForm({ ...form, field: e.target.value })}
                    placeholder="temperature"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">比较符号</label>
                  <Select
                    value={form.operator}
                    onChange={(e) => setForm({ ...form, operator: e.target.value })}
                  >
                    <option value=">">&gt; (大于)</option>
                    <option value=">=">&gt;= (大于等于)</option>
                    <option value="<">&lt; (小于)</option>
                    <option value="<=">&lt;= (小于等于)</option>
                    <option value="==">== (等于)</option>
                  </Select>
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">阈值数值</label>
                  <Input
                    type="number"
                    step="any"
                    required={form.has_condition}
                    value={form.value}
                    onChange={(e) => setForm({ ...form, value: e.target.value })}
                    placeholder="30"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Action Settings */}
          <div className="p-3 bg-blue-50/60 border border-blue-200 rounded-lg space-y-3">
            <div className="text-xs font-semibold text-blue-900 flex items-center gap-1.5">
              <ArrowRight className="w-4 h-4 text-blue-600" />
              <span>数据流转执行动作</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <label className="flex items-center gap-2 p-2.5 bg-white rounded border border-blue-200 cursor-pointer">
                <input
                  type="radio"
                  name="action_type"
                  checked={form.action_type === 'webhook'}
                  onChange={() => setForm({ ...form, action_type: 'webhook' })}
                  className="text-blue-600"
                />
                <div className="text-xs">
                  <div className="font-semibold text-slate-800">推送至外部平台 Webhook</div>
                  <div className="text-[11px] text-slate-500">通过 HTTP POST 推送 JSON 到第三方</div>
                </div>
              </label>

              <label className="flex items-center gap-2 p-2.5 bg-white rounded border border-blue-200 cursor-pointer">
                <input
                  type="radio"
                  name="action_type"
                  checked={form.action_type === 'alarm'}
                  onChange={() => setForm({ ...form, action_type: 'alarm' })}
                  className="text-blue-600"
                />
                <div className="text-xs">
                  <div className="font-semibold text-slate-800">自动触发系统告警</div>
                  <div className="text-[11px] text-slate-500">产生告警工单并指派负责人</div>
                </div>
              </label>
            </div>

            {form.action_type === 'webhook' ? (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  外部平台 Webhook URL * (支持 POST 接收)
                </label>
                <Input
                  required
                  type="url"
                  value={form.webhook_url}
                  onChange={(e) => setForm({ ...form, webhook_url: e.target.value })}
                  placeholder="https://api.your-platform.com/v1/iot-stream"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  平台将以 POST application/json 格式发送包含 channel_id, publisher, payload 的完整数据包。
                </p>
              </div>
            ) : (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">告警等级</label>
                <Select
                  value={form.alarm_severity}
                  onChange={(e) => setForm({ ...form, alarm_severity: e.target.value })}
                >
                  <option value="critical">严重 (Critical)</option>
                  <option value="high">重要 (High)</option>
                  <option value="medium">中度 (Medium)</option>
                  <option value="low">轻微 (Low)</option>
                </Select>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
              取消
            </Button>
            <Button type="submit" loading={createMutation.isPending}>
              保存规则
            </Button>
          </div>
        </form>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTargetId}
        title="确认删除规则"
        message="删除该规则后将停止相关数据监听与流转推送，确定要删除吗？"
        loading={deleteMutation.isPending}
        onConfirm={() => {
          if (deleteTargetId) deleteMutation.mutate(deleteTargetId)
        }}
        onClose={() => setDeleteTargetId(null)}
      />
    </div>
  )
}
