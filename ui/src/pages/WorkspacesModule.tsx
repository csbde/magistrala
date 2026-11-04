import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchApi } from '../lib/api'
import { useAuthStore } from '../store/authStore'
import type { Workspace, User, Page } from '../types'
import {
  Button,
  Dialog,
  Input,
  Select,
  Textarea,
  StatusBadge,
  EmptyState,
} from '../components/ui/primitives'
import {
  Building2,
  Plus,
  Trash2,
  Settings,
  ShieldCheck,
  CheckCircle,
  Sliders,
  ExternalLink,
  Users,
  UserPlus,
  UserMinus,
  Crown,
} from 'lucide-react'
import { useToast } from '../components/ui/Toast'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'

export const WorkspacesModule: React.FC = () => {
  const { currentWorkspace, setCurrentWorkspace, user: currentUser } = useAuthStore()
  const qc = useQueryClient()
  const { success, error: toastError } = useToast()

  const [createOpen, setCreateOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState<Workspace | null>(null)
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)
  const [membersOpenWs, setMembersOpenWs] = useState<Workspace | null>(null)

  // Member binding state inside modal
  const [selectedUserId, setSelectedUserId] = useState('')
  const [selectedRole, setSelectedRole] = useState('role:editor')

  // Create form state
  const [createForm, setCreateForm] = useState({
    name: '',
    alias: '',
    description: '',
    owner_id: '',
    max_devices: '1000',
    max_channels: '50',
    retention_days: '30',
  })

  // Settings form state
  const [editForm, setEditForm] = useState({
    name: '',
    alias: '',
    description: '',
    owner_id: '',
    status: 'enabled',
    max_devices: '1000',
    max_channels: '50',
    retention_days: '30',
    webhook_url: '',
  })

  const { data: rawWorkspaces, isLoading } = useQuery({
    queryKey: ['/api/workspaces'],
    queryFn: () => fetchApi<Page<Workspace>>('/api/workspaces'),
  })

  const { data: rawUsers } = useQuery({
    queryKey: ['/api/users-all'],
    queryFn: () => fetchApi<any>('/api/users'),
  })

  const workspaces = rawWorkspaces?.items ?? []
  const users: User[] = Array.isArray(rawUsers) ? rawUsers : rawUsers?.items ?? []

  // Members of selected workspace
  const { data: rawMembers, isLoading: membersLoading } = useQuery({
    queryKey: ['/api/workspaces/members', membersOpenWs?.id],
    queryFn: () => fetchApi<any>(`/api/workspaces/${membersOpenWs?.id}/members`),
    enabled: !!membersOpenWs?.id,
  })
  const workspaceMembers: any[] = rawMembers?.items ?? []

  const bindMemberMutation = useMutation({
    mutationFn: ({ wsId, userId, role }: { wsId: string; userId: string; role: string }) =>
      fetchApi(`/api/workspaces/${wsId}/members`, {
        method: 'POST',
        body: JSON.stringify({ user_id: userId, role }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/workspaces/members', membersOpenWs?.id] })
      qc.invalidateQueries({ queryKey: ['/api/users'] })
      setSelectedUserId('')
      success('成员已成功绑定到租户空间')
    },
    onError: (e: any) => toastError(e.message || '绑定成员失败'),
  })

  const unbindMemberMutation = useMutation({
    mutationFn: ({ wsId, userId }: { wsId: string; userId: string }) =>
      fetchApi(`/api/workspaces/${wsId}/members/${userId}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/workspaces/members', membersOpenWs?.id] })
      qc.invalidateQueries({ queryKey: ['/api/users'] })
      success('已将成员移出租户')
    },
    onError: (e: any) => toastError(e.message || '解绑成员失败'),
  })

  const createMutation = useMutation({
    mutationFn: (payload: any) =>
      fetchApi('/api/workspaces', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: (newWs) => {
      qc.invalidateQueries({ queryKey: ['/api/workspaces'] })
      setCreateOpen(false)
      setCreateForm({
        name: '',
        alias: '',
        description: '',
        owner_id: '',
        max_devices: '1000',
        max_channels: '50',
        retention_days: '30',
      })
      success(`租户「${newWs.name}」创建成功`)
    },
    onError: (e: any) => toastError(e.message || '创建租户失败'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: any }) =>
      fetchApi(`/api/workspaces/${id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      }),
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ['/api/workspaces'] })
      if (currentWorkspace?.id === updated.id) {
        setCurrentWorkspace(updated)
      }
      setSettingsOpen(null)
      success(`租户「${updated.name}」配置已更新`)
    },
    onError: (e: any) => toastError(e.message || '更新租户失败'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => fetchApi(`/api/workspaces/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/workspaces'] })
      setDeleteTargetId(null)
      success('租户及其附属资源已删除')
    },
    onError: (e: any) => toastError(e.message || '删除租户失败'),
  })

  const openSettings = (ws: Workspace) => {
    const meta = ws.metadata ?? {}
    setEditForm({
      name: ws.name,
      alias: ws.alias,
      description: ws.description,
      owner_id: ws.owner_id || '',
      status: ws.status || 'enabled',
      max_devices: String(meta.max_devices ?? '1000'),
      max_channels: String(meta.max_channels ?? '50'),
      retention_days: String(meta.retention_days ?? '30'),
      webhook_url: String(meta.webhook_url ?? ''),
    })
    setSettingsOpen(ws)
  }

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault()
    createMutation.mutate({
      name: createForm.name,
      alias: createForm.alias,
      description: createForm.description,
      owner_id: createForm.owner_id || undefined,
      status: 'enabled',
      metadata: {
        max_devices: parseInt(createForm.max_devices) || 1000,
        max_channels: parseInt(createForm.max_channels) || 50,
        retention_days: parseInt(createForm.retention_days) || 30,
      },
    })
  }

  const handleUpdate = (e: React.FormEvent) => {
    e.preventDefault()
    if (!settingsOpen) return

    updateMutation.mutate({
      id: settingsOpen.id,
      payload: {
        name: editForm.name,
        alias: editForm.alias,
        description: editForm.description,
        owner_id: editForm.owner_id || undefined,
        status: editForm.status,
        metadata: {
          ...(settingsOpen.metadata ?? {}),
          max_devices: parseInt(editForm.max_devices) || 1000,
          max_channels: parseInt(editForm.max_channels) || 50,
          retention_days: parseInt(editForm.retention_days) || 30,
          webhook_url: editForm.webhook_url,
        },
      },
    })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800">多租户工作区与空间隔离 (Multi-Tenancy)</h2>
          <p className="text-xs text-slate-500 mt-1">
            为不同客户、子公司或项目划分专属的物联网物理/逻辑资源域，支持独立的 Casbin 成员授权体系
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="flex items-center gap-1.5">
          <Plus className="w-4 h-4" />
          <span>新建租户空间</span>
        </Button>
      </div>

      {/* Workspace Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        {isLoading ? (
          <EmptyState text="" loading />
        ) : workspaces.length === 0 ? (
          <EmptyState text="暂无租户工作空间" />
        ) : (
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-xs font-semibold uppercase tracking-wider">
                <th className="py-3 px-4">租户空间名称</th>
                <th className="py-3 px-4">英文代号 (Alias)</th>
                <th className="py-3 px-4">租户 ID</th>
                <th className="py-3 px-4">租户管理员 (Tenant Admin)</th>
                <th className="py-3 px-4">资源配额与策略</th>
                <th className="py-3 px-4">状态</th>
                <th className="py-3 px-4 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {workspaces.map((ws) => {
                const isCurrent = currentWorkspace?.id === ws.id
                const meta = ws.metadata ?? {}
                const ownerUser = users.find((u) => u.id === ws.owner_id)

                return (
                  <tr key={ws.id} className="hover:bg-slate-50/60 transition">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <Building2 className={`w-4 h-4 ${isCurrent ? 'text-blue-600' : 'text-slate-400'}`} />
                        <div>
                          <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                            <span>{ws.name}</span>
                            {isCurrent && (
                              <span className="inline-flex items-center gap-0.5 text-[10px] bg-emerald-50 text-emerald-700 px-1.5 py-0.2 rounded border border-emerald-200 font-medium">
                                <CheckCircle className="w-3 h-3 text-emerald-600" />
                                <span>当前上下文</span>
                              </span>
                            )}
                          </div>
                          {ws.description && (
                            <div className="text-[11px] text-slate-400 max-w-xs truncate">{ws.description}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono text-xs text-slate-600">{ws.alias || '-'}</td>
                    <td className="py-3 px-4 font-mono text-xs text-slate-400">{ws.id}</td>
                    <td className="py-3 px-4 text-xs">
                      {ownerUser ? (
                        <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 font-medium">
                          <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
                          <span>{ownerUser.name || ownerUser.email}</span>
                        </div>
                      ) : (
                        <span className="text-slate-400 text-xs">系统默认 Admin</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600">
                      <div className="flex items-center gap-2 font-mono text-[11px]">
                        <span title="最大设备数">设备: {meta.max_devices ?? 1000}</span>
                        <span className="text-slate-300">|</span>
                        <span title="最大通道数">通道: {meta.max_channels ?? 50}</span>
                        <span className="text-slate-300">|</span>
                        <span title="数据保留">保留: {meta.retention_days ?? 30}天</span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <StatusBadge status={ws.status} />
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setMembersOpenWs(ws)}
                          className="flex items-center gap-1 text-xs text-blue-700 bg-blue-50/60 border-blue-200 hover:bg-blue-100"
                          title="管理租户绑定的用户成员及 Casbin 角色"
                        >
                          <Users className="w-3.5 h-3.5 text-blue-600" />
                          <span>成员管理</span>
                        </Button>
                        {!isCurrent && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setCurrentWorkspace(ws)
                              success(`已切换工作空间至「${ws.name}」`)
                            }}
                            className="flex items-center gap-1 text-xs"
                          >
                            <ExternalLink className="w-3 h-3" />
                            <span>进入空间</span>
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openSettings(ws)}
                          title="租户管理与配额配置"
                        >
                          <Settings className="w-3.5 h-3.5 text-slate-600" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteTargetId(ws.id)}
                          title="删除租户"
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
        )}
      </div>

      {/* Create Modal */}
      <Dialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="新建租户工作区 (Tenant Workspace)"
        description="创建独立的租户物理/逻辑空间，拥有完全隔离的设备凭证与 Casbin 权限域"
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">租户空间名称 *</label>
            <Input
              required
              value={createForm.name}
              onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
              placeholder="例如：苏州智慧水务一期项目"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">英文别名 / 代码 (Alias)</label>
              <Input
                value={createForm.alias}
                onChange={(e) => setCreateForm({ ...createForm, alias: e.target.value })}
                placeholder="suzhou-water-01"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1">
                <Crown className="w-3.5 h-3.5 text-amber-500" />
                <span>租户管理员 (Tenant Admin)</span>
              </label>
              <Select
                value={createForm.owner_id}
                onChange={(e) => setCreateForm({ ...createForm, owner_id: e.target.value })}
              >
                <option value="">当前用户 ({currentUser?.name || currentUser?.email})</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name || u.email} ({u.email})
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">业务描述说明</label>
            <Textarea
              rows={2}
              value={createForm.description}
              onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
              placeholder="简要说明该租户的应用场景或归属组织"
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">最大设备数上限</label>
              <Input
                type="number"
                value={createForm.max_devices}
                onChange={(e) => setCreateForm({ ...createForm, max_devices: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">最大通道数上限</label>
              <Input
                type="number"
                value={createForm.max_channels}
                onChange={(e) => setCreateForm({ ...createForm, max_channels: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">历史消息保留天数</label>
              <Input
                type="number"
                value={createForm.retention_days}
                onChange={(e) => setCreateForm({ ...createForm, retention_days: e.target.value })}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
              取消
            </Button>
            <Button type="submit" loading={createMutation.isPending}>
              立即创建
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Tenant Member Management Dialog */}
      <Dialog
        open={!!membersOpenWs}
        onClose={() => setMembersOpenWs(null)}
        title={`租户成员与授权管理 — ${membersOpenWs?.name}`}
        description={`租户 ID: ${membersOpenWs?.id} | 别名: ${membersOpenWs?.alias || '-'} | 管理本空间的 Casbin 授权与成员绑定`}
      >
        <div className="space-y-5">
          {/* Add / Bind user section */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
              <UserPlus className="w-4 h-4 text-blue-600" />
              <span>绑定新成员到当前租户空间</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
              <div className="sm:col-span-6">
                <Select
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                >
                  <option value="">-- 选择系统内已有用户 --</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name || u.email} ({u.email})
                    </option>
                  ))}
                </Select>
              </div>
              <div className="sm:col-span-4">
                <Select
                  value={selectedRole}
                  onChange={(e) => setSelectedRole(e.target.value)}
                >
                  <option value="role:admin">role:admin (租户管理员)</option>
                  <option value="role:editor">role:editor (操作维护员)</option>
                  <option value="role:viewer">role:viewer (只读观察员)</option>
                </Select>
              </div>
              <div className="sm:col-span-2">
                <Button
                  className="w-full text-xs"
                  disabled={!selectedUserId || bindMemberMutation.isPending}
                  onClick={() => {
                    if (membersOpenWs && selectedUserId) {
                      bindMemberMutation.mutate({
                        wsId: membersOpenWs.id,
                        userId: selectedUserId,
                        role: selectedRole,
                      })
                    }
                  }}
                >
                  绑定
                </Button>
              </div>
            </div>
          </div>

          {/* Members Table */}
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-700">
                已绑定成员列表 ({workspaceMembers.length})
              </span>
            </div>
            {membersLoading ? (
              <EmptyState text="" loading />
            ) : workspaceMembers.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400">
                该租户暂无已绑定的成员，请通过上方添加绑定
              </div>
            ) : (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50/50 border-b border-slate-200 text-slate-500 font-medium">
                    <th className="py-2.5 px-3">用户名称</th>
                    <th className="py-2.5 px-3">电子邮箱</th>
                    <th className="py-2.5 px-3">当前租户角色</th>
                    <th className="py-2.5 px-3 text-right">角色变更 / 解绑</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {workspaceMembers.map((m: any) => {
                    const currentRole = m.workspace_roles?.[0] || 'role:viewer'
                    return (
                      <tr key={m.id} className="hover:bg-slate-50/60">
                        <td className="py-2.5 px-3 font-medium text-slate-800">
                          <div className="flex items-center gap-1.5">
                            <span>{m.name || m.email}</span>
                            {m.is_owner && (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[10px] bg-amber-50 text-amber-700 border border-amber-200 font-medium">
                                <Crown className="w-2.5 h-2.5 text-amber-500" />
                                <span>所有者</span>
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-slate-600 font-mono">{m.email}</td>
                        <td className="py-2.5 px-3">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                            <ShieldCheck className="w-3 h-3 text-blue-600" />
                            <span>{currentRole}</span>
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <select
                              className="text-xs border border-slate-300 rounded px-2 py-1 bg-white text-slate-700 hover:border-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                              value={currentRole}
                              onChange={(e) => {
                                if (membersOpenWs) {
                                  bindMemberMutation.mutate({
                                    wsId: membersOpenWs.id,
                                    userId: m.id,
                                    role: e.target.value,
                                  })
                                }
                              }}
                            >
                              <option value="role:admin">role:admin (管理员)</option>
                              <option value="role:editor">role:editor (操作员)</option>
                              <option value="role:viewer">role:viewer (只读)</option>
                            </select>
                            {!m.is_owner && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  if (membersOpenWs) {
                                    unbindMemberMutation.mutate({
                                      wsId: membersOpenWs.id,
                                      userId: m.id,
                                    })
                                  }
                                }}
                                title="从租户中移出该用户"
                                className="text-slate-400 hover:text-red-600"
                              >
                                <UserMinus className="w-3.5 h-3.5" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>

          <div className="flex justify-end pt-2">
            <Button variant="outline" onClick={() => setMembersOpenWs(null)}>
              关闭
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Settings / Edit Modal */}
      <Dialog
        open={!!settingsOpen}
        onClose={() => setSettingsOpen(null)}
        title={`租户空间管理 — ${settingsOpen?.name}`}
        description="修改租户基本信息、所有权归属与资源配额策略"
      >
        <form onSubmit={handleUpdate} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">租户空间名称 *</label>
              <Input
                required
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">英文别名 / Alias</label>
              <Input
                value={editForm.alias}
                onChange={(e) => setEditForm({ ...editForm, alias: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
                <span>租户管理员 (Tenant Admin / Owner)</span>
              </label>
              <Select
                value={editForm.owner_id}
                onChange={(e) => setEditForm({ ...editForm, owner_id: e.target.value })}
              >
                <option value="">-- 系统默认所有者 --</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name || u.email} ({u.email})
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">租户运行状态</label>
              <Select
                value={editForm.status}
                onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
              >
                <option value="enabled">启用 (Enabled)</option>
                <option value="disabled">冻结/停用 (Disabled)</option>
              </Select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">业务描述说明</label>
            <Textarea
              rows={2}
              value={editForm.description}
              onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
            />
          </div>

          {/* Quota & Advance Settings */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
            <div className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-blue-600" />
              <span>租户资源配额与高级规则</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">最大设备数上限</label>
                <Input
                  type="number"
                  value={editForm.max_devices}
                  onChange={(e) => setEditForm({ ...editForm, max_devices: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">最大通道数上限</label>
                <Input
                  type="number"
                  value={editForm.max_channels}
                  onChange={(e) => setEditForm({ ...editForm, max_channels: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">历史消息保留天数</label>
                <Input
                  type="number"
                  value={editForm.retention_days}
                  onChange={(e) => setEditForm({ ...editForm, retention_days: e.target.value })}
                />
              </div>
            </div>
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">
                租户专属事件推送 Webhook URL (选填)
              </label>
              <Input
                type="url"
                placeholder="https://tenant-api.client.com/webhook"
                value={editForm.webhook_url}
                onChange={(e) => setEditForm({ ...editForm, webhook_url: e.target.value })}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setSettingsOpen(null)}>
              取消
            </Button>
            <Button type="submit" loading={updateMutation.isPending}>
              保存配置
            </Button>
          </div>
        </form>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTargetId}
        title="确认删除租户空间"
        message="警告：删除租户将同时级联清空属于该租户下的所有设备、通道、规则与消息数据，操作不可逆，请确认！"
        loading={deleteMutation.isPending}
        onConfirm={() => {
          if (deleteTargetId) deleteMutation.mutate(deleteTargetId)
        }}
        onClose={() => setDeleteTargetId(null)}
      />
    </div>
  )
}
