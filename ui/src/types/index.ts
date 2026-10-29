export interface User {
  id: string
  email: string
  name: string
  role: string
  status: string
  created_at: string
}

export interface Workspace {
  id: string
  name: string
  alias: string
  description: string
  status: string
  owner_id: string
  created_at: string
}

export interface Device {
  id: string
  name: string
  workspace_id: string
  status: string
  credentials?: {
    secret?: string
  }
  tags?: string[]
  metadata?: Record<string, any>
  created_at: string
}

export interface Channel {
  id: string
  name: string
  workspace_id: string
  status: string
  metadata?: Record<string, any>
  created_at: string
}

export interface Group {
  id: string
  name: string
  workspace_id: string
  group_type: 'object' | 'principal'
  parent_id?: string
  description?: string
  status: string
  created_at: string
}

export interface Rule {
  id: string
  name: string
  workspace_id: string
  input_channel: string
  input_topic: string
  status: string
  created_at: string
}

export interface Alarm {
  id: string
  workspace_id: string
  rule_id: string
  severity: string
  status: string
  summary: string
  assignee_id?: string
  created_at: string
}

export interface PAT {
  id: string
  name: string
  token: string
  user_id: string
  workspace_id: string
  expires_at: string
  created_at: string
}
