import React, { useState, useEffect } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAuthStore } from './store/authStore'
import { Login } from './pages/Login'
import { Layout } from './components/Layout'
import { CrudModule } from './pages/CrudModule'
import { UsersModule } from './pages/UsersModule'
import { fetchApi } from './lib/api'

const queryClient = new QueryClient()

export const AppContent: React.FC = () => {
  const { token, setToken, setAuth } = useAuthStore()
  const [currentTab, setCurrentTab] = useState('devices')

  // Check URL query parameters for OIDC callback redirect (token & workspace_id)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const urlToken = params.get('token')
    const urlWs = params.get('workspace_id')
    if (urlToken) {
      setToken(urlToken)
      window.history.replaceState({}, document.title, window.location.pathname)

      // Fetch user profile
      fetchApi('/api/auth/me')
        .then((res) => {
          setAuth(urlToken, res.user, urlWs || res.workspace_id, res.workspaces)
        })
        .catch(() => {
          // ignore
        })
    }
  }, [])

  if (!token) {
    return <Login />
  }

  return (
    <Layout currentTab={currentTab} setCurrentTab={setCurrentTab}>
      {currentTab === 'workspaces' && (
        <CrudModule
          endpoint="/api/workspaces"
          title="工作空间 (租户)"
          columns={[
            { key: 'name', label: '空间名称' },
            { key: 'alias', label: '别名/标识' },
            { key: 'description', label: '空间描述' },
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

      {currentTab === 'devices' && (
        <CrudModule
          endpoint="/api/devices"
          title="设备管理 (Devices)"
          columns={[
            { key: 'name', label: '设备名称' },
            { key: 'id', label: '设备识别码 (ID)' },
            {
              key: 'credentials',
              label: '通信密钥 (Secret)',
              render: (v) => (
                <span className="font-mono text-xs bg-slate-100 px-2 py-0.5 rounded text-slate-700">
                  {v?.secret || '未配置'}
                </span>
              ),
            },
            {
              key: 'status',
              label: '运行状态',
              render: (v) => (
                <span className="inline-flex px-2 py-0.5 rounded text-xs bg-emerald-100 text-emerald-800">
                  {v}
                </span>
              ),
            },
          ]}
          createFields={[
            { name: 'name', label: '设备名称', placeholder: '例如：厂区网关 01' },
          ]}
        />
      )}

      {currentTab === 'channels' && (
        <CrudModule
          endpoint="/api/channels"
          title="通信通道 (Channels)"
          columns={[
            { key: 'name', label: '通道名称' },
            { key: 'id', label: '通道 ID' },
            {
              key: 'status',
              label: '状态',
              render: (v) => (
                <span className="inline-flex px-2 py-0.5 rounded text-xs bg-blue-100 text-blue-800">
                  {v}
                </span>
              ),
            },
          ]}
          createFields={[
            { name: 'name', label: '通道名称', placeholder: '例如：MQTT 控制通道' },
          ]}
        />
      )}

      {currentTab === 'groups' && (
        <CrudModule
          endpoint="/api/groups"
          title="群组管理 (Groups)"
          columns={[
            { key: 'name', label: '群组名称' },
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
            { key: 'input_channel', label: '绑定通道' },
            { key: 'status', label: '状态' },
          ]}
          createFields={[
            { name: 'name', label: '规则名称', placeholder: '例如：温度阈值联动规则' },
            { name: 'input_channel', label: '输入通道 ID' },
          ]}
        />
      )}

      {currentTab === 'alarms' && (
        <CrudModule
          endpoint="/api/alarms"
          title="告警中心 (Alarms)"
          columns={[
            { key: 'summary', label: '告警摘要' },
            {
              key: 'severity',
              label: '告警级别',
              render: (v) => (
                <span className="inline-flex px-2 py-0.5 rounded text-xs font-semibold bg-red-100 text-red-800">
                  {v || 'critical'}
                </span>
              ),
            },
            { key: 'status', label: '处置状态' },
          ]}
          createFields={[
            { name: 'summary', label: '告警内容摘要', placeholder: '例如：电压异常波动' },
          ]}
        />
      )}

      {currentTab === 'users' && <UsersModule />}

      {currentTab === 'pats' && (
        <CrudModule
          endpoint="/api/pats"
          title="个人访问令牌 (PAT)"
          columns={[
            { key: 'name', label: '令牌名称' },
            {
              key: 'token',
              label: '访问凭证 Token',
              render: (v) => <span className="font-mono text-xs text-blue-600">{v}</span>,
            },
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
