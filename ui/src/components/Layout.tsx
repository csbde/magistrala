import React, { useState } from 'react'
import { useAuthStore } from '../store/authStore'
import { dict } from '../lib/i18n'
import {
  Layers,
  LayoutDashboard,
  Building2,
  Cpu,
  Radio,
  FolderGit2,
  Workflow,
  BellRing,
  Settings2,
  Users,
  Key,
  Server,
  LogOut,
  Languages,
  ShieldCheck,
  ChevronDown,
} from 'lucide-react'

interface LayoutProps {
  currentTab: string
  setCurrentTab: (tab: string) => void
  children: React.ReactNode
}

export const Layout: React.FC<LayoutProps> = ({ currentTab, setCurrentTab, children }) => {
  const { user, currentWorkspace, workspaces, setCurrentWorkspace, logout, language, setLanguage } = useAuthStore()
  const t = dict[language]
  const [switching, setSwitching] = useState(false)

  const navSections = [
    {
      title: '概览',
      items: [
        { id: 'dashboard', label: t.dashboard, icon: LayoutDashboard },
        { id: 'workspaces', label: t.workspaces, icon: Building2 },
      ],
    },
    {
      title: '物联设备与拓扑',
      items: [
        { id: 'devices', label: t.devices, icon: Cpu },
        { id: 'gateways', label: t.gateways, icon: Server },
        { id: 'channels', label: t.channels, icon: Radio },
        { id: 'groups', label: t.groups, icon: FolderGit2 },
      ],
    },
    {
      title: '数据与规则',
      items: [
        { id: 'rules', label: t.rules, icon: Workflow },
        { id: 'alarms', label: t.alarms, icon: BellRing },
        { id: 'bootstraps', label: t.bootstraps, icon: Settings2 },
      ],
    },
    {
      title: '权限与接入',
      items: [
        { id: 'users', label: t.users, icon: Users },
        { id: 'pats', label: t.pats, icon: Key },
        { id: 'brokerHub', label: t.brokerHub, icon: Radio },
      ],
    },
  ]

  const activeItem = navSections.flatMap((s) => s.items).find((i) => i.id === currentTab)

  return (
    <div className="flex h-screen bg-slate-100 overflow-hidden font-sans">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col justify-between shrink-0 select-none">
        <div className="overflow-y-auto">
          {/* Logo */}
          <div className="h-16 flex items-center px-6 gap-3 border-b border-slate-800">
            <Layers className="w-6 h-6 text-blue-500" />
            <span className="font-bold text-lg text-white tracking-wide">Magistrala</span>
            <span className="text-[10px] bg-blue-500/20 text-blue-400 font-mono px-1.5 py-0.5 rounded border border-blue-500/30">
              v1.0
            </span>
          </div>

          {/* Current Workspace Switcher */}
          <div className="p-4 border-b border-slate-800/80 bg-slate-950/40">
            <div className="text-[11px] font-medium text-slate-400 mb-1.5 flex items-center justify-between">
              <span>{t.workspaces}</span>
              <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" />
                <span>Casbin 隔离</span>
              </span>
            </div>
            <div className="relative">
              <button
                onClick={() => setSwitching(!switching)}
                className="w-full text-left px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700/80 text-white text-xs font-medium flex items-center justify-between border border-slate-700 transition"
              >
                <span className="truncate">{currentWorkspace?.name || '选择工作空间'}</span>
                <ChevronDown className="w-3 h-3 text-slate-400 shrink-0" />
              </button>

              {switching && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-50 overflow-hidden py-1">
                  {workspaces.map((w) => (
                    <button
                      key={w.id}
                      onClick={() => {
                        setCurrentWorkspace(w)
                        setSwitching(false)
                      }}
                      className="w-full text-left px-3 py-1.5 text-xs text-slate-200 hover:bg-blue-600 hover:text-white truncate flex items-center justify-between"
                    >
                      <span className="truncate">{w.name}</span>
                      {w.id === currentWorkspace?.id && <span className="text-emerald-400 text-[10px]">● 当前</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Grouped Nav */}
          <nav className="p-3 space-y-4">
            {navSections.map((sec) => (
              <div key={sec.title} className="space-y-1">
                <div className="px-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  {sec.title}
                </div>
                {sec.items.map((item) => {
                  const Icon = item.icon
                  const active = currentTab === item.id
                  return (
                    <button
                      key={item.id}
                      onClick={() => setCurrentTab(item.id)}
                      className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                        active
                          ? 'bg-blue-600 text-white shadow-sm font-semibold'
                          : 'text-slate-400 hover:text-white hover:bg-slate-800'
                      }`}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </button>
                  )
                })}
              </div>
            ))}
          </nav>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 space-y-3 bg-slate-950/30">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setLanguage(language === 'zh' ? 'en' : 'zh')}
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 px-2.5 py-1 rounded-md border border-slate-700 transition"
            >
              <Languages className="w-3.5 h-3.5 text-blue-400" />
              <span>{language === 'zh' ? '中 / EN' : 'EN / 中'}</span>
            </button>

            <button
              onClick={logout}
              title={t.logout}
              className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1 p-1 rounded-md hover:bg-slate-800 transition"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-2 pt-2 border-t border-slate-800">
            <div className="w-7 h-7 rounded-full bg-blue-500/20 text-blue-400 font-bold text-xs flex items-center justify-center border border-blue-500/30">
              {user?.name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || 'U'}
            </div>
            <div className="truncate text-xs">
              <div className="text-slate-200 font-medium truncate">{user?.name || user?.email}</div>
              <div className="text-slate-400 text-[10px] truncate">{user?.email}</div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main View Area */}
      <main className="flex-1 overflow-y-auto flex flex-col">
        <header className="h-16 bg-white border-b border-slate-200 px-8 flex items-center justify-between shrink-0">
          <div>
            <h1 className="text-lg font-bold text-slate-800">
              {activeItem?.label || t.title}
            </h1>
            <p className="text-xs text-slate-500">
              当前租户: <span className="font-mono text-blue-600 font-semibold">{currentWorkspace?.name}</span> ({currentWorkspace?.id})
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs text-slate-600 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-lg">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span>PostgreSQL / FluxMQ 联通</span>
            </div>
          </div>
        </header>

        <div className="p-8 flex-1">{children}</div>
      </main>
    </div>
  )
}
