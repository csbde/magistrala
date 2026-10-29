import { create } from 'zustand'
import type { User, Workspace } from '../types'

interface AuthState {
  token: string | null
  user: User | null
  currentWorkspace: Workspace | null
  workspaces: Workspace[]
  roles: string[]
  language: 'zh' | 'en'

  setAuth: (token: string, user: User, workspaceId: string, workspaces: Workspace[]) => void
  setCurrentWorkspace: (workspace: Workspace) => void
  setToken: (token: string) => void
  setLanguage: (lang: 'zh' | 'en') => void
  logout: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  token: localStorage.getItem('mg_token'),
  user: localStorage.getItem('mg_user') ? JSON.parse(localStorage.getItem('mg_user')!) : null,
  currentWorkspace: localStorage.getItem('mg_workspace') ? JSON.parse(localStorage.getItem('mg_workspace')!) : null,
  workspaces: [],
  roles: ['role:admin'],
  language: (localStorage.getItem('mg_lang') as 'zh' | 'en') || 'zh',

  setAuth: (token, user, workspaceId, workspaces) => {
    localStorage.setItem('mg_token', token)
    localStorage.setItem('mg_user', JSON.stringify(user))
    const current = workspaces.find((w) => w.id === workspaceId) || workspaces[0] || null
    if (current) {
      localStorage.setItem('mg_workspace', JSON.stringify(current))
    }
    set({
      token,
      user,
      workspaces,
      currentWorkspace: current,
    })
  },

  setCurrentWorkspace: (workspace) => {
    localStorage.setItem('mg_workspace', JSON.stringify(workspace))
    set({ currentWorkspace: workspace })
  },

  setToken: (token) => {
    localStorage.setItem('mg_token', token)
    set({ token })
  },

  setLanguage: (lang) => {
    localStorage.setItem('mg_lang', lang)
    set({ language: lang })
  },

  logout: () => {
    localStorage.removeItem('mg_token')
    localStorage.removeItem('mg_user')
    localStorage.removeItem('mg_workspace')
    set({
      token: null,
      user: null,
      currentWorkspace: null,
      workspaces: [],
      roles: [],
    })
  },
}))
