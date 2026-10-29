import React, { useState } from 'react'
import { useAuthStore } from '../store/authStore'
import { dict } from '../lib/i18n'
import {
  Layers,
  Cpu,
  Radio,
  FolderGit2,
  Workflow,
  Users,
  Key,
  LogOut,
  Building2,
  Languages,
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

  const navItems = [
    { id: 'workspaces', label: t.workspaces, icon: Building2 },
    { id: 'devices', label: t.devices, icon: Cpu },
    { id: 'channels', label: t.channels, icon: Radio },
    { id: 'groups', label: t.groups, icon: FolderGit2 },
    { id: 'rules', label: t.rules, icon: Workflow },
    { id: 'alarms', label: t.alarms, icon: Radio },
    { id: 'users', label: t.users, icon: Users },
    { id: 'pats', label: t.pats, icon: Key },
  ]

  return (
    <div className="flex h-screen bg-slate-100 overflow-hidden font-sans">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col justify-between shrink-0">
        <div>
          <div className="h-16 flex items-center px-6 gap-3 border-b border-slate-800">
            <Layers className="w-6 h-6 text-blue-500" />
            <span className="font-bold text-lg text-white tracking-wide">Magistrala</span>
            <span className="text-[10px] bg-blue-500/20 text-blue-400 font-mono px-1.5 py-0.5 rounded border border-blue-500/30">
              v1.0
            </span>
          </div>

          {/* Current Workspace Pill */}
          <div className="p-4 border-b border-slate-800/80 bg-slate-950/40">
            <div className="text-[11px] font-medium text-slate-400 mb-1 flex items-center justify-between">
              <span>{t.workspaces}</span>
              <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-1 rounded">Casbin 隔离</span>
            </div>
            <div className="relative">
              <button
                onClick={() => setSwitching(!switching)}
                className="w-full text-left px-2.5 py-1.5 rounded bg-slate-800 hover:bg-slate-700/80 text-white text-xs font-medium flex items-center justify-between border border-slate-700"
              >
                <span className="truncate">{currentWorkspace?.name || '选择工作空间'}</span>
                <span className="text-slate-400 text-[10px]">▼</span>
              </button>

              {switching && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-slate-800 border border-slate-700 rounded shadow-xl z-50 overflow-hidden py-1">
                  {workspaces.map((w) => (
                    <button
                      key={w.id}
                      onClick={() => {
                        setCurrentWorkspace(w)
                        setSwitching(false)
                      }}
                      className="w-full text-left px-3 py-1.5 text-xs text-slate-200 hover:bg-blue-600 hover:text-white truncate"
                    >
                      {w.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Nav Items */}
          <nav className="p-3 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon
              const active = currentTab === item.id
              return (
                <button
                  key={item.id}
                  onClick={() => setCurrentTab(item.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition ${
                    active
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </button>
              )
            })}
          </nav>
        </div>

        {/* Footer info & Logout */}
        <div className="p-4 border-t border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setLanguage(language === 'zh' ? 'en' : 'zh')}
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 px-2.5 py-1 rounded border border-slate-700 transition"
            >
              <Languages className="w-3.5 h-3.5 text-blue-400" />
              <span>{language === 'zh' ? '中 / EN' : 'EN / 中'}</span>
            </button>

            <button
              onClick={logout}
              title={t.logout}
              className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1 p-1 rounded hover:bg-slate-800"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-2 pt-2 border-t border-slate-800/80">
            <div className="w-7 h-7 rounded-full bg-blue-500/20 text-blue-400 font-bold text-xs flex items-center justify-center border border-blue-500/30">
              {user?.name?.[0]?.toUpperCase() || 'U'}
            </div>
            <div className="truncate text-xs">
              <div className="text-slate-200 font-medium truncate">{user?.name}</div>
              <div className="text-slate-400 text-[10px] truncate">{user?.email}</div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto">
        <header className="h-16 bg-white border-b border-slate-200 px-8 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-slate-800">
              {navItems.find((i) => i.id === currentTab)?.label || t.title}
            </h1>
            <p className="text-xs text-slate-500">
              当前租户空间: <span className="font-mono text-blue-600 font-semibold">{currentWorkspace?.name}</span> ({currentWorkspace?.id})
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-800">
              ● 在线
            </span>
          </div>
        </header>

        <div className="p-8">{children}</div>
      </main>
    </div>
  )
}
