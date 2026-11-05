import { CertsModule } from './pages/CertsModule'
import { SettingsModule } from './pages/SettingsModule'
import React, { useState, useEffect } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAuthStore } from './store/authStore'
import { Login } from './pages/Login'
import { Layout } from './components/Layout'
import { DashboardsModule } from './pages/DashboardsModule'
import { VisualDashboardsModule, DashboardCanvas } from './pages/VisualDashboardsModule'
import { DevicesModule } from './pages/DevicesModule'
import { GatewaysModule } from './pages/GatewaysModule'
import { ChannelsModule } from './pages/ChannelsModule'
import { AlarmsModule } from './pages/AlarmsModule'
import { BootstrapModule } from './pages/BootstrapModule'
import { BrokerHubModule } from './pages/BrokerHubModule'
import { UsersModule } from './pages/UsersModule'
import { WorkspacesModule } from './pages/WorkspacesModule'
import { MessagesModule } from './pages/MessagesModule'
import { RulesModule } from './pages/RulesModule'
import { CrudModule } from './pages/CrudModule'
import { ToastProvider } from './components/ui/Toast'
import { fetchApi } from './lib/api'
import type { Dashboard } from './types'
import { Loader2 } from 'lucide-react'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 5000,
    },
  },
})

export const AppContent: React.FC = () => {
  const { token, setToken, setAuth } = useAuthStore()
  const [currentTab, setCurrentTab] = useState('dashboard')

  // 支持免密公开大屏分享 (?public_share={token})
  const [publicShareToken, setPublicShareToken] = useState<string | null>(null)
  const [publicDashboard, setPublicDashboard] = useState<Dashboard | null>(null)
  const [publicLoading, setPublicLoading] = useState(false)
  const [publicError, setPublicError] = useState<string | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const shareParam = params.get('public_share')
    if (shareParam) {
      setPublicShareToken(shareParam)
      setPublicLoading(true)
      fetch(`/api/public/dashboards/${encodeURIComponent(shareParam)}`)
        .then(async (res) => {
          if (!res.ok) {
            throw new Error(`无法加载免密大屏 (HTTP ${res.status})，可能已被取消共享或链接已失效`)
          }
          return res.json()
        })
        .then((d) => setPublicDashboard(d))
        .catch((err) => setPublicError(err.message))
        .finally(() => setPublicLoading(false))
    }

    // Check URL query parameters for OIDC callback redirect (token & workspace_id)
    const urlToken = params.get('token')
    const urlWs = params.get('workspace_id')
    if (urlToken) {
      setToken(urlToken)
      window.history.replaceState({}, document.title, window.location.pathname)

      fetchApi('/api/auth/me')
        .then((res) => {
          setAuth(urlToken, res.user, urlWs || res.workspace_id, res.workspaces)
        })
        .catch(() => {
          // ignore
        })
    }
  }, [setToken, setAuth])

  // 免密公开大屏呈现模式
  if (publicShareToken) {
    if (publicLoading) {
      return (
        <div className="h-screen w-screen flex flex-col items-center justify-center bg-slate-900 text-white space-y-3">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
          <div className="text-sm">正在加载实时免密监控大屏...</div>
        </div>
      )
    }
    if (publicError || !publicDashboard) {
      return (
        <div className="h-screen w-screen flex flex-col items-center justify-center bg-slate-900 text-white space-y-4 p-6">
          <div className="text-red-400 text-lg font-bold">加载免密大屏失败</div>
          <div className="text-sm text-slate-400 max-w-md text-center">{publicError || '大屏不存在或未开启公开共享'}</div>
          <a
            href="/"
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold"
          >
            返回主页
          </a>
        </div>
      )
    }
    return (
      <DashboardCanvas
        dashboard={publicDashboard}
        readOnly
        onBack={() => {
          window.location.href = '/'
        }}
      />
    )
  }

  if (!token) {
    return <Login />
  }

  return (
    <Layout currentTab={currentTab} setCurrentTab={setCurrentTab}>
      {currentTab === 'dashboard' && <DashboardsModule onNavigate={setCurrentTab} />}
      {currentTab === 'visualDashboards' && <VisualDashboardsModule />}
      {currentTab === 'devices' && <DevicesModule />}
      {currentTab === 'certs' && <CertsModule />}
      {currentTab === 'gateways' && <GatewaysModule />}
      {currentTab === 'channels' && <ChannelsModule />}
      {currentTab === 'alarms' && <AlarmsModule />}
      {currentTab === 'bootstraps' && <BootstrapModule />}
      {currentTab === 'brokerHub' && <BrokerHubModule />}
      {currentTab === 'users' && <UsersModule />}
      {currentTab === 'settings' && <SettingsModule />}

      {currentTab === 'workspaces' && <WorkspacesModule />}

      {currentTab === 'groups' && (
        <CrudModule
          endpoint="/api/groups"
          title="群组管理 (Groups)"
          columns={[
            { key: 'name', label: '群组名称' },
            { key: 'id', label: '群组 ID' },
            { key: 'group_type', label: '群组类型' },
            { key: 'description', label: '描述说明' },
          ]}
          createFields={[
            { name: 'name', label: '群组名称', placeholder: '例如：车间 A 传感器集群' },
            { name: 'description', label: '群组职能描述' },
          ]}
        />
      )}

      {currentTab === 'messages' && <MessagesModule />}
      {currentTab === 'rules' && <RulesModule />}

      {currentTab === 'pats' && (
        <CrudModule
          endpoint="/api/pats"
          title="个人访问令牌 (PAT)"
          columns={[
            { key: 'name', label: '令牌名称' },
            {
              key: 'token',
              label: '访问凭证 Token',
              render: (v) => <span className="font-mono text-xs text-blue-600 select-all">{v}</span>,
            },
            { key: 'duration', label: '有效期(天)' },
            { key: 'created_at', label: '创建时间' },
          ]}
          createFields={[
            { name: 'name', label: '令牌用途', placeholder: '例如：CI/CD 自动化调用 Token' },
          ]}
        />
      )}
    </Layout>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AppContent />
      </ToastProvider>
    </QueryClientProvider>
  )
}
