import React, { useState } from 'react'
import { useAuthStore } from '../store/authStore'
import { fetchApi } from '../lib/api'
import { dict } from '../lib/i18n'
import { ShieldCheck, LogIn, KeyRound } from 'lucide-react'

export const Login: React.FC = () => {
  const { setAuth, language, setLanguage } = useAuthStore()
  const t = dict[language]

  const [email, setEmail] = useState('admin@magistrala.local')
  const [password, setPassword] = useState('12345678')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await fetchApi('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      })
      setAuth(res.token, res.user, res.workspace_id, res.workspaces)
    } catch (err: any) {
      setError(err.message || '登录失败')
    } finally {
      setLoading(false)
    }
  }

  const handleOIDC = () => {
    window.location.href = '/api/auth/oidc/login'
  }

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center items-center gap-3">
          <div className="p-3 bg-blue-600 rounded-2xl shadow-lg shadow-blue-500/30 text-white">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <h2 className="text-3xl font-bold tracking-tight text-white">Magistrala</h2>
        </div>
        <p className="mt-2 text-center text-sm text-slate-400">
          物联网后台管理系统 (支持中文 · Casbin 隔离 · OIDC)
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-slate-800 py-8 px-4 shadow-xl ring-1 ring-white/10 sm:rounded-2xl sm:px-10">
          <div className="flex justify-end mb-4">
            <button
              onClick={() => setLanguage(language === 'zh' ? 'en' : 'zh')}
              className="text-xs text-blue-400 hover:text-blue-300 font-medium px-2 py-1 rounded bg-slate-700/50 border border-slate-600"
            >
              {language === 'zh' ? 'English' : '中文'}
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-lg">
              {error}
            </div>
          )}

          <form className="space-y-5" onSubmit={handleLogin}>
            <div>
              <label className="block text-sm font-medium text-slate-300">
                电子邮箱 / 账号
              </label>
              <div className="mt-1">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="block w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 sm:text-sm"
                  placeholder="admin@magistrala.local"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300">
                密码
              </label>
              <div className="mt-1">
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="block w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 sm:text-sm"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={loading}
                className="flex w-full justify-center items-center gap-2 rounded-lg bg-blue-600 px-3 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-50"
              >
                <LogIn className="w-4 h-4" />
                {loading ? t.loading : t.login}
              </button>
            </div>
          </form>

          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-700" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="bg-slate-800 px-2 text-slate-400">或者使用单点登录</span>
              </div>
            </div>

            <div className="mt-6">
              <button
                type="button"
                onClick={handleOIDC}
                className="flex w-full justify-center items-center gap-2 rounded-lg bg-slate-700 hover:bg-slate-600 px-3 py-2.5 text-sm font-medium text-white shadow-sm border border-slate-600 transition"
              >
                <KeyRound className="w-4 h-4 text-emerald-400" />
                {t.ssoLogin}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
