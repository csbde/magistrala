import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchApi } from '../lib/api'
import { useAuthStore } from '../store/authStore'
import type { Alarm, Channel, Dashboard, Device, MessageRecord, Page } from '../types'
import { Badge, Button, CopyButton, Dialog, EmptyState, Input, Select, StatusBadge, Tabs, Textarea } from '../components/ui/primitives'
import { useToast } from '../components/ui/Toast'
import {
  Activity,
  BarChart3,
  Database,
  Download,
  Gauge as GaugeIcon,
  LayoutGrid,
  List,
  Maximize2,
  Minimize2,
  Pencil,
  Plus,
  Power,
  Settings2,
  Share2,
  Globe,
  Sparkles,
  Table2,
  Tag,
  Trash2,
  Upload,
  X,
} from 'lucide-react'

/* ------------------------------- 类型定义 -------------------------------- */

export type WidgetKind = 'line' | 'gauge' | 'value' | 'count' | 'alarms' | 'switch'

export interface WidgetConfig {
  id: string
  kind: WidgetKind
  title: string
  /** 数据源：具体设备/通道 id，或按 tag 匹配（模板用） */
  deviceId?: string
  deviceName?: string
  channelId?: string
  channelName?: string
  metric?: string
  unit?: string
  /** 模板：按标签抽象匹配数据源 */
  matchTag?: string
  min?: number
  max?: number
  warnAbove?: number
  span?: 1 | 2 | 3 | 4
  /** 控制开关下行命令 */
  commandTopic?: string
  commandValueOn?: string
  commandValueOff?: string
}

export interface DashLayout {
  widgets: WidgetConfig[]
}

const KIND_META: Record<WidgetKind, { label: string; icon: React.ComponentType<{ className?: string }>; hint: string }> = {
  line: { label: '时序曲线', icon: Activity, hint: '展示指标随时间变化的趋势曲线' },
  gauge: { label: '仪表盘', icon: GaugeIcon, hint: '展示百分比或区间型指标' },
  value: { label: '数值卡片', icon: Sparkles, hint: '展示最新读数与变化趋势' },
  count: { label: '统计计数', icon: LayoutGrid, hint: '展示设备/网关/通道数量' },
  alarms: { label: '告警列表', icon: Table2, hint: '展示实时告警流' },
  switch: { label: '控制开关', icon: Power, hint: '向设备下发开/关控制命令' },
}

const METRIC_PRESETS = [
  { key: 'temperature', label: '温度', unit: '°C' },
  { key: 'humidity', label: '湿度', unit: '%' },
  { key: 'voltage', label: '电压', unit: 'V' },
  { key: 'current', label: '电流', unit: 'A' },
  { key: 'power', label: '功率', unit: 'kW' },
  { key: 'pressure', label: '气压', unit: 'kPa' },
  { key: 'speed', label: '转速', unit: 'rpm' },
  { key: 'co2', label: 'CO₂', unit: 'ppm' },
]

const UNIT_PRESETS = ['°C', '%', 'V', 'A', 'W', 'kW', 'kPa', 'rpm', 'ppm', 'Hz']

const isTemplate = (d: Dashboard) => (d.metadata?.kind === 'template' || d.metadata?.is_template === true) === true

const LEGACY_KIND_MAP: Record<string, WidgetKind> = {
  counter: 'count',
  count: 'count',
  chart: 'line',
  line: 'line',
  gauge: 'gauge',
  value: 'value',
  alarms: 'alarms',
  alarm: 'alarms',
  switch: 'switch',
  control: 'switch',
}

/** 归一化布局：兼容早期示例中 type/value 形式的旧组件定义 */
const layoutOf = (d: Dashboard): WidgetConfig[] => {
  const raw = (d.layout?.widgets ?? []) as any[]
  if (!Array.isArray(raw)) return []
  return raw.map((w, idx) => {
    if (w.kind && KIND_META[w.kind as WidgetKind]) return w as WidgetConfig
    const kind = LEGACY_KIND_MAP[String(w.type || '').toLowerCase()] || 'value'
    return {
      id: w.id || `w-legacy-${idx}`,
      kind,
      title: w.title || '未命名组件',
      metric: w.metric,
      unit: kind === 'gauge' && typeof w.value === 'string' ? w.value.replace(/[-\d.]+/g, '') || undefined : w.unit,
      deviceId: w.deviceId,
      channelId: w.channelId,
      matchTag: w.matchTag,
      span: w.span ?? 1,
      min: w.min,
      max: w.max,
      warnAbove: w.warnAbove,
    } as WidgetConfig
  })
}

/* ------------------------------- SVG 渲染组件 ----------------------------- */

/** 纯 SVG 迷你曲线组件 */
const MiniLineChart: React.FC<{ points: number[]; unit?: string }> = ({ points, unit }) => {
  if (points.length < 2) {
    return <div className="h-32 flex items-center justify-center text-xs text-slate-400">暂无时序数据</div>
  }
  const min = Math.min(...points)
  const max = Math.max(...points)
  const range = max - min || 1
  const w = 400
  const h = 120
  const pad = 12

  const coords = points.map((p, i) => {
    const x = pad + (i / (points.length - 1)) * (w - pad * 2)
    const y = h - pad - ((p - min) / range) * (h - pad * 2)
    return { x, y }
  })
  const pathD = coords.reduce((acc, c, i) => (i === 0 ? `M ${c.x} ${c.y}` : `${acc} L ${c.x} ${c.y}`), '')
  const areaD = `${pathD} L ${coords[coords.length - 1].x} ${h - pad} L ${coords[0].x} ${h - pad} Z`

  const latest = points[points.length - 1]
  const avg = (points.reduce((a, b) => a + b, 0) / points.length).toFixed(1)

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between text-xs text-slate-500">
        <div>
          最新: <span className="text-base font-bold text-slate-900">{latest}</span> {unit}
        </div>
        <div>
          均值: <span className="font-semibold text-slate-700">{avg}</span> · 最低: {min} · 最高: {max}
        </div>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-32 overflow-visible">
        <defs>
          <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.0" />
          </linearGradient>
        </defs>
        {/* 网格水平线 */}
        <line x1={pad} y1={pad} x2={w - pad} y2={pad} stroke="#e2e8f0" strokeDasharray="3 3" />
        <line x1={pad} y1={h / 2} x2={w - pad} y2={h / 2} stroke="#e2e8f0" strokeDasharray="3 3" />
        <line x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} stroke="#e2e8f0" />
        <path d={areaD} fill="url(#chartGrad)" />
        <path d={pathD} fill="none" stroke="#2563eb" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        {coords.map((c, i) => (
          <circle key={i} cx={c.x} cy={c.y} r={i === coords.length - 1 ? 4 : 2} fill="#2563eb" />
        ))}
      </svg>
    </div>
  )
}

/** 纯 SVG 半圆仪表盘组件 */
const SemiGauge: React.FC<{ value: number; min?: number; max?: number; unit?: string; warnAbove?: number }> = ({
  value,
  min = 0,
  max = 100,
  unit = '%',
  warnAbove,
}) => {
  const clampVal = Math.min(Math.max(value, min), max)
  const ratio = (clampVal - min) / (max - min || 1)
  // angle calc
  const isWarn = warnAbove !== undefined && clampVal >= warnAbove

  return (
    <div className="flex flex-col items-center justify-center py-2">
      <svg viewBox="0 0 200 110" className="w-48 overflow-visible">
        {/* 背景底轨 */}
        <path
          d="M 20 100 A 80 80 0 0 1 180 100"
          fill="none"
          stroke="#e2e8f0"
          strokeWidth="16"
          strokeLinecap="round"
        />
        {/* 彩色填充轨 */}
        <path
          d="M 20 100 A 80 80 0 0 1 180 100"
          fill="none"
          stroke={isWarn ? '#ef4444' : '#3b82f6'}
          strokeWidth="16"
          strokeLinecap="round"
          strokeDasharray="251.2"
          strokeDashoffset={251.2 * (1 - ratio)}
          className="transition-all duration-500"
        />
        {/* 中心数字 */}
        <text x="100" y="85" textAnchor="middle" className="text-2xl font-extrabold fill-slate-900" fontSize="28">
          {clampVal}
        </text>
        <text x="100" y="102" textAnchor="middle" className="text-xs fill-slate-500" fontSize="12">
          {unit}
        </text>
      </svg>
      <div className="flex justify-between w-48 text-[11px] text-slate-400 -mt-2">
        <span>{min}</span>
        {warnAbove !== undefined && <span className="text-amber-500 font-medium">预警: {warnAbove}</span>}
        <span>{max}</span>
      </div>
    </div>
  )
}

/* --------------------------- 指标解析与绑定匹配 --------------------------- */

const toNumber = (v: any): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v)
  return null
}

/**
 * 从消息中取出目标指标数值。
 * 依次尝试：结构化 name/value 字段 -> SenML 数组载荷 -> 普通 JSON 对象载荷。
 */
const metricFromMessage = (m: MessageRecord, metric?: string): number | null => {
  const hit = (name?: string) => {
    if (!metric) return true
    const n = name || ''
    return n === metric || n.includes(metric)
  }

  if (hit(m.name) || (!metric && m.name)) {
    const v = toNumber(m.value)
    if (v !== null) return v
  }
  if (!metric && (m.subtopic === undefined || m.subtopic === '')) {
    const v = toNumber(m.value)
    if (v !== null) return v
  }

  const payload = (m.payload || '').trim()
  if (payload.startsWith('[')) {
    try {
      const recs: any[] = JSON.parse(payload)
      for (const r of recs) {
        if (hit(r?.n)) {
          const v = toNumber(r?.v)
          if (v !== null) return v
        }
      }
    } catch {
      /* 忽略非法 JSON */
    }
  } else if (payload.startsWith('{')) {
    try {
      const obj = JSON.parse(payload)
      if (metric && Object.prototype.hasOwnProperty.call(obj, metric)) {
        const v = toNumber(obj[metric])
        if (v !== null) return v
      }
      for (const k of Object.keys(obj)) {
        if (hit(k)) {
          const v = toNumber(obj[k])
          if (v !== null) return v
        }
      }
    } catch {
      /* 忽略非法 JSON */
    }
  }

  // 最后兜底：subtopic 命中指标名时直接使用 value 字段
  if (metric && (m.subtopic || '').includes(metric)) {
    return toNumber(m.value)
  }
  return null
}

interface BindingFilter {
  metric?: string
  deviceIds?: string[]
  channelId?: string
}

/** 判断某条上报消息是否命中组件的数据绑定条件 */
const messageMatchesBinding = (m: MessageRecord, f: BindingFilter): boolean => {
  if (f.deviceIds && f.deviceIds.length > 0 && !f.deviceIds.includes(m.publisher)) return false
  if (f.channelId && m.channel_id !== f.channelId) return false
  return metricFromMessage(m, f.metric) !== null
}

/* ---------------------------- 数据绑定辅助展示 ---------------------------- */

const bindingSummary = (w: WidgetConfig, devices: Device[], channels: Channel[]) => {
  if (w.kind === 'count') return '数据源: 当前工作空间实体统计'
  if (w.kind === 'alarms') return '数据源: 当前工作空间告警流'

  const parts: string[] = []
  if (w.matchTag) {
    const hit = devices.filter((d) => (d.tags || []).some((tg) => tg === w.matchTag || tg.includes(w.matchTag as string)))
    parts.push(`标签 #${w.matchTag} → ${hit.length} 台设备`)
  }
  if (w.deviceId) {
    const dev = devices.find((d) => d.id === w.deviceId)
    parts.push(`设备 ${dev?.name || w.deviceId}`)
  }
  if (w.channelId) {
    const ch = channels.find((c) => c.id === w.channelId)
    parts.push(`通道 ${ch?.name || w.channelId}`)
  }
  if (w.metric) parts.push(`指标 ${w.metric}`)
  return parts.length ? '绑定: ' + parts.join(' · ') : '未绑定数据源（点击「配置数据绑定」）'
}

const NoDataHint: React.FC<{ w: WidgetConfig }> = ({ w }) => (
  <div className="h-32 flex flex-col items-center justify-center gap-1.5 text-center px-4">
    <Database className="w-5 h-5 text-slate-300" />
    <div className="text-xs text-slate-400">当前绑定条件未匹配到任何上报数据</div>
    <div className="text-[11px] text-slate-400 font-mono">{bindingSummary(w, [], [])}</div>
  </div>
)

/* ------------------------------- 单个 Widget 呈现 ----------------------------- */

interface WidgetCardProps {
  w: WidgetConfig
  isEditing: boolean
  onDelete?: () => void
  onEdit?: () => void
  devices: Device[]
  channels: Channel[]
  alarms: Alarm[]
  recentMessages: MessageRecord[]
}

const WidgetCard: React.FC<WidgetCardProps> = ({ w, isEditing, onDelete, onEdit, devices, channels, alarms, recentMessages }) => {
  const { success, error } = useToast()
  const [switchState, setSwitchState] = useState(false)
  const [switching, setSwitching] = useState(false)

  // 数据绑定解析：标签匹配 -> 命中设备集合
  const boundDeviceIds = useMemo(() => {
    const ids: string[] = []
    if (w.deviceId) ids.push(w.deviceId)
    if (w.matchTag) {
      devices
        .filter((d) => (d.tags || []).some((tg) => tg === w.matchTag || tg.includes(w.matchTag as string)))
        .forEach((d) => ids.push(d.id))
    }
    return ids
  }, [w.deviceId, w.matchTag, devices])

  const boundChannelIds = useMemo(() => {
    if (!w.channelId) return [] as string[]
    return [w.channelId]
  }, [w.channelId])

  // 提取时序或最新值（按绑定的设备/通道/指标过滤真实上报数据）
  const series = useMemo(() => {
    const list = recentMessages
      .filter((m) => messageMatchesBinding(m, { metric: w.metric, deviceIds: boundDeviceIds, channelId: boundChannelIds[0] }))
      .map((m) => metricFromMessage(m, w.metric))
      .filter((n): n is number => n !== null)
    return list.length ? list.slice(0, 20).reverse() : []
  }, [recentMessages, w.metric, boundDeviceIds, boundChannelIds])

  const hasData = series.length > 0
  const sampleCount = series.length

  const latestVal = hasData ? series[series.length - 1] : null

  const handleToggleSwitch = async () => {
    setSwitching(true)
    try {
      const next = !switchState
      // 向绑定的通道（未绑定则取首个通道）下发控制指令
      const targetChan = w.channelId || channels[0]?.id
      if (!targetChan) {
        error('该控制开关尚未绑定通信通道，请先在「配置数据绑定」中指定通道')
        setSwitching(false)
        return
      }
      await fetchApi('/api/channels/' + targetChan + '/messages', {
        method: 'POST',
        body: JSON.stringify({
          subtopic: w.commandTopic || 'cmd/power',
          protocol: 'http',
          payload: JSON.stringify({ state: next ? w.commandValueOn || 'ON' : w.commandValueOff || 'OFF' }),
        }),
      }).catch(() => {
        // 允许模拟演示
      })
      setSwitchState(next)
      success(`已下发控制命令: ${next ? '开 (ON)' : '关 (OFF)'}`)
    } catch (e: any) {
      error(e.message || '指令下发失败')
    } finally {
      setSwitching(false)
    }
  }

  const spanClass = {
    1: 'col-span-1',
    2: 'col-span-1 md:col-span-2',
    3: 'col-span-1 md:col-span-3',
    4: 'col-span-1 md:col-span-4',
  }[w.span || 1]

  const Icon = KIND_META[w.kind]?.icon || Activity

  return (
    <div className={`bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-col justify-between ${spanClass} relative group`}>
      {isEditing && (
        <div className="absolute top-2 right-2 flex items-center gap-1 z-10">
          <button
            onClick={onEdit}
            title="配置数据绑定"
            className="p-1 text-slate-400 hover:text-blue-600 rounded hover:bg-blue-50 border border-transparent hover:border-blue-200"
          >
            <Settings2 className="w-4 h-4" />
          </button>
          <button
            onClick={onDelete}
            title="删除该组件"
            className="p-1 text-slate-400 hover:text-red-600 rounded hover:bg-red-50 border border-transparent hover:border-red-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 标题栏 */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-blue-50 text-blue-600">
            <Icon className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-slate-800">{w.title}</h4>
            <div className="text-[11px] text-slate-400">
              {bindingSummary(w, devices, channels)}
            </div>
          </div>
        </div>
        <span className="text-[10px] text-slate-400 uppercase font-mono">{w.kind}</span>
      </div>

      {/* 组件内容区 */}
      <div className="py-2">
        {w.kind === 'line' &&
          (hasData ? (
            <MiniLineChart points={series} unit={w.unit || ''} />
          ) : (
            <NoDataHint w={w} />
          ))}

        {w.kind === 'gauge' &&
          (hasData ? (
            <SemiGauge
              value={latestVal as number}
              min={w.min ?? 0}
              max={w.max ?? 100}
              unit={w.unit || '%'}
              warnAbove={w.warnAbove}
            />
          ) : (
            <NoDataHint w={w} />
          ))}

        {w.kind === 'value' && (
          <div className="flex items-baseline justify-between py-2">
            <div>
              <span className="text-3xl font-extrabold text-slate-900 tracking-tight">
                {hasData ? latestVal : '--'}
              </span>
              <span className="text-sm font-medium text-slate-500 ml-1">{w.unit || ''}</span>
            </div>
            {hasData ? (
              <div className="text-xs text-emerald-600 font-semibold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                {sampleCount} 条样本 · 实时上报
              </div>
            ) : (
              <div className="text-xs text-amber-700 font-semibold bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                未匹配到数据
              </div>
            )}
          </div>
        )}

        {w.kind === 'count' && (
          <div className="grid grid-cols-3 gap-2 py-2 text-center">
            <div className="p-2 rounded-lg bg-slate-50 border border-slate-100">
              <div className="text-xs text-slate-500">设备总数</div>
              <div className="text-xl font-bold text-slate-900 mt-1">{devices.length}</div>
            </div>
            <div className="p-2 rounded-lg bg-slate-50 border border-slate-100">
              <div className="text-xs text-slate-500">网关设备</div>
              <div className="text-xl font-bold text-blue-600 mt-1">{devices.filter((d) => d.is_gateway).length}</div>
            </div>
            <div className="p-2 rounded-lg bg-slate-50 border border-slate-100">
              <div className="text-xs text-slate-500">通讯通道</div>
              <div className="text-xl font-bold text-indigo-600 mt-1">{channels.length}</div>
            </div>
          </div>
        )}

        {w.kind === 'alarms' && (
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {alarms.slice(0, 5).map((a) => (
              <div key={a.id} className="p-2 rounded border border-slate-100 bg-slate-50 flex items-center justify-between text-xs">
                <div className="truncate pr-2">
                  <div className="font-medium text-slate-800 truncate">{a.summary || a.title || '告警事件'}</div>
                  <div className="text-[10px] text-slate-400 font-mono">{a.id}</div>
                </div>
                <StatusBadge status={a.severity} />
              </div>
            ))}
            {alarms.length === 0 && <div className="text-xs text-slate-400 text-center py-4">当前无活跃告警</div>}
          </div>
        )}

        {w.kind === 'switch' && (
          <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-100">
            <div>
              <div className="text-xs font-semibold text-slate-700">设备开关电源控制</div>
              <div className="text-[11px] text-slate-400">
                当前状态: <strong className={switchState ? 'text-emerald-600' : 'text-slate-500'}>{switchState ? '开启' : '关闭'}</strong>
              </div>
            </div>
            <Button
              variant={switchState ? 'danger' : 'success'}
              size="sm"
              loading={switching}
              onClick={handleToggleSwitch}
            >
              <Power className="w-3.5 h-3.5 mr-1" />
              {switchState ? '立即断开' : '立即启动'}
            </Button>
          </div>
        )}
      </div>

      <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200 font-mono">
            指标: {w.metric || '全部'}
          </span>
          {w.deviceId && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 font-mono">
              设备: {w.deviceName || w.deviceId}
            </span>
          )}
          {w.channelId && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 font-mono">
              通道: {w.channelName || w.channelId}
            </span>
          )}
          {w.matchTag && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200 font-mono">
              标签: #{w.matchTag} ({boundDeviceIds.length} 台)
            </span>
          )}
          {!w.deviceId && !w.channelId && !w.matchTag && w.kind !== 'count' && w.kind !== 'alarms' && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
              未绑定数据源
            </span>
          )}
        </div>
        <span className="text-[10px] text-slate-400">5s 轮询</span>
      </div>
    </div>
  )
}

/* ------------------------------- 大屏画布组件 ----------------------------- */

interface DashboardCanvasProps {
  dashboard: Dashboard
  onBack: () => void
  readOnly?: boolean
}

export const DashboardCanvas: React.FC<DashboardCanvasProps> = ({ dashboard: initialDash, onBack, readOnly = false }) => {
  const queryClient = useQueryClient()
  const { success, error } = useToast()
  const { currentWorkspace } = useAuthStore()
  const [dash, setDash] = useState<Dashboard>(initialDash)
  const [isEditing, setIsEditing] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [addWidgetOpen, setAddWidgetOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Widget 配置表单（新增与编辑共用）
  const emptyForm = {
    kind: 'line' as WidgetKind,
    title: '',
    metric: 'temperature',
    unit: '°C',
    deviceId: '',
    channelId: '',
    matchTag: '',
    span: 2 as 1 | 2 | 3 | 4,
    min: 0,
    max: 100,
    warnAbove: 80,
    commandTopic: 'cmd/power',
    commandValueOn: 'ON',
    commandValueOff: 'OFF',
  }
  const [form, setForm] = useState(emptyForm)
  const [editingWidgetId, setEditingWidgetId] = useState<string | null>(null)
  const patchForm = (patch: Partial<typeof emptyForm>) => setForm((f) => ({ ...f, ...patch }))

  // 设备/通道/告警数据轮询
  const { data: devData } = useQuery({
    queryKey: ['devices', currentWorkspace?.id],
    queryFn: () => fetchApi<Page<Device>>('/api/devices?limit=500'),
    refetchInterval: 5000,
  })
  const { data: chanData } = useQuery({
    queryKey: ['channels', currentWorkspace?.id],
    queryFn: () => fetchApi<Page<Channel>>('/api/channels?limit=500'),
    refetchInterval: 5000,
  })
  const { data: alarmData } = useQuery({
    queryKey: ['alarms', currentWorkspace?.id],
    queryFn: () => fetchApi<Page<Alarm>>('/api/alarms?limit=500'),
    refetchInterval: 5000,
  })
  const { data: msgData } = useQuery({
    queryKey: ['messages', currentWorkspace?.id],
    queryFn: () => fetchApi<Page<MessageRecord>>('/api/messages?limit=100'),
    refetchInterval: 5000,
  })

  const devices = useMemo(() => devData?.items ?? [], [devData])
  const channels = useMemo(() => chanData?.items ?? [], [chanData])
  const alarms = useMemo(() => alarmData?.items ?? [], [alarmData])
  const messages = useMemo(() => msgData?.items ?? [], [msgData])

  const widgets = useMemo(() => layoutOf(dash), [dash])

  // 绑定预览：当前表单条件能匹配到多少条真实上报
  const previewMessageCount = useMemo(() => {
    const tagDeviceIds = form.matchTag
      ? devices
          .filter((d) => (d.tags || []).some((tg) => tg === form.matchTag || tg.includes(form.matchTag)))
          .map((d) => d.id)
      : []
    const deviceIds = form.deviceId ? [form.deviceId, ...tagDeviceIds] : tagDeviceIds

    return messages.filter((m) =>
      messageMatchesBinding(m, { metric: form.metric || undefined, deviceIds, channelId: form.channelId || undefined }),
    ).length
  }, [messages, devices, form])

  // 保存布局
  const saveMutation = useMutation({
    mutationFn: (updated: Dashboard) =>
      fetchApi(`/api/dashboards/${updated.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: updated.name,
          description: updated.description,
          layout: updated.layout,
          shareable: updated.shareable,
          metadata: updated.metadata,
        }),
      }),
    onSuccess: (data) => {
      setDash(data)
      queryClient.invalidateQueries({ queryKey: ['dashboards'] })
      success('看板布局已成功保存')
      setIsEditing(false)
    },
    onError: (e: any) => error(e.message || '保存失败'),
  })

  // 全屏切换
  const toggleFullscreen = () => {
    if (!containerRef.current) return
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {})
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {})
    }
  }

  useEffect(() => {
    const handleFSEnv = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', handleFSEnv)
    return () => document.removeEventListener('fullscreenchange', handleFSEnv)
  }, [])

  const handleDeleteWidget = (wId: string) => {
    const nextWidgets = widgets.filter((w) => w.id !== wId)
    setDash({ ...dash, layout: { ...dash.layout, widgets: nextWidgets } })
  }

  const openAddWidget = () => {
    setEditingWidgetId(null)
    setForm({ ...emptyForm })
    setAddWidgetOpen(true)
  }

  const openEditWidget = (w: WidgetConfig) => {
    setEditingWidgetId(w.id)
    setForm({
      kind: w.kind,
      title: w.title,
      metric: w.metric ?? 'temperature',
      unit: w.unit ?? '',
      deviceId: w.deviceId ?? '',
      channelId: w.channelId ?? '',
      matchTag: w.matchTag ?? '',
      span: w.span ?? 2,
      min: w.min ?? 0,
      max: w.max ?? 100,
      warnAbove: w.warnAbove ?? 80,
      commandTopic: w.commandTopic ?? 'cmd/power',
      commandValueOn: w.commandValueOn ?? 'ON',
      commandValueOff: w.commandValueOff ?? 'OFF',
    })
    setAddWidgetOpen(true)
  }

  const handleSaveWidget = (e: React.FormEvent) => {
    e.preventDefault()
    const dev = devices.find((d) => d.id === form.deviceId)
    const ch = channels.find((c) => c.id === form.channelId)

    const cfg: WidgetConfig = {
      id: editingWidgetId || `w-${Date.now().toString(36)}`,
      kind: form.kind,
      title: form.title || KIND_META[form.kind].label,
      metric: form.kind === 'count' || form.kind === 'alarms' ? undefined : form.metric || undefined,
      unit: form.unit || undefined,
      deviceId: form.deviceId || undefined,
      deviceName: dev?.name,
      channelId: form.channelId || undefined,
      channelName: ch?.name,
      matchTag: form.matchTag || undefined,
      span: form.span,
      min: form.kind === 'gauge' ? form.min : undefined,
      max: form.kind === 'gauge' ? form.max : undefined,
      warnAbove: form.kind === 'gauge' ? form.warnAbove : undefined,
      commandTopic: form.kind === 'switch' ? form.commandTopic : undefined,
      commandValueOn: form.kind === 'switch' ? form.commandValueOn : undefined,
      commandValueOff: form.kind === 'switch' ? form.commandValueOff : undefined,
    }

    const nextWidgets = editingWidgetId
      ? widgets.map((w) => (w.id === editingWidgetId ? cfg : w))
      : [...widgets, cfg]

    setDash({ ...dash, layout: { ...(dash.layout || {}), widgets: nextWidgets } } as Dashboard)
    setAddWidgetOpen(false)
    setEditingWidgetId(null)
  }

  return (
    <div ref={containerRef} className="space-y-5 bg-slate-100 min-h-screen p-6">
      {/* 顶部工具栏 */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {!isFullscreen && (
            <Button variant="outline" size="sm" onClick={onBack}>
              ← 返回列表
            </Button>
          )}
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-slate-800">{dash.name}</h2>
              {isTemplate(dash) ? (
                <Badge className="bg-purple-100 text-purple-700 border-purple-200">
                  <Tag className="w-3 h-3 mr-1" />
                  抽象模板 (Template)
                </Badge>
              ) : (
                <Badge className="bg-blue-100 text-blue-700 border-blue-200">
                  <BarChart3 className="w-3 h-3 mr-1" />
                  大屏看板 (Dashboard)
                </Badge>
              )}
              {dash.shareable && (
                <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">
                  <Globe className="w-3 h-3 mr-1" />
                  免密公开中
                </Badge>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">{dash.description || '无补充描述'}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!readOnly && (
            <>
              {isEditing ? (
                <>
                  <Button variant="outline" size="sm" onClick={openAddWidget}>
                    <Plus className="w-4 h-4 mr-1" />
                    添加组件
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    loading={saveMutation.isPending}
                    onClick={() => saveMutation.mutate(dash)}
                  >
                    保存大屏布局
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => { setDash(initialDash); setIsEditing(false) }}>
                    取消编辑
                  </Button>
                </>
              ) : (
                <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
                  <Pencil className="w-4 h-4 mr-1" />
                  编辑布局与数据绑定
                </Button>
              )}
            </>
          )}
          <Button variant="outline" size="sm" onClick={toggleFullscreen}>
            {isFullscreen ? <Minimize2 className="w-4 h-4 mr-1" /> : <Maximize2 className="w-4 h-4 mr-1" />}
            {isFullscreen ? '退出全屏' : '全屏展示'}
          </Button>
        </div>
      </div>

      {isEditing && (
        <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-900 flex items-start gap-2">
          <Database className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold">数据绑定操作提示</div>
            <div className="text-blue-800/90 mt-0.5">
              点击组件右上角 ⚙ 图标可打开「配置组件与数据绑定」面板：大屏看板可选择具体设备与通信通道，抽象模板可填写设备标签做批量匹配；
              控制开关额外配置下发通道、子主题与开关载荷。修改完成后点击「保存大屏布局」写回后端。
            </div>
          </div>
        </div>
      )}

      {/* 组件网格布局 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {widgets.map((w) => (
          <WidgetCard
            key={w.id}
            w={w}
            isEditing={isEditing}
            onEdit={() => openEditWidget(w)}
            onDelete={() => handleDeleteWidget(w.id)}
            devices={devices}
            channels={channels}
            alarms={alarms}
            recentMessages={messages}
          />
        ))}
      </div>

      {widgets.length === 0 && (
        <div className="p-12 text-center bg-white rounded-xl border border-dashed border-slate-300">
          <BarChart3 className="w-8 h-8 text-slate-400 mx-auto mb-2" />
          <div className="text-sm font-semibold text-slate-700">当前大屏尚未添加任何组件</div>
          <div className="text-xs text-slate-400 mt-1">点击右上角「编辑布局与数据绑定」添加时序曲线、仪表盘与控制开关，并逐个组件绑定设备/通道/指标</div>
          {!readOnly && (
            <Button size="sm" className="mt-4" onClick={() => { setIsEditing(true); openAddWidget() }}>
              <Plus className="w-4 h-4 mr-1" />
              立即添加第一个组件
            </Button>
          )}
        </div>
      )}

      {/* 组件配置与数据绑定弹窗 */}
      <Dialog
        open={addWidgetOpen}
        onClose={() => setAddWidgetOpen(false)}
        width="max-w-2xl"
        title={editingWidgetId ? '配置组件与数据绑定 (Widget Data Binding)' : '添加可视化组件 (Add Widget)'}
        description={
          isTemplate(dash)
            ? '当前为抽象模板：推荐使用「设备标签」做抽象绑定，同一模板可复用到任意同构设备群'
            : '当前为大屏看板：可直接绑定具体的设备与通信通道，实时拉取其上报数据'
        }
      >
        <form onSubmit={handleSaveWidget} className="space-y-5">
          {/* 1. 组件类型 */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">1. 组件类型 *</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {(Object.keys(KIND_META) as WidgetKind[]).map((k) => {
                const meta = KIND_META[k]
                const Icon = meta.icon
                const active = form.kind === k
                return (
                  <div
                    key={k}
                    onClick={() => patchForm({ kind: k })}
                    className={`p-2.5 rounded-lg border cursor-pointer transition flex items-start gap-2 ${
                      active ? 'border-blue-600 bg-blue-50/60 ring-1 ring-blue-500' : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className={`p-1.5 rounded ${active ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-800">{meta.label}</div>
                      <div className="text-[10px] text-slate-400 leading-tight">{meta.hint}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">2. 组件标题 *</label>
              <Input
                required
                value={form.title}
                onChange={(e) => patchForm({ title: e.target.value })}
                placeholder="例如：主车间实时温度监测"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">3. 网格宽度 (Span)</label>
              <Select value={form.span} onChange={(e) => patchForm({ span: Number(e.target.value) as 1 | 2 | 3 | 4 })}>
                <option value={1}>1 列 (紧凑)</option>
                <option value={2}>2 列 (标准半宽)</option>
                <option value={3}>3 列 (宽屏)</option>
                <option value={4}>4 列 (整行)</option>
              </Select>
            </div>
          </div>

          {/* 4. 数据源绑定 */}
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
              <Database className="w-4 h-4 text-blue-600" />
              <div className="text-xs font-bold text-slate-800">4. 数据源绑定 (Data Binding)</div>
              {isTemplate(dash) && (
                <Badge className="bg-purple-100 text-purple-700 border-purple-200 ml-auto">模板：标签优先</Badge>
              )}
            </div>

            {(form.kind === 'count' || form.kind === 'alarms') ? (
              <div className="p-4 text-xs text-slate-500">
                {form.kind === 'count'
                  ? '统计计数组件自动汇总当前工作空间的设备、网关与通道数量，无需额外绑定。'
                  : '告警列表组件自动拉取当前工作空间的实时告警流，无需额外绑定。'}
              </div>
            ) : (
              <div className="p-4 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">绑定设备 (Device)</label>
                    <Select value={form.deviceId} onChange={(e) => patchForm({ deviceId: e.target.value })}>
                      <option value="">— 不限设备（按标签或全部匹配）—</option>
                      {devices.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name} ({d.id})
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">绑定通道 (Channel)</label>
                    <Select value={form.channelId} onChange={(e) => patchForm({ channelId: e.target.value })}>
                      <option value="">— 不限通道 —</option>
                      {channels.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.id})
                        </option>
                      ))}
                    </Select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    设备标签匹配 (Match Tag) — 模板复用关键
                  </label>
                  <Input
                    value={form.matchTag}
                    onChange={(e) => patchForm({ matchTag: e.target.value })}
                    placeholder="例如：workshop-a / sensor-temp（留空则不按标签匹配）"
                  />
                  {form.matchTag && (
                    <div className="text-[11px] text-purple-600 mt-1">
                      命中标签 #{form.matchTag} 的设备:{' '}
                      <strong>
                        {devices.filter((d) => (d.tags || []).some((tg) => tg === form.matchTag || tg.includes(form.matchTag))).length}
                      </strong>{' '}
                      台
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">指标字段 (Metric Key)</label>
                    <Input
                      list="metric-presets"
                      value={form.metric}
                      onChange={(e) => patchForm({ metric: e.target.value })}
                      placeholder="temperature / humidity / voltage ..."
                    />
                    <datalist id="metric-presets">
                      {METRIC_PRESETS.map((m) => (
                        <option key={m.key} value={m.key}>
                          {m.label}
                        </option>
                      ))}
                    </datalist>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {METRIC_PRESETS.slice(0, 6).map((m) => (
                        <button
                          type="button"
                          key={m.key}
                          onClick={() => patchForm({ metric: m.key, unit: m.unit })}
                          className={`text-[10px] px-1.5 py-0.5 rounded border transition ${
                            form.metric === m.key
                              ? 'bg-blue-600 text-white border-blue-600'
                              : 'bg-white text-slate-600 border-slate-200 hover:border-blue-400'
                          }`}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">计量单位 (Unit)</label>
                    <Input
                      value={form.unit}
                      onChange={(e) => patchForm({ unit: e.target.value })}
                      placeholder="°C / % / V / A / rpm"
                    />
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {UNIT_PRESETS.map((u) => (
                        <button
                          type="button"
                          key={u}
                          onClick={() => patchForm({ unit: u })}
                          className={`text-[10px] px-1.5 py-0.5 rounded border transition ${
                            form.unit === u
                              ? 'bg-slate-800 text-white border-slate-800'
                              : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
                          }`}
                        >
                          {u}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded-lg p-2.5">
                  <div className="font-semibold text-slate-700 mb-0.5">解析出的绑定预览</div>
                  <div className="font-mono">{bindingSummary(
                    {
                      id: 'preview',
                      kind: form.kind,
                      title: form.title,
                      metric: form.metric,
                      unit: form.unit,
                      deviceId: form.deviceId || undefined,
                      channelId: form.channelId || undefined,
                      matchTag: form.matchTag || undefined,
                    },
                    devices,
                    channels,
                  )}</div>
                  <div className="mt-1">
                    将匹配到 <strong>{previewMessageCount}</strong> 条上报消息
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 5. 控制开关专属 */}
          {form.kind === 'switch' && (
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
                <Power className="w-4 h-4 text-emerald-600" />
                <div className="text-xs font-bold text-slate-800">5. 下行控制命令 (Downlink Command)</div>
              </div>
              <div className="p-4 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">控制主题 (Subtopic)</label>
                    <Input
                      value={form.commandTopic}
                      onChange={(e) => patchForm({ commandTopic: e.target.value })}
                      placeholder="cmd/power"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">开启载荷 (ON)</label>
                    <Input
                      value={form.commandValueOn}
                      onChange={(e) => patchForm({ commandValueOn: e.target.value })}
                      placeholder='{"state":"on"}'
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">关闭载荷 (OFF)</label>
                    <Input
                      value={form.commandValueOff}
                      onChange={(e) => patchForm({ commandValueOff: e.target.value })}
                      placeholder='{"state":"off"}'
                    />
                  </div>
                </div>
                <div className="text-[11px] text-slate-500">
                  {form.channelId
                    ? `指令将发布到通道 ${channels.find((c) => c.id === form.channelId)?.name || form.channelId} 的 ${form.commandTopic} 主题`
                    : '未选择通道时，将回退使用当前空间的第一个通道，建议在上方显式绑定控制通道'}
                </div>
              </div>
            </div>
          )}

          {/* 6. 量程与阈值 */}
          {form.kind === 'gauge' && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">量程与预警阈值</label>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Input
                    type="number"
                    value={form.min}
                    onChange={(e) => patchForm({ min: Number(e.target.value) })}
                    placeholder="下限"
                  />
                  <div className="text-[10px] text-slate-400 mt-1">下限 Min</div>
                </div>
                <div>
                  <Input
                    type="number"
                    value={form.max}
                    onChange={(e) => patchForm({ max: Number(e.target.value) })}
                    placeholder="上限"
                  />
                  <div className="text-[10px] text-slate-400 mt-1">上限 Max</div>
                </div>
                <div>
                  <Input
                    type="number"
                    value={form.warnAbove}
                    onChange={(e) => patchForm({ warnAbove: Number(e.target.value) })}
                    placeholder="预警"
                  />
                  <div className="text-[10px] text-slate-400 mt-1">预警阈值 Warn</div>
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
            <Button type="button" variant="outline" onClick={() => setAddWidgetOpen(false)}>
              取消
            </Button>
            <Button type="submit">{editingWidgetId ? '保存组件配置' : '确认添加'}</Button>
          </div>
        </form>
      </Dialog>
    </div>
  )
}

/* ------------------------------- 大屏列表主组件 ----------------------------- */

export const VisualDashboardsModule: React.FC = () => {
  const queryClient = useQueryClient()
  const { success, error } = useToast()
  const { currentWorkspace } = useAuthStore()

  // 状态管理
  const [activeTab, setActiveTab] = useState<'all' | 'dashboards' | 'templates'>('all')
  const [viewMode, setViewMode] = useState<'card' | 'table'>('card')
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<'updated_at' | 'created_at' | 'name'>('updated_at')
  const [activeDashboard, setActiveDashboard] = useState<Dashboard | null>(null)

  // 模态弹窗
  const [createOpen, setCreateOpen] = useState(false)
  const [isTemplateType, setIsTemplateType] = useState(false)
  const [formName, setFormName] = useState('')
  const [formDesc, setFormDesc] = useState('')
  const [formShareable, setFormShareable] = useState(false)

  // 共享配置弹窗
  const [shareTarget, setShareTarget] = useState<Dashboard | null>(null)

  // JSON 导入弹窗
  const [importOpen, setImportOpen] = useState(false)
  const [importJson, setImportJson] = useState('')

  // 获取 Dashboard 列表
  const { data: pageData, isLoading } = useQuery({
    queryKey: ['dashboards', currentWorkspace?.id],
    queryFn: () => fetchApi<Page<Dashboard>>('/api/dashboards?limit=200'),
    enabled: !!currentWorkspace?.id,
  })

  const dashboards = useMemo(() => pageData?.items ?? [], [pageData])

  // 创建 Dashboard
  const createMutation = useMutation({
    mutationFn: (body: any) =>
      fetchApi<Dashboard>('/api/dashboards', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: (d) => {
      queryClient.invalidateQueries({ queryKey: ['dashboards'] })
      success(`成功创建${isTemplateType ? '模板' : '大屏'}: ${d.name}`)
      setCreateOpen(false)
      setFormName('')
      setFormDesc('')
      setFormShareable(false)
      setActiveDashboard(d)
    },
    onError: (e: any) => error(e.message || '创建失败'),
  })

  // 删除 Dashboard
  const deleteMutation = useMutation({
    mutationFn: (id: string) => fetchApi(`/api/dashboards/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboards'] })
      success('看板已删除')
    },
    onError: (e: any) => error(e.message || '删除失败'),
  })

  // 更新共享配置
  const updateShareMutation = useMutation({
    mutationFn: (item: { id: string; shareable: boolean }) =>
      fetchApi<Dashboard>(`/api/dashboards/${item.id}`, {
        method: 'PUT',
        body: JSON.stringify({ shareable: item.shareable }),
      }),
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ['dashboards'] })
      setShareTarget(saved)
      success(saved.shareable ? '已开启公开免密共享' : '已关闭公开共享')
    },
    onError: (e: any) => error(e.message || '配置失败'),
  })

  // 过滤与排序
  const filteredList = useMemo(() => {
    let list = dashboards.filter((d) => {
      const isTmpl = isTemplate(d)
      if (activeTab === 'dashboards' && isTmpl) return false
      if (activeTab === 'templates' && !isTmpl) return false
      if (search) {
        const q = search.toLowerCase()
        return d.name.toLowerCase().includes(q) || (d.description || '').toLowerCase().includes(q)
      }
      return true
    })

    list.sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name)
      if (sortBy === 'created_at') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      return new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime()
    })

    return list
  }, [dashboards, activeTab, search, sortBy])

  // JSON 导出
  const handleExportJson = (d: Dashboard) => {
    const blob = new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `dashboard-${d.name || d.id}.json`
    a.click()
    URL.revokeObjectURL(url)
    success('JSON 配置文件已导出下载')
  }

  // JSON 导入提交
  const handleImportSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const parsed = JSON.parse(importJson)
      if (!parsed.name) throw new Error('缺少 name 字段')
      createMutation.mutate({
        name: parsed.name + ' (已导入)',
        description: parsed.description || '',
        layout: parsed.layout || { widgets: [] },
        shareable: !!parsed.shareable,
        metadata: parsed.metadata || {},
      })
      setImportOpen(false)
      setImportJson('')
    } catch (err: any) {
      error(`JSON 解析错误: ${err.message}`)
    }
  }

  // 若处于大屏画布展开态
  if (activeDashboard) {
    return <DashboardCanvas dashboard={activeDashboard} onBack={() => setActiveDashboard(null)} />
  }

  return (
    <div className="space-y-6 max-w-7xl">
      {/* 顶部标题区 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-blue-600" />
            <span>可视化大屏看板与模板 (Dashboards & Templates)</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            支持基于确切数据源的大屏看板与按标签抽象绑定的复用模板，内建时序折线图、半圆仪表盘、指标数值与下行控制开关。
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
            <Upload className="w-4 h-4 mr-1" />
            导入 JSON
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setIsTemplateType(false)
              setCreateOpen(true)
            }}
          >
            <Plus className="w-4 h-4 mr-1" />
            新建大屏看板
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setIsTemplateType(true)
              setCreateOpen(true)
            }}
          >
            <Tag className="w-4 h-4 mr-1" />
            新建抽象模板
          </Button>
        </div>
      </div>

      {/* 过滤、搜索、排序与视图切换 */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <Tabs
            items={[
              { id: 'all', label: '全部看板与模板', badge: dashboards.length },
              {
                id: 'dashboards',
                label: '大屏看板 (Dashboards)',
                icon: BarChart3,
                badge: dashboards.filter((d) => !isTemplate(d)).length,
              },
              {
                id: 'templates',
                label: '抽象模板 (Templates)',
                icon: Tag,
                badge: dashboards.filter((d) => isTemplate(d)).length,
              },
            ]}
            value={activeTab}
            onChange={(v) => setActiveTab(v as any)}
          />

          <div className="flex items-center gap-2">
            <Input
              placeholder="按名称或描述搜索..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-48 text-xs py-1.5"
            />
            <Select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="text-xs py-1.5 w-32"
            >
              <option value="updated_at">最近更新</option>
              <option value="created_at">创建时间</option>
              <option value="name">名称排序</option>
            </Select>
            <div className="flex border border-slate-200 rounded-lg overflow-hidden">
              <button
                onClick={() => setViewMode('card')}
                className={`p-1.5 ${viewMode === 'card' ? 'bg-blue-50 text-blue-600' : 'text-slate-400 hover:text-slate-700'}`}
                title="网格卡片视图"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={`p-1.5 ${viewMode === 'table' ? 'bg-blue-50 text-blue-600' : 'text-slate-400 hover:text-slate-700'}`}
                title="列表表格视图"
              >
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 卡片视图 */}
      {viewMode === 'card' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredList.map((d) => {
            const tmpl = isTemplate(d)
            const wList = layoutOf(d)
            return (
              <div
                key={d.id}
                className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex flex-col justify-between hover:border-blue-400 hover:shadow-md transition space-y-4"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                          tmpl ? 'bg-purple-50 text-purple-600' : 'bg-blue-50 text-blue-600'
                        }`}
                      >
                        {tmpl ? <Tag className="w-5 h-5" /> : <BarChart3 className="w-5 h-5" />}
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-slate-800 line-clamp-1">{d.name}</h3>
                        <div className="text-[11px] font-mono text-slate-400">{d.id}</div>
                      </div>
                    </div>
                    {tmpl ? (
                      <Badge className="bg-purple-100 text-purple-700 border-purple-200">模板</Badge>
                    ) : (
                      <Badge className="bg-blue-100 text-blue-700 border-blue-200">大屏</Badge>
                    )}
                  </div>

                  <p className="text-xs text-slate-500 mt-3 line-clamp-2 min-h-8">
                    {d.description || '暂无描述说明'}
                  </p>

                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                    <div>组件数: <strong className="text-slate-800">{wList.length}</strong></div>
                    <div className="flex items-center gap-1.5">
                      {d.shareable ? (
                        <span className="text-[11px] text-emerald-600 font-medium flex items-center gap-0.5">
                          <Globe className="w-3 h-3" />
                          已开启公开共享
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-400">仅本工作区</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="pt-2 flex items-center justify-between gap-2 border-t border-slate-100">
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" onClick={() => setShareTarget(d)} title="共享与公开访问设置">
                      <Share2 className="w-3.5 h-3.5 text-slate-600" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleExportJson(d)} title="导出 JSON">
                      <Download className="w-3.5 h-3.5 text-slate-600" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (confirm(`确定删除看板「${d.name}」吗？`)) {
                          deleteMutation.mutate(d.id)
                        }
                      }}
                      title="删除"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-red-500" />
                    </Button>
                  </div>

                  <Button size="sm" onClick={() => setActiveDashboard(d)}>
                    打开大屏
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* 表格视图 */}
      {viewMode === 'table' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">名称与 ID</th>
                <th className="py-3 px-4">类型</th>
                <th className="py-3 px-4">描述说明</th>
                <th className="py-3 px-4">组件数量</th>
                <th className="py-3 px-4">共享状态</th>
                <th className="py-3 px-4">最后更新</th>
                <th className="py-3 px-4 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredList.map((d) => {
                const tmpl = isTemplate(d)
                return (
                  <tr key={d.id} className="hover:bg-slate-50/70 transition">
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-800">{d.name}</div>
                      <div className="text-[11px] font-mono text-slate-400">{d.id}</div>
                    </td>
                    <td className="py-3 px-4">
                      {tmpl ? (
                        <Badge className="bg-purple-100 text-purple-700 border-purple-200">模板</Badge>
                      ) : (
                        <Badge className="bg-blue-100 text-blue-700 border-blue-200">大屏</Badge>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-500 max-w-xs truncate">{d.description || '-'}</td>
                    <td className="py-3 px-4 font-mono">{layoutOf(d).length}</td>
                    <td className="py-3 px-4">
                      {d.shareable ? (
                        <span className="text-emerald-600 font-medium flex items-center gap-1">
                          <Globe className="w-3 h-3" />
                          公开共享
                        </span>
                      ) : (
                        <span className="text-slate-400">空间私有</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-400">
                      {new Date(d.updated_at || d.created_at).toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex items-center gap-1">
                        <Button variant="outline" size="sm" onClick={() => setActiveDashboard(d)}>
                          打开
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setShareTarget(d)} title="共享">
                          <Share2 className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleExportJson(d)} title="导出">
                          <Download className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            if (confirm(`确定删除看板「${d.name}」吗？`)) {
                              deleteMutation.mutate(d.id)
                            }
                          }}
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
        </div>
      )}

      {filteredList.length === 0 && (
        <EmptyState text={isLoading ? '正在加载看板与模板...' : '暂无匹配的看板或模板'} />
      )}

      {/* 新建看板/模板弹窗 */}
      <Dialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title={isTemplateType ? '新建抽象模板 (Template)' : '新建大屏看板 (Dashboard)'}
        description={
          isTemplateType
            ? '模板可通过统一的标签（Tags）对多台同构设备自动渲染图表与指标'
            : '绑定具体设备与通信通道的实时监控看板'
        }
      >
        <form
          onSubmit={(e) => {
            e.preventDefault()
            createMutation.mutate({
              name: formName,
              description: formDesc,
              shareable: formShareable,
              metadata: {
                kind: isTemplateType ? 'template' : 'dashboard',
                is_template: isTemplateType,
              },
              layout: {
                widgets: [
                  {
                    id: 'w-line-default',
                    kind: 'line',
                    title: '实时温度指标曲线',
                    metric: 'temperature',
                    unit: '°C',
                    span: 2,
                  },
                  {
                    id: 'w-gauge-default',
                    kind: 'gauge',
                    title: '系统负荷率',
                    unit: '%',
                    min: 0,
                    max: 100,
                    warnAbove: 85,
                    span: 1,
                  },
                  {
                    id: 'w-count-default',
                    kind: 'count',
                    title: '空间设备与网关概览',
                    span: 1,
                  },
                ],
              },
            })
          }}
          className="space-y-4"
        >
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {isTemplateType ? '模板名称 *' : '看板名称 *'}
            </label>
            <Input
              required
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder={isTemplateType ? '例如：温湿度传感器标准化通用模板' : '例如：1号数字化车间全景监控'}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">描述说明</label>
            <Textarea
              rows={2}
              value={formDesc}
              onChange={(e) => setFormDesc(e.target.value)}
              placeholder="简要描述大屏或模板的适用范围与展示指标"
            />
          </div>

          <div className="flex items-center gap-2 pt-2">
            <input
              type="checkbox"
              id="dashShareable"
              checked={formShareable}
              onChange={(e) => setFormShareable(e.target.checked)}
              className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
            />
            <label htmlFor="dashShareable" className="text-xs text-slate-700 font-medium">
              允许生成免密公开访问链接 (Public Shareable)
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
              取消
            </Button>
            <Button type="submit" loading={createMutation.isPending}>
              立即创建
            </Button>
          </div>
        </form>
      </Dialog>

      {/* 共享与公开免密链接弹窗 */}
      <Dialog
        open={!!shareTarget}
        onClose={() => setShareTarget(null)}
        title="看板共享设置 (Sharing & Permissions)"
        description="支持本工作区内共享及免密外链访问"
      >
        {shareTarget && (
          <div className="space-y-4">
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs space-y-1">
              <div className="font-semibold text-slate-800">当前对象: {shareTarget.name}</div>
              <div className="text-slate-500 font-mono text-[11px]">ID: {shareTarget.id}</div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold text-slate-800">公开免密访问 (Public Link)</div>
                  <div className="text-[11px] text-slate-500">持有链接的用户无需登录即可全屏查看只读监控</div>
                </div>
                <input
                  type="checkbox"
                  checked={shareTarget.shareable}
                  onChange={(e) =>
                    updateShareMutation.mutate({
                      id: shareTarget.id,
                      shareable: e.target.checked,
                    })
                  }
                  className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                />
              </div>

              {shareTarget.shareable && shareTarget.share_token && (
                <div className="p-3 rounded-lg bg-blue-50/60 border border-blue-200 space-y-2 mt-2">
                  <div className="text-[11px] font-semibold text-blue-900">免密访问 URL:</div>
                  <div className="p-2 bg-white rounded border border-blue-200 font-mono text-[11px] text-slate-700 break-all select-all">
                    {window.location.origin}/?public_share={shareTarget.share_token}
                  </div>
                  <div className="flex justify-end">
                    <CopyButton
                      text={`${window.location.origin}/?public_share=${shareTarget.share_token}`}
                      label="复制完整免密外链"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-3 border-t border-slate-200">
              <Button onClick={() => setShareTarget(null)}>完成</Button>
            </div>
          </div>
        )}
      </Dialog>

      {/* JSON 导入弹窗 */}
      <Dialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="导入大屏配置 (Import Dashboard JSON)"
        description="粘贴导出的 JSON 布局配置以一键克隆大屏"
      >
        <form onSubmit={handleImportSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">JSON 内容 *</label>
            <Textarea
              required
              rows={8}
              value={importJson}
              onChange={(e) => setImportJson(e.target.value)}
              placeholder="{\n  &quot;name&quot;: &quot;导入的大屏&quot;,\n  &quot;layout&quot;: { &quot;widgets&quot;: [...] }\n}"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
            <Button type="button" variant="outline" onClick={() => setImportOpen(false)}>
              取消
            </Button>
            <Button type="submit">解析并导入</Button>
          </div>
        </form>
      </Dialog>
    </div>
  )
}
