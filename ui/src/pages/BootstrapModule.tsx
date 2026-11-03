import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchApi } from '../lib/api'
import { useAuthStore } from '../store/authStore'
import { dict } from '../lib/i18n'
import type { BootstrapProfile, BootstrapConfig, Page } from '../types'
import {
  Button,
  Dialog,
  Input,
  Select,
  Tabs,
  Textarea,
  StatusBadge,
  Badge,
  EmptyState,
} from '../components/ui/primitives'
import { Plus, Trash2, Cpu, Settings2, KeyRound } from 'lucide-react'
import { useToast } from '../components/ui/Toast'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'

export const BootstrapModule: React.FC = () => {
  const { currentWorkspace, language } = useAuthStore()
  const t = dict[language]
  const qc = useQueryClient()
  const { success, error: toastError } = useToast()

  const [activeTab, setActiveTab] = useState<'profiles' | 'configs'>('profiles')
  const [profileModal, setProfileModal] = useState(false)
  const [configModal, setConfigModal] = useState(false)
  const [deleteProfileId, setDeleteProfileId] = useState<string | null>(null)
  const [deleteConfigId, setDeleteConfigId] = useState<string | null>(null)

  const [pForm, setPForm] = useState({
    name: '',
    channels: '',
    content: '{\n  "mqtt_broker": "localhost:1883",\n  "keepalive": 60\n}',
    encrypted: false,
  })

  const [cForm, setCForm] = useState({
    name: '',
    device_id: '',
    external_id: '',
    mac_address: '',
    profile_id: '',
    secure: false,
  })

  const wsKey = ['bootstraps', currentWorkspace?.id]

  const profilesQuery = useQuery({
    queryKey: [...wsKey, 'profiles'],
    queryFn: () => fetchApi<Page<BootstrapProfile>>('/api/bootstraps/profiles?limit=200'),
    enabled: !!currentWorkspace?.id,
  })

  const configsQuery = useQuery({
    queryKey: [...wsKey, 'configs'],
    queryFn: () => fetchApi<Page<BootstrapConfig>>('/api/bootstraps/configs?limit=200'),
    enabled: !!currentWorkspace?.id,
  })

  const createProfile = useMutation({
    mutationFn: (payload: any) =>
      fetchApi('/api/bootstraps/profiles', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...wsKey, 'profiles'] })
      setProfileModal(false)
      setPForm({ name: '', channels: '', content: '{\n  "mqtt_broker": "localhost:1883",\n  "keepalive": 60\n}', encrypted: false })
      success('引导方案创建成功')
    },
    onError: (e: any) => toastError(e.message || '创建方案失败'),
  })

  const deleteProfile = useMutation({
    mutationFn: (id: string) => fetchApi(`/api/bootstraps/profiles/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...wsKey, 'profiles'] })
      setDeleteProfileId(null)
      success('引导方案已删除')
    },
    onError: (e: any) => toastError(e.message || '删除方案失败'),
  })

  const createConfig = useMutation({
    mutationFn: (payload: any) =>
      fetchApi('/api/bootstraps/configs', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...wsKey, 'configs'] })
      setConfigModal(false)
      setCForm({ name: '', device_id: '', external_id: '', mac_address: '', profile_id: '', secure: false })
      success('设备引导映射添加成功')
    },
    onError: (e: any) => toastError(e.message || '添加映射失败'),
  })

  const deleteConfig = useMutation({
    mutationFn: (id: string) => fetchApi(`/api/bootstraps/configs/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...wsKey, 'configs'] })
      setDeleteConfigId(null)
      success('设备引导映射已删除')
    },
    onError: (e: any) => toastError(e.message || '删除映射失败'),
  })

  const profiles = profilesQuery.data?.items ?? []
  const configs = configsQuery.data?.items ?? []

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-800">{t.bootstraps}</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            引导服务允许未预先配置凭证的设备基于 MAC/外部识别码在开机首次启动时动态获取通信配置与密钥
          </p>
        </div>
        <div className="flex items-center gap-2">
          {activeTab === 'profiles' ? (
            <Button onClick={() => setProfileModal(true)} className="flex items-center gap-1.5">
              <Plus className="w-4 h-4" />
              <span>新建引导方案 (Profile)</span>
            </Button>
          ) : (
            <Button onClick={() => setConfigModal(true)} className="flex items-center gap-1.5">
              <Plus className="w-4 h-4" />
              <span>添加设备映射 (Config)</span>
            </Button>
          )}
        </div>
      </div>

      <Tabs
        items={[
          { id: 'profiles', label: '引导方案方案库 (Profiles)', icon: Settings2, badge: profiles.length },
          { id: 'configs', label: '设备识别码映射 (Configs)', icon: Cpu, badge: configs.length },
        ]}
        value={activeTab}
        onChange={(id) => setActiveTab(id as any)}
      />

      {activeTab === 'profiles' && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          {profilesQuery.isLoading ? (
            <EmptyState text="" loading />
          ) : profiles.length === 0 ? (
            <EmptyState text="暂无引导方案，点击上方「新建引导方案」创建" />
          ) : (
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-xs font-semibold uppercase">
                  <th className="py-3 px-4">方案名称</th>
                  <th className="py-3 px-4">方案 ID</th>
                  <th className="py-3 px-4">绑定通道</th>
                  <th className="py-3 px-4">加密状态</th>
                  <th className="py-3 px-4">创建时间</th>
                  <th className="py-3 px-4 text-right">{t.actions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {profiles.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/60 transition">
                    <td className="py-3 px-4 font-medium text-slate-800">{p.name}</td>
                    <td className="py-3 px-4 font-mono text-xs text-slate-500">{p.id}</td>
                    <td className="py-3 px-4">
                      <div className="flex flex-wrap gap-1">
                        {(p.channels ?? []).map((c) => (
                          <Badge key={c}>{c}</Badge>
                        ))}
                        {(!p.channels || p.channels.length === 0) && <span className="text-slate-400 text-xs">-</span>}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      {p.encrypted ? (
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                          <KeyRound className="w-3 h-3" />
                          <span>AES 密文</span>
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">明文下发</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-400">{new Date(p.created_at).toLocaleString()}</td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => setDeleteProfileId(p.id)}
                        className="text-slate-400 hover:text-red-600 p-1 rounded hover:bg-red-50 transition"
                        title={t.delete}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {activeTab === 'configs' && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          {configsQuery.isLoading ? (
            <EmptyState text="" loading />
          ) : configs.length === 0 ? (
            <EmptyState text="暂无设备映射记录，点击上方「添加设备映射」挂接新设备识别码" />
          ) : (
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-xs font-semibold uppercase">
                  <th className="py-3 px-4">映射名称</th>
                  <th className="py-3 px-4">设备 ID</th>
                  <th className="py-3 px-4">外部 ID / MAC</th>
                  <th className="py-3 px-4">关联方案 ID</th>
                  <th className="py-3 px-4">状态</th>
                  <th className="py-3 px-4 text-right">{t.actions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {configs.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/60 transition">
                    <td className="py-3 px-4 font-medium text-slate-800">{c.name}</td>
                    <td className="py-3 px-4 font-mono text-xs text-blue-600">{c.device_id}</td>
                    <td className="py-3 px-4 font-mono text-xs text-slate-600">
                      <div>{c.external_id || '-'}</div>
                      {c.mac_address && <div className="text-[11px] text-slate-400">{c.mac_address}</div>}
                    </td>
                    <td className="py-3 px-4 font-mono text-xs text-slate-500">{c.profile_id}</td>
                    <td className="py-3 px-4">
                      <StatusBadge status={c.status} />
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => setDeleteConfigId(c.id)}
                        className="text-slate-400 hover:text-red-600 p-1 rounded hover:bg-red-50 transition"
                        title={t.delete}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Create Profile Modal */}
      <Dialog open={profileModal} onClose={() => setProfileModal(false)} title="新建引导方案 (Profile)">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            createProfile.mutate({
              name: pForm.name,
              channels: pForm.channels.split(',').map((s) => s.trim()).filter(Boolean),
              content: pForm.content,
              encrypted: pForm.encrypted,
            })
          }}
          className="space-y-4"
        >
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">方案名称 *</label>
            <Input required value={pForm.name} onChange={(e) => setPForm({ ...pForm, name: e.target.value })} placeholder="例如：通用传感器默认引导方案" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">自动绑定通道 ID（逗号分隔）</label>
            <Input value={pForm.channels} onChange={(e) => setPForm({ ...pForm, channels: e.target.value })} placeholder="chan-01, chan-02" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">下发配置内容 (JSON)</label>
            <Textarea rows={4} value={pForm.content} onChange={(e) => setPForm({ ...pForm, content: e.target.value })} />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={pForm.encrypted}
              onChange={(e) => setPForm({ ...pForm, encrypted: e.target.checked })}
              className="rounded border-slate-300"
            />
            <span>启用 AES 密文传输</span>
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setProfileModal(false)}>{t.cancel}</Button>
            <Button type="submit" loading={createProfile.isPending}>{t.save}</Button>
          </div>
        </form>
      </Dialog>

      {/* Create Config Modal */}
      <Dialog open={configModal} onClose={() => setConfigModal(false)} title="添加设备引导映射 (Config)">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            createConfig.mutate({
              name: cForm.name,
              device_id: cForm.device_id,
              external_id: cForm.external_id,
              mac_address: cForm.mac_address,
              profile_id: cForm.profile_id,
              status: 'enabled',
            })
          }}
          className="space-y-4"
        >
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">映射名称 *</label>
            <Input required value={cForm.name} onChange={(e) => setCForm({ ...cForm, name: e.target.value })} placeholder="例如：网关 A 现场开箱引导" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">目标设备 ID *</label>
              <Input required value={cForm.device_id} onChange={(e) => setCForm({ ...cForm, device_id: e.target.value })} placeholder="dev-xxx" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">关联方案 *</label>
              <Select value={cForm.profile_id} onChange={(e) => setCForm({ ...cForm, profile_id: e.target.value })} required>
                <option value="">-- 选择引导方案 --</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">外部 ID (External ID)</label>
              <Input value={cForm.external_id} onChange={(e) => setCForm({ ...cForm, external_id: e.target.value })} placeholder="SN-202610-001" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">MAC 地址 (选填)</label>
              <Input value={cForm.mac_address} onChange={(e) => setCForm({ ...cForm, mac_address: e.target.value })} placeholder="00:1A:2B:3C:4D:5E" />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setConfigModal(false)}>{t.cancel}</Button>
            <Button type="submit" loading={createConfig.isPending}>{t.save}</Button>
          </div>
        </form>
      </Dialog>

      <ConfirmDialog
        open={!!deleteProfileId}
        title="确认删除引导方案"
        message="删除该方案后，依赖此方案的新设备将无法获取初始配置，确定要删除吗？"
        loading={deleteProfile.isPending}
        onConfirm={() => {
          if (deleteProfileId) deleteProfile.mutate(deleteProfileId)
        }}
        onClose={() => setDeleteProfileId(null)}
      />

      <ConfirmDialog
        open={!!deleteConfigId}
        title="确认删除设备映射"
        message="确定要删除该设备引导映射记录吗？"
        loading={deleteConfig.isPending}
        onConfirm={() => {
          if (deleteConfigId) deleteConfig.mutate(deleteConfigId)
        }}
        onClose={() => setDeleteConfigId(null)}
      />
    </div>
  )
}
