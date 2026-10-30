export interface User {
  id: string
  email: string
  name: string
  username?: string
  role: string
  status: string
  profile?: Record<string, any>
  verified?: boolean
  created_at: string
}

export interface Workspace {
  id: string
  name: string
  alias: string
  description: string
  status: string
  owner_id: string
  metadata?: Record<string, any>
  created_at: string
  updated_at?: string
}

export interface Device {
  id: string
  name: string
  workspace_id: string
  status: string
  credentials?: {
    secret?: string
    key?: string
  }
  tags?: string[]
  metadata?: Record<string, any>
  parent_id?: string
  device_type?: string
  is_gateway?: boolean
  created_at: string
  updated_at?: string
}

export interface Channel {
  id: string
  name: string
  workspace_id: string
  status: string
  metadata?: Record<string, any>
  created_at: string
  updated_at?: string
}

export interface Connection {
  device_id: string
  channel_id: string
  workspace_id: string
  created_at: string
}

export interface MessageRecord {
  id: string
  channel_id: string
  subtopic?: string
  publisher: string
  protocol: string
  payload: string
  name?: string
  value?: string
  unit?: string
  time: number
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
  metadata?: Record<string, any>
  level?: number
  path?: string
  created_at: string
  updated_at?: string
}

export interface Rule {
  id: string
  name: string
  workspace_id: string
  input_channel: string
  input_topic: string
  logic?: Record<string, any>
  outputs?: Record<string, any>
  status: string
  tags?: string[]
  metadata?: Record<string, any>
  created_at: string
  updated_at?: string
}

export interface Alarm {
  id: string
  workspace_id: string
  device_id?: string
  rule_id?: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  title?: string
  summary: string
  status: 'active' | 'acknowledged' | 'resolved'
  assignee_id?: string
  acknowledged_by?: string
  resolved_by?: string
  history?: string[]
  details?: Record<string, any>
  created_at: string
  updated_at?: string
}

export interface BootstrapProfile {
  id: string
  name: string
  workspace_id: string
  channels?: string[]
  content: string
  encryption_key?: string
  encrypted: boolean
  client_version?: string
  metadata?: Record<string, any>
  created_at: string
  updated_at?: string
}

export interface BootstrapConfig {
  id: string
  external_id: string
  device_id: string
  workspace_id: string
  profile_id: string
  channels?: string[]
  status: string
  name: string
  secure: boolean
  mac_address?: string
  created_at: string
  updated_at?: string
}

export interface DeviceType {
  id: string
  name: string
  workspace_id: string
  kind: string
  description?: string
  metadata?: Record<string, any>
  attributes?: Record<string, any>
  latest_version?: string
  created_at: string
  updated_at?: string
}

export interface DeviceTypeVersion {
  id: string
  device_type_id: string
  version: string
  workspace_id: string
  manifest?: Record<string, any>
  release_note?: string
  status: string
  created_at: string
  updated_at?: string
}

export interface Dashboard {
  id: string
  name: string
  workspace_id: string
  description?: string
  layout?: Record<string, any>
  shareable: boolean
  share_token?: string
  metadata?: Record<string, any>
  created_at: string
  updated_at?: string
}

export interface Report {
  id: string
  name: string
  workspace_id: string
  template_id?: string
  format: string
  time_from?: string
  time_to?: string
  channels?: string[]
  status: string
  members?: string[]
  result?: Record<string, any>
  download_url?: string
  created_at: string
  updated_at?: string
}

export interface Journal {
  id: string
  workspace_id: string
  entity_id: string
  entity_type: string
  operation: string
  attributes?: Record<string, any>
  metadata?: Record<string, any>
  user_id?: string
  created_at: string
}

export interface Invitation {
  id: string
  workspace_id: string
  email: string
  role: string
  token: string
  status: string
  invited_by: string
  expires_at: string
  created_at: string
}

export interface PAT {
  id: string
  name: string
  token: string
  user_id: string
  workspace_id: string
  operations?: string[]
  duration: number
  status: string
  expires_at: string
  created_at: string
}

export interface Page<T> {
  total: number
  offset: number
  limit: number
  items: T[]
}
