import React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchApi } from '../lib/api'
import { useAuthStore } from '../store/authStore'
import { dict } from '../lib/i18n'
import { Shield, ShieldCheck } from 'lucide-react'

export const UsersModule: React.FC = () => {
  const { currentWorkspace, language } = useAuthStore()
  const t = dict[language]
  const queryClient = useQueryClient()

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
    },
    onError: (err: any) => {
      alert(err.message || '分配角色失败')
    },
  })

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-800">用户成员与 Casbin 权限体系</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Casbin RBAC (g = _, _, _) 针对当前租户 (Domain: {currentWorkspace?.id}) 进行隔离
        </p>
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
          <div className="p-12 text-center text-slate-400 text-sm">{t.loading}</div>
        ) : (
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-xs font-semibold uppercase">
                <th className="py-3 px-4">用户名称</th>
                <th className="py-3 px-4">电子邮箱</th>
                <th className="py-3 px-4">工作区角色 (Casbin)</th>
                <th className="py-3 px-4 text-right">角色分配操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((item: any) => (
                <tr key={item.id} className="hover:bg-slate-50/60">
                  <td className="py-3 px-4 font-medium text-slate-800">{item.name}</td>
                  <td className="py-3 px-4 text-slate-600">{item.email}</td>
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
                    <select
                      className="text-xs border border-slate-300 rounded px-2 py-1 bg-white text-slate-700"
                      onChange={(e) => {
                        if (e.target.value) {
                          assignMutation.mutate({ userId: item.id, role: e.target.value })
                          e.target.value = ''
                        }
                      }}
                      defaultValue=""
                    >
                      <option value="" disabled>
                        + 变更角色
                      </option>
                      <option value="role:admin">role:admin (管理员)</option>
                      <option value="role:editor">role:editor (操作员)</option>
                      <option value="role:viewer">role:viewer (只读)</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
