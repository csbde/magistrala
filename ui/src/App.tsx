import React, { useState, useEffect } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAuthStore } from './store/authStore'
import { Login } from './pages/Login'
import { Layout } from './components/Layout'
import { DashboardsModule } from './pages/DashboardsModule'
import { DevicesModule } from './pages/DevicesModule'
import { GatewaysModule } from './pages/GatewaysModule'
import { ChannelsModule } from './pages/ChannelsModule'
import { AlarmsModule } from './pages/AlarmsModule'
import { BootstrapModule } from './pages/BootstrapModule'
import { BrokerHubModule } from './pages/BrokerHubModule'
import { UsersModule } from './pages/UsersModule'
import { CrudModule } from './pages/CrudModule'
import { fetchApi } from './lib/api'

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

  // Check URL query parameters for OIDC callback redirect (token & workspace_id)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
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

  if (!token) {
    return <Login />
  }

  return (
    <Layout currentTab={currentTab} setCurrentTab={setCurrentTab}>
      {currentTab === 'dashboard' && <DashboardsModule onNavigate={setCurrentTab} />}
      {currentTab === 'devices' && <DevicesModule />}
      {currentTab === 'gateways' && <GatewaysModule />}
      {currentTab === 'channels' && <ChannelsModule />}
      {currentTab === 'alarms' && <AlarmsModule />}
      {currentTab === 'bootstraps' && <BootstrapModule />}
      {currentTab === 'brokerHub' && <BrokerHubModule />}
      {currentTab === 'users' && <UsersModule />}

      {currentTab === 'workspaces' && (
        <CrudModule
          endpoint="/api/workspaces"
          title="工作空间 (租户)"
          columns={[
            { key: 'name', label: '空间名称' },
            { key: 'alias', label: '英文代号/别名' },
            { key: 'id', label: '租户 ID' },
            { key: 'description', label: '描述说明' },
            {
              key: 'status',
              label: '状态',
              render: (v) => (
                <span className="inline-flex px-2 py-0.5 rounded text-xs bg-emerald-100 text-emerald-800">
                  {v}
                </span>
              ),
            },
          ]}
          createFields={[
            { name: 'name', label: '空间名称', placeholder: '例如：智慧工业园区 A 区' },
            { name: 'alias', label: '英文别名/代号', placeholder: 'park-a' },
            { name: 'description', label: '描述说明', placeholder: '租户业务描述...' },
          ]}
        />
      )}

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

      {currentTab === 'rules' && (
        <CrudModule
          endpoint="/api/rules"
          title="规则引擎 (Rules)"
          columns={[
            { key: 'name', label: '规则名称' },
            { key: 'input_channel', label: '绑定通道 ID' },
            { key: 'input_topic', label: '匹配主题 (Topic)' },
            { key: 'status', label: '状态' },
          ]}
          createFields={[
            { name: 'name', label: '规则名称', placeholder: '例如：温度阈值联动规则' },
            { name: 'input_channel', label: '输入通道 ID', placeholder: 'chan-xxx' },
            { name: 'input_topic', label: '输入子主题', placeholder: 'temperature' },
          ]}
        />
      )}

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
      <AppContent />
    </QueryClientProvider>
  )
}
