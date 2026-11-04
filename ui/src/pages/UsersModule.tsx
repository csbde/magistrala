import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchApi } from '../lib/api'
import { useAuthStore } from '../store/authStore'
import { dict } from '../lib/i18n'
import { Shield, ShieldCheck, UserPlus, Edit2, Trash2, KeyRound } from 'lucide-react'
import { useToast } from '../components/ui/Toast'
import { EmptyState, Button, Dialog, Input, Select, StatusBadge } from '../components/ui/primitives'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'

export const UsersModule: React.FC = () => {
  const { currentWorkspace, language } = useAuthStore()
  const t = dict[language]
  const queryClient = useQueryClient()
  const { success, error: toastError } = useToast()

  const [createOpen, setCreateOpen] = useState(false)
  const [editUser, setEditUser] = useState<any | null>(null)
  const [deleteUser, setDeleteUser] = useState<any | null>(null)

  const [createForm, setCreateForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'user',
    workspace_role: 'role:viewer',
  })

  const [editForm, setEditForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'user',
    status: 'enabled',
    workspace_role: 'role:viewer',
  })

  const { data: rawUsers, isLoading } = useQuery({
    queryKey: ['/api/users', currentWorkspace?.id],
    queryFn: () => fetchApi<any>('/api/users'),
    enabled: !!currentWorkspace?.id,
  })
  const users: any[] = Array.isArray(rawUsers) ? rawUsers : rawUsers?.items ?? []

  const { data: roleData } = useQuery({
    queryKey: ['/api/roles', currentWorkspace?.id],
    queryFn: () => fetchApi<any>('/api/roles'),
    enabled: !!currentWorkspace?.id,
  })

  const assignMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      fetchApi('/api/roles/assign', {
        method: 'POST',
        body: JSON.stringify({ user_id: userId, role }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/users'] })
      success('角色分配已更新')
    },
    onError: (err: any) => {
      toastError(err.message || '分配角色失败')
    },
  })

  const createUserMutation = useMutation({
    mutationFn: (payload: any) =>
      fetchApi('/api/users', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/users'] })
      setCreateOpen(false)
      setCreateForm({
        name: '',
        email: '',
        password: '',
        role: 'user',
        workspace_role: 'role:viewer',
      })
      success('用户添加成功，已绑定当前租户权限')
    },
    onError: (err: any) => {
      toastError(err.message || '创建用户失败')
    },
  })

  const updateUserMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: any }) =>
      fetchApi(`/api/users/${id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/users'] })
      setEditUser(null)
      success('用户信息已更新')
    },
    onError: (err: any) => {
      toastError(err.message || '修改用户失败')
    },
  })

  const deleteUserMutation = useMutation({
    mutationFn: (id: string) =>
      fetchApi(`/api/users/${id}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/users'] })
      setDeleteUser(null)
      success('用户已删除')
    },
    onError: (err: any) => {
      toastError(err.message || '删除用户失败')
    },
  })

  const openEdit = (u: any) => {
    const wsRole = u.workspace_roles?.[0] || 'role:viewer'
    setEditForm({
      name: u.name || '',
      email: u.email || '',
      password: '',
      role: u.role || 'user',
      status: u.status || 'enabled',
      workspace_role: wsRole,
    })
    setEditUser(u)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-800">用户成员与 Casbin 权限体系</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Casbin RBAC (g = _, _, _) 针对当前租户 (Domain: {currentWorkspace?.id}) 进行隔离
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="flex items-center gap-1.5">
          <UserPlus className="w-4 h-4" />
          <span>添加成员</span>
        </Button>
      </div>

      {/* Role explanation */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {roleData?.builtin_roles?.map((r: any) => (
          <div key={r.name} className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <Shield className="w-4 h-4 text-blue-600" />
              <span className="font-semibold text-sm text-slate-800">{r.name}</span>
            </div>
            <p className="text-xs text-slate-500">{r.description}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        {isLoading ? (
          <EmptyState text="" loading />
        ) : users.length === 0 ? (
          <EmptyState text={t.noData} />
        ) : (
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-xs font-semibold uppercase">
                <th className="py-3 px-4">用户名称</th>
                <th className="py-3 px-4">电子邮箱</th>
                <th className="py-3 px-4">全局角色</th>
                <th className="py-3 px-4">状态</th>
                <th className="py-3 px-4">当前租户角色 (Casbin)</th>
                <th className="py-3 px-4 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((item: any) => (
                <tr key={item.id} className="hover:bg-slate-50/60">
                  <td className="py-3 px-4 font-medium text-slate-800">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-blue-50 text-blue-600 text-xs font-bold flex items-center justify-center">
                        {item.name?.[0]?.toUpperCase() || item.email?.[0]?.toUpperCase()}
                      </div>
                      <div>
                        <div className="font-semibold">{item.name}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{item.id}</div>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-slate-600 font-mono text-xs">{item.email}</td>
                  <td className="py-3 px-4">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        item.role === 'admin'
                          ? 'bg-purple-50 text-purple-700 border border-purple-200'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {item.role === 'admin' ? '系统管理员' : '普通用户'}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <StatusBadge status={item.status || 'enabled'} />
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex flex-wrap gap-1">
                      {item.workspace_roles && item.workspace_roles.length > 0 ? (
                        item.workspace_roles.map((r: string) => (
                          <span
                            key={r}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200"
                          >
                            <ShieldCheck className="w-3 h-3" />
                            {r}
                          </span>
                        ))
                      ) : (
                        <span className="text-slate-400 text-xs">无专属角色 (遵循默认)</span>
                      )}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <select
                        className="text-xs border border-slate-300 rounded-lg px-2 py-1 bg-white text-slate-700 hover:border-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        onChange={(e) => {
                          if (e.target.value) {
                            assignMutation.mutate({ userId: item.id, role: e.target.value })
                            e.target.value = ''
                          }
                        }}
                        defaultValue=""
                      >
                        <option value="" disabled>
                          + 赋权
                        </option>
                        <option value="role:admin">role:admin (管理员)</option>
                        <option value="role:editor">role:editor (操作员)</option>
                        <option value="role:viewer">role:viewer (只读)</option>
                      </select>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEdit(item)}
                        title="编辑用户详情"
                        className="text-slate-600 hover:text-blue-600"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeleteUser(item)}
                        title="删除账号"
                        className="text-slate-600 hover:text-red-600"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Create User Dialog */}
      <Dialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="添加租户成员"
        description="新建账号或加入当前 Casbin 授权空间"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault()
            createUserMutation.mutate({
              name: createForm.name,
              email: createForm.email,
              password: createForm.password,
              role: createForm.role,
              workspace_role: createForm.workspace_role,
            })
          }}
          className="space-y-4"
        >
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">用户姓名 *</label>
            <Input
              required
              value={createForm.name}
              onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
              placeholder="例如：张工"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">电子邮箱 *</label>
            <Input
              required
              type="email"
              value={createForm.email}
              onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
              placeholder="zhang@company.com"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">登录密码 *</label>
            <Input
              required
              type="password"
              value={createForm.password}
              onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
              placeholder="至少 6 位密码"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">全局身份</label>
              <Select
                value={createForm.role}
                onChange={(e) => setCreateForm({ ...createForm, role: e.target.value })}
              >
                <option value="user">普通用户 (User)</option>
                <option value="admin">平台管理员 (Admin)</option>
              </Select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">当前租户 Casbin 角色</label>
              <Select
                value={createForm.workspace_role}
                onChange={(e) => setCreateForm({ ...createForm, workspace_role: e.target.value })}
              >
                <option value="role:admin">role:admin (工作区管理员)</option>
                <option value="role:editor">role:editor (操作维护员)</option>
                <option value="role:viewer">role:viewer (只读观察员)</option>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
              {t.cancel}
            </Button>
            <Button type="submit" loading={createUserMutation.isPending}>
              {t.save}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog
        open={!!editUser}
        onClose={() => setEditUser(null)}
        title="编辑用户资料与授权"
        description={`修改账号「${editUser?.email}」的基本信息与租户权限`}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (!editUser) return
            updateUserMutation.mutate({
              id: editUser.id,
              payload: {
                name: editForm.name,
                email: editForm.email,
                password: editForm.password || undefined,
                role: editForm.role,
                status: editForm.status,
                workspace_role: editForm.workspace_role,
              },
            })
          }}
          className="space-y-4"
        >
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">用户姓名 *</label>
            <Input
              required
              value={editForm.name}
              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">电子邮箱 *</label>
            <Input
              required
              type="email"
              value={editForm.email}
              onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1">
              <KeyRound className="w-3.5 h-3.5 text-blue-600" />
              <span>重置密码 (选填，留空则保持原密码)</span>
            </label>
            <Input
              type="password"
              placeholder="留空表示不修改密码"
              value={editForm.password}
              onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">全局身份</label>
              <Select
                value={editForm.role}
                onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
              >
                <option value="user">普通用户 (User)</option>
                <option value="admin">平台管理员 (Admin)</option>
              </Select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">账号状态</label>
              <Select
                value={editForm.status}
                onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
              >
                <option value="enabled">正常启用 (Enabled)</option>
                <option value="disabled">冻结禁用 (Disabled)</option>
              </Select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">当前租户角色</label>
              <Select
                value={editForm.workspace_role}
                onChange={(e) => setEditForm({ ...editForm, workspace_role: e.target.value })}
              >
                <option value="role:admin">role:admin (管理员)</option>
                <option value="role:editor">role:editor (操作员)</option>
                <option value="role:viewer">role:viewer (只读)</option>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setEditUser(null)}>
              {t.cancel}
            </Button>
            <Button type="submit" loading={updateUserMutation.isPending}>
              保存修改
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Delete Confirm */}
      <ConfirmDialog
        open={!!deleteUser}
        title="确认删除账号"
        message={`确定要彻底删除账号「${deleteUser?.name || deleteUser?.email}」吗？此操作将同时清空该账号在所有租户下的授权。`}
        loading={deleteUserMutation.isPending}
        onConfirm={() => {
          if (deleteUser) deleteUserMutation.mutate(deleteUser.id)
        }}
        onClose={() => setDeleteUser(null)}
      />
    </div>
  )
}
