import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchApi } from '../lib/api'
import { useAuthStore } from '../store/authStore'
import type { Device, Channel, Alarm, Page } from '../types'
import {
  Cpu,
  Radio,
  BellRing,
  Activity,
  Server,
  ArrowUpRight,
} from 'lucide-react'

export const DashboardsModule: React.FC<{ onNavigate: (tab: string) => void }> = ({ onNavigate }) => {
  const { currentWorkspace } = useAuthStore()

  const { data: devData } = useQuery({
    queryKey: ['devices', currentWorkspace?.id],
    queryFn: () => fetchApi<Page<Device>>('/api/devices?limit=500'),
    enabled: !!currentWorkspace?.id,
  })

  const { data: chanData } = useQuery({
    queryKey: ['channels', currentWorkspace?.id],
    queryFn: () => fetchApi<Page<Channel>>('/api/channels?limit=500'),
    enabled: !!currentWorkspace?.id,
  })

  const { data: alarmData } = useQuery({
    queryKey: ['alarms', currentWorkspace?.id],
    queryFn: () => fetchApi<Page<Alarm>>('/api/alarms?limit=500'),
    enabled: !!currentWorkspace?.id,
  })

  const devices = devData?.items ?? []
  const channels = chanData?.items ?? []
  const alarms = alarmData?.items ?? []

  const gateways = devices.filter((d) => d.is_gateway)
  const activeAlarms = alarms.filter((a) => a.status === 'active')

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Welcome Banner */}
      <div className="p-6 bg-gradient-to-r from-blue-900 via-slate-900 to-indigo-950 rounded-2xl text-white shadow-md flex items-center justify-between">
        <div>
          <span className="text-xs bg-blue-500/20 text-blue-300 font-mono px-2 py-0.5 rounded border border-blue-500/30">
            多租户完全隔离模式 (Casbin RBAC)
          </span>
          <h2 className="text-2xl font-bold mt-2">
            欢迎使用 Magistrala 物联网管理平台
          </h2>
          <p className="text-xs text-slate-300 mt-1 max-w-xl">
            当前处于工作空间: <span className="text-blue-300 font-semibold">{currentWorkspace?.name}</span> ({currentWorkspace?.alias || currentWorkspace?.id})，
            底层运行单文件独立二进制并无缝对接外部 PostgreSQL 与 FluxMQ 消息中心。
          </p>
        </div>
        <div className="hidden lg:flex items-center gap-3">
          <div className="text-right">
            <div className="text-xs text-slate-400">系统运行状态</div>
            <div className="text-sm font-semibold text-emerald-400 flex items-center gap-1.5 justify-end">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>所有服务正常运行</span>
            </div>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div
          onClick={() => onNavigate('devices')}
          className="p-5 bg-white rounded-xl border border-slate-200 shadow-sm hover:border-blue-400 cursor-pointer transition space-y-2 group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">直连与网关设备</span>
            <Cpu className="w-5 h-5 text-blue-600 group-hover:scale-110 transition" />
          </div>
          <div className="text-3xl font-extrabold text-slate-800">{devices.length}</div>
          <div className="text-xs text-slate-500 flex items-center justify-between pt-1 border-t border-slate-100">
            <span>其中网关: <strong className="text-indigo-600">{gateways.length}</strong></span>
            <span className="text-blue-600 flex items-center text-[11px] font-medium">进入设备 <ArrowUpRight className="w-3 h-3" /></span>
          </div>
        </div>

        <div
          onClick={() => onNavigate('channels')}
          className="p-5 bg-white rounded-xl border border-slate-200 shadow-sm hover:border-blue-400 cursor-pointer transition space-y-2 group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">通信通道 (Channels)</span>
            <Radio className="w-5 h-5 text-indigo-600 group-hover:scale-110 transition" />
          </div>
          <div className="text-3xl font-extrabold text-slate-800">{channels.length}</div>
          <div className="text-xs text-slate-500 flex items-center justify-between pt-1 border-t border-slate-100">
            <span>MQTT 管道正常</span>
            <span className="text-blue-600 flex items-center text-[11px] font-medium">查看通道 <ArrowUpRight className="w-3 h-3" /></span>
          </div>
        </div>

        <div
          onClick={() => onNavigate('alarms')}
          className="p-5 bg-white rounded-xl border border-slate-200 shadow-sm hover:border-red-400 cursor-pointer transition space-y-2 group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">未处理告警</span>
            <BellRing className="w-5 h-5 text-red-500 group-hover:scale-110 transition" />
          </div>
          <div className="text-3xl font-extrabold text-red-600">{activeAlarms.length}</div>
          <div className="text-xs text-slate-500 flex items-center justify-between pt-1 border-t border-slate-100">
            <span>待响应处置</span>
            <span className="text-red-600 flex items-center text-[11px] font-medium">立即处置 <ArrowUpRight className="w-3 h-3" /></span>
          </div>
        </div>

        <div
          onClick={() => onNavigate('brokerHub')}
          className="p-5 bg-white rounded-xl border border-slate-200 shadow-sm hover:border-emerald-400 cursor-pointer transition space-y-2 group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">FluxMQ 代理集成</span>
            <Server className="w-5 h-5 text-emerald-600 group-hover:scale-110 transition" />
          </div>
          <div className="text-2xl font-extrabold text-emerald-600">在线活跃</div>
          <div className="text-xs text-slate-500 flex items-center justify-between pt-1 border-t border-slate-100">
            <span>Webhook 鉴权运行中</span>
            <span className="text-emerald-600 flex items-center text-[11px] font-medium">集成指南 <ArrowUpRight className="w-3 h-3" /></span>
          </div>
        </div>
      </div>

      {/* Quick Launch & Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
          <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
            <Activity className="w-4 h-4 text-blue-600" />
            <span>最近活动与活跃设备</span>
          </h3>

          <div className="divide-y divide-slate-100">
            {devices.slice(0, 5).map((d) => (
              <div key={d.id} className="py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                    <Cpu className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-slate-800">{d.name}</div>
                    <div className="text-[11px] font-mono text-slate-400">{d.id}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="inline-flex px-2 py-0.5 rounded text-[11px] bg-emerald-100 text-emerald-800">在线</span>
                  <button onClick={() => onNavigate('devices')} className="text-blue-600 hover:underline">
                    查看详情
                  </button>
                </div>
              </div>
            ))}
            {devices.length === 0 && (
              <div className="p-8 text-center text-xs text-slate-400">暂无设备，前往「设备管理」创建第一台设备</div>
            )}
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
          <h3 className="text-base font-bold text-slate-800">快捷操作</h3>
          <div className="space-y-2">
            <button
              onClick={() => onNavigate('devices')}
              className="w-full text-left p-3 rounded-lg border border-slate-200 hover:border-blue-500 hover:bg-blue-50/50 transition flex items-center justify-between"
            >
              <div>
                <div className="text-xs font-semibold text-slate-800">注册新设备</div>
                <div className="text-[11px] text-slate-500">生成通讯凭证与连接密匙</div>
              </div>
              <ArrowUpRight className="w-4 h-4 text-slate-400" />
            </button>

            <button
              onClick={() => onNavigate('channels')}
              className="w-full text-left p-3 rounded-lg border border-slate-200 hover:border-blue-500 hover:bg-blue-50/50 transition flex items-center justify-between"
            >
              <div>
                <div className="text-xs font-semibold text-slate-800">打开消息测试台 (Simulator)</div>
                <div className="text-[11px] text-slate-500">模拟上报并查看实时消息流</div>
              </div>
              <ArrowUpRight className="w-4 h-4 text-slate-400" />
            </button>

            <button
              onClick={() => onNavigate('gateways')}
              className="w-full text-left p-3 rounded-lg border border-slate-200 hover:border-blue-500 hover:bg-blue-50/50 transition flex items-center justify-between"
            >
              <div>
                <div className="text-xs font-semibold text-slate-800">边缘网关与子设备管理</div>
                <div className="text-[11px] text-slate-500">挂载现场子设备至边缘节点</div>
              </div>
              <ArrowUpRight className="w-4 h-4 text-slate-400" />
            </button>

            <button
              onClick={() => onNavigate('brokerHub')}
              className="w-full text-left p-3 rounded-lg border border-slate-200 hover:border-blue-500 hover:bg-blue-50/50 transition flex items-center justify-between"
            >
              <div>
                <div className="text-xs font-semibold text-slate-800">获取 FluxMQ 接入命令与配置</div>
                <div className="text-[11px] text-slate-500">快速复制 mosquitto_pub/sub 命令</div>
              </div>
              <ArrowUpRight className="w-4 h-4 text-slate-400" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
