import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchApi } from '../lib/api'
import { useToast } from '../components/ui/Toast'
import { Button, Input, Select } from '../components/ui/primitives'
import { Sliders, KeyRound, Globe, Shield, Save } from 'lucide-react'

export const SettingsModule: React.FC = () => {
  const qc = useQueryClient()
  const { success, error: toastError } = useToast()

  const { data: rawSettings } = useQuery({
    queryKey: ['/api/system/settings'],
    queryFn: () => fetchApi<Record<string, string>>('/api/system/settings'),
  })

  const [customForm, setCustomForm] = useState<Record<string, string> | null>(null)

  const form = customForm || {
    oidc_provider_name: rawSettings?.oidc_provider_name || 'SSO 单点登录',
    oidc_enabled: rawSettings?.oidc_enabled !== 'false' ? 'true' : 'false',
    oidc_issuer_url: rawSettings?.oidc_issuer_url || '',
    oidc_client_id: rawSettings?.oidc_client_id || '',
    oidc_client_secret: rawSettings?.oidc_client_secret || '',
    oidc_redirect_url: rawSettings?.oidc_redirect_url || '',
    platform_title: rawSettings?.platform_title || '物联网平台',
    login_subtitle: rawSettings?.login_subtitle || '物联网后台管理系统',
  }

  const updateField = (key: string, val: string) => {
    setCustomForm({
      ...form,
      [key]: val,
    })
  }

  const saveMutation = useMutation({
    mutationFn: (payload: Record<string, string>) =>
      fetchApi('/api/system/settings', {
        method: 'PUT',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/system/settings'] })
      success('系统与单点登录配置已保存，登录页面实时生效')
    },
    onError: (err: any) => {
      toastError(err.message || '保存配置失败')
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    saveMutation.mutate(form)
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
          <Sliders className="w-5 h-5 text-blue-600" />
          <span>系统与单点登录配置</span>
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          配置登录认证方式、登录页面按钮文案及第三方统一身份认证中心 (SSO) 对接参数
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* OIDC SSO Card */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <KeyRound className="w-4 h-4 text-emerald-600" />
            <h3 className="text-sm font-bold text-slate-800">单点登录 (SSO) 与登录按钮配置</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                登录界面单点登录按钮名称 *
              </label>
              <Input
                required
                value={form.oidc_provider_name}
                onChange={(e) => updateField('oidc_provider_name', e.target.value)}
                placeholder="例如：统一身份认证登录 / 企业微信登录 / 飞书快捷登录"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                该名称将直接显示在登录界面的单点登录快捷按钮上
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                是否在登录界面展示该按钮
              </label>
              <Select
                value={form.oidc_enabled}
                onChange={(e) => updateField('oidc_enabled', e.target.value)}
              >
                <option value="true">显示 (启用单点登录快捷入口)</option>
                <option value="false">隐藏 (仅使用账号密码登录)</option>
              </Select>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100">
            <div className="text-xs font-semibold text-slate-700 mb-3 flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-blue-600" />
              <span>第三方身份提供商参数 (选填 / 支持从环境变量继承)</span>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-[11px] text-slate-600 mb-1">Issuer URL (认证中心地址)</label>
                <Input
                  value={form.oidc_issuer_url}
                  onChange={(e) => updateField('oidc_issuer_url', e.target.value)}
                  placeholder="https://sso.yourcompany.com/auth/realms/master"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-slate-600 mb-1">Client ID (客户端标识)</label>
                  <Input
                    value={form.oidc_client_id}
                    onChange={(e) => updateField('oidc_client_id', e.target.value)}
                    placeholder="iot-platform"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-600 mb-1">Client Secret (客户端密钥)</label>
                  <Input
                    type="password"
                    value={form.oidc_client_secret}
                    onChange={(e) => updateField('oidc_client_secret', e.target.value)}
                    placeholder="••••••••"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] text-slate-600 mb-1">重定向回调地址 (Redirect URL)</label>
                <Input
                  value={form.oidc_redirect_url}
                  onChange={(e) => updateField('oidc_redirect_url', e.target.value)}
                  placeholder="https://iot.yourdomain.com/api/auth/oidc/callback"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Platform Display Info */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Globe className="w-4 h-4 text-blue-600" />
            <h3 className="text-sm font-bold text-slate-800">平台外观与门户标题</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">平台名称</label>
              <Input
                value={form.platform_title}
                onChange={(e) => updateField('platform_title', e.target.value)}
                placeholder="物联网平台"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">登录页副标题</label>
              <Input
                value={form.login_subtitle}
                onChange={(e) => updateField('login_subtitle', e.target.value)}
                placeholder="物联网后台管理系统"
              />
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <Button type="submit" loading={saveMutation.isPending} className="flex items-center gap-1.5 px-6">
            <Save className="w-4 h-4" />
            <span>保存全部配置</span>
          </Button>
        </div>
      </form>
    </div>
  )
}
