import { useAuthStore } from '../store/authStore'

export async function fetchApi<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const { token, currentWorkspace, logout } = useAuthStore.getState()

  const headers = new Headers(options.headers || {})
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }
  if (currentWorkspace?.id) {
    headers.set('X-Workspace-Id', currentWorkspace.id)
  }

  const res = await fetch(endpoint, {
    ...options,
    headers,
  })

  if (res.status === 401) {
    logout()
    throw new Error('会话过期，请重新登录')
  }

  if (res.status === 403) {
    throw new Error('Casbin 权限拒绝：当前角色在此工作区无权执行此操作')
  }

  if (!res.ok) {
    let errMsg = `请求失败 (${res.status})`
    try {
      const data = await res.json()
      if (data.error) errMsg = data.error
    } catch {
      // ignore
    }
    throw new Error(errMsg)
  }

  return res.json()
}
