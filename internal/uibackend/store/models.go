// Copyright (c) Abstract Machines
// SPDX-License-Identifier: Apache-2.0

package store

import "time"

type Page[T any] struct {
	Total  int64 `json:"total"`
	Offset int   `json:"offset"`
	Limit  int   `json:"limit"`
	Items  []T   `json:"items"`
}

type QueryFilter struct {
	WorkspaceID string
	Query       string
	Status      string
	ParentID    string
	Kind        string
	Type        string
	Offset      int
	Limit       int
}

type User struct {
	ID        string         `json:"id"`
	Email     string         `json:"email"`
	Name      string         `json:"name"`
	Username  string         `json:"username"`
	Role      string         `json:"role"` // admin | user
	Status    string         `json:"status"` // enabled | disabled
	Profile   map[string]any `json:"profile"`
	Verified  bool           `json:"verified"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
}

type Workspace struct {
	ID          string         `json:"id"`
	Name        string         `json:"name"`
	Alias       string         `json:"alias"`
	Description string         `json:"description"`
	Status      string         `json:"status"`
	Metadata    map[string]any `json:"metadata"`
	OwnerID     string         `json:"owner_id"`
	CreatedAt   time.Time      `json:"created_at"`
	UpdatedAt   time.Time      `json:"updated_at"`
}

type Device struct {
	ID          string         `json:"id"`
	Name        string         `json:"name"`
	WorkspaceID string         `json:"workspace_id"`
	Status      string         `json:"status"`
	Credentials map[string]any `json:"credentials"`
	Tags        []string       `json:"tags"`
	Metadata    map[string]any `json:"metadata"`
	ParentID    string         `json:"parent_id,omitempty"` // Gateway ID if child
	DeviceType  string         `json:"device_type,omitempty"`
	IsGateway   bool           `json:"is_gateway"`
	CreatedAt   time.Time      `json:"created_at"`
	UpdatedAt   time.Time      `json:"updated_at"`
}

type Channel struct {
	ID          string         `json:"id"`
	Name        string         `json:"name"`
	WorkspaceID string         `json:"workspace_id"`
	Status      string         `json:"status"`
	Metadata    map[string]any `json:"metadata"`
	CreatedAt   time.Time      `json:"created_at"`
	UpdatedAt   time.Time      `json:"updated_at"`
}

type Connection struct {
	DeviceID    string    `json:"device_id"`
	ChannelID   string    `json:"channel_id"`
	WorkspaceID string    `json:"workspace_id"`
	CreatedAt   time.Time `json:"created_at"`
}

type Group struct {
	ID          string         `json:"id"`
	Name        string         `json:"name"`
	WorkspaceID string         `json:"workspace_id"`
	GroupType   string         `json:"group_type"` // object | principal
	ParentID    string         `json:"parent_id,omitempty"`
	Description string         `json:"description"`
	Status      string         `json:"status"`
	Metadata    map[string]any `json:"metadata"`
	Level       int            `json:"level"`
	Path        string         `json:"path"`
	CreatedAt   time.Time      `json:"created_at"`
	UpdatedAt   time.Time      `json:"updated_at"`
}

type GroupEntity struct {
	GroupID     string `json:"group_id"`
	EntityID    string `json:"entity_id"`
	EntityType  string `json:"entity_type"` // device | channel | user
	WorkspaceID string `json:"workspace_id"`
}

type Rule struct {
	ID           string         `json:"id"`
	Name         string         `json:"name"`
	WorkspaceID  string         `json:"workspace_id"`
	InputChannel string         `json:"input_channel"`
	InputTopic   string         `json:"input_topic"`
	Logic        map[string]any `json:"logic"`
	Outputs      map[string]any `json:"outputs"`
	Status       string         `json:"status"`
	Tags         []string       `json:"tags"`
	Metadata     map[string]any `json:"metadata"`
	CreatedAt    time.Time      `json:"created_at"`
	UpdatedAt    time.Time      `json:"updated_at"`
}

type Alarm struct {
	ID           string         `json:"id"`
	WorkspaceID  string         `json:"workspace_id"`
	DeviceID     string         `json:"device_id,omitempty"`
	RuleID       string         `json:"rule_id,omitempty"`
	Severity     string         `json:"severity"` // critical | high | medium | low
	Title        string         `json:"title"`
	Summary      string         `json:"summary"`
	Status       string         `json:"status"` // active | acknowledged | resolved
	AssigneeID   string         `json:"assignee_id,omitempty"`
	Acknowledger string         `json:"acknowledged_by,omitempty"`
	Resolver     string         `json:"resolved_by,omitempty"`
	History      []string       `json:"history"`
	Details      map[string]any `json:"details"`
	CreatedAt    time.Time      `json:"created_at"`
	UpdatedAt    time.Time      `json:"updated_at"`
}

type BootstrapProfile struct {
	ID            string         `json:"id"`
	Name          string         `json:"name"`
	WorkspaceID   string         `json:"workspace_id"`
	Channels      []string       `json:"channels"`
	Content       string         `json:"content"`
	EncryptionKey string         `json:"encryption_key,omitempty"`
	Encrypted     bool           `json:"encrypted"`
	ClientVersion string         `json:"client_version,omitempty"`
	Metadata      map[string]any `json:"metadata"`
	CreatedAt     time.Time      `json:"created_at"`
	UpdatedAt     time.Time      `json:"updated_at"`
}

type BootstrapConfig struct {
	ID          string    `json:"id"` // external ID or MAC address
	ExternalID  string    `json:"external_id"`
	DeviceID    string    `json:"device_id"`
	WorkspaceID string    `json:"workspace_id"`
	ProfileID   string    `json:"profile_id"`
	Channels    []string  `json:"channels"`
	Status      string    `json:"status"`
	Name        string    `json:"name"`
	Secure      bool      `json:"secure"`
	MACAddr     string    `json:"mac_address"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type MessageRecord struct {
	ID        string    `json:"id"`
	ChannelID string    `json:"channel_id"`
	Subtopic  string    `json:"subtopic,omitempty"`
	Publisher string    `json:"publisher"`
	Protocol  string    `json:"protocol"`
	Payload   string    `json:"payload"`
	Name      string    `json:"name,omitempty"`
	Value     string    `json:"value,omitempty"`
	Unit      string    `json:"unit,omitempty"`
	Time      int64     `json:"time"`
	CreatedAt time.Time `json:"created_at"`
}

type DeviceType struct {
	ID            string         `json:"id"`
	Name          string         `json:"name"`
	WorkspaceID   string         `json:"workspace_id"`
	Kind          string         `json:"kind"`
	Description   string         `json:"description"`
	Metadata      map[string]any `json:"metadata"`
	Attributes    map[string]any `json:"attributes"`
	LatestVersion string         `json:"latest_version"`
	CreatedAt     time.Time      `json:"created_at"`
	UpdatedAt     time.Time      `json:"updated_at"`
}

type DeviceTypeVersion struct {
	ID           string         `json:"id"`
	DeviceTypeID string         `json:"device_type_id"`
	Version      string         `json:"version"`
	WorkspaceID  string         `json:"workspace_id"`
	Manifest     map[string]any `json:"manifest"`
	ReleaseNote  string         `json:"release_note"`
	Status       string         `json:"status"`
	CreatedAt    time.Time      `json:"created_at"`
	UpdatedAt    time.Time      `json:"updated_at"`
}

type Report struct {
	ID          string         `json:"id"`
	Name        string         `json:"name"`
	WorkspaceID string         `json:"workspace_id"`
	TemplateID  string         `json:"template_id,omitempty"`
	Format      string         `json:"format"`
	TimeFrom    string         `json:"time_from"`
	TimeTo      string         `json:"time_to"`
	Channels    []string       `json:"channels"`
	Status      string         `json:"status"` // pending | generated | failed
	Members     []string       `json:"members"`
	Result      map[string]any `json:"result"`
	DownloadURL string         `json:"download_url,omitempty"`
	CreatedAt   time.Time      `json:"created_at"`
	UpdatedAt   time.Time      `json:"updated_at"`
}

type Dashboard struct {
	ID          string         `json:"id"`
	Name        string         `json:"name"`
	WorkspaceID string         `json:"workspace_id"`
	Description string         `json:"description"`
	Layout      map[string]any `json:"layout"`
	Shareable   bool           `json:"shareable"`
	ShareToken  string         `json:"share_token,omitempty"`
	Metadata    map[string]any `json:"metadata"`
	CreatedAt   time.Time      `json:"created_at"`
	UpdatedAt   time.Time      `json:"updated_at"`
}

type CustomNode struct {
	ID          string         `json:"id"`
	Name        string         `json:"name"`
	WorkspaceID string         `json:"workspace_id"`
	Kind        string         `json:"kind"` // wasm | function | script
	Runtime     string         `json:"runtime"`
	Entry       string         `json:"entry"`
	Size        int64          `json:"size"`
	Version     string         `json:"version"`
	Status      string         `json:"status"`
	Metadata    map[string]any `json:"metadata"`
	CreatedAt   time.Time      `json:"created_at"`
	UpdatedAt   time.Time      `json:"updated_at"`
}

type Journal struct {
	ID          string         `json:"id"`
	WorkspaceID string         `json:"workspace_id"`
	EntityID    string         `json:"entity_id"`
	EntityType  string         `json:"entity_type"`
	Operation   string         `json:"operation"`
	Attributes  map[string]any `json:"attributes"`
	Metadata    map[string]any `json:"metadata"`
	UserID      string         `json:"user_id"`
	CreatedAt   time.Time      `json:"created_at"`
}

type Invitation struct {
	ID          string    `json:"id"`
	WorkspaceID string    `json:"workspace_id"`
	Email       string    `json:"email"`
	Role        string    `json:"role"`
	Token       string    `json:"token"`
	Status      string    `json:"status"` // pending | accepted | expired
	InvitedBy   string    `json:"invited_by"`
	ExpiresAt   time.Time `json:"expires_at"`
	CreatedAt   time.Time `json:"created_at"`
}

type PAT struct {
	ID          string         `json:"id"`
	Name        string         `json:"name"`
	Token       string         `json:"token"`
	UserID      string         `json:"user_id"`
	WorkspaceID string         `json:"workspace_id"`
	Operations  []string       `json:"operations"`
	Duration    int            `json:"duration"`
	Status      string         `json:"status"`
	Metadata    map[string]any `json:"metadata"`
	LastUsedAt  *time.Time     `json:"last_used_at,omitempty"`
	ExpiresAt   time.Time      `json:"expires_at"`
	CreatedAt   time.Time      `json:"created_at"`
}

type SupportTicket struct {
	ID        string         `json:"id"`
	UserID    string         `json:"user_id"`
	Email     string         `json:"email"`
	Subject   string         `json:"subject"`
	Message   string         `json:"message"`
	Status    string         `json:"status"`
	Labels    []string       `json:"labels"`
	Metadata  map[string]any `json:"metadata"`
	CreatedAt time.Time      `json:"created_at"`
}

type Storage interface {
	// Workspaces
	ListWorkspaces(q QueryFilter) Page[Workspace]
	GetWorkspace(id string) (Workspace, error)
	SaveWorkspace(w Workspace) Workspace
	DeleteWorkspace(id string)

	// Devices
	ListDevices(q QueryFilter) Page[Device]
	GetDevice(id string) (Device, error)
	SaveDevice(d Device) Device
	DeleteDevice(id string)
	ResetDeviceSecret(id string) (string, error)

	// Gateways
	ListGateways(q QueryFilter) Page[Device]
	ListGatewayDevices(gatewayID string) []Device
	BindGatewayDevice(gatewayID, deviceID string) error
	UnbindGatewayDevice(gatewayID, deviceID string) error

	// Channels
	ListChannels(q QueryFilter) Page[Channel]
	GetChannel(id string) (Channel, error)
	SaveChannel(c Channel) Channel
	DeleteChannel(id string)

	// Connections
	ConnectChannel(deviceID, channelID, wsID string) error
	DisconnectChannel(deviceID, channelID string) error
	ListDeviceChannels(deviceID string) []Channel
	ListChannelDevices(channelID string) []Device

	// Groups
	ListGroups(q QueryFilter) Page[Group]
	GetGroup(id string) (Group, error)
	SaveGroup(g Group) Group
	DeleteGroup(id string)
	AssignToGroup(groupID, entityID, entityType, wsID string) error
	RemoveFromGroup(groupID, entityID string) error
	ListGroupEntities(groupID, entityType string) []string

	// Rules
	ListRules(q QueryFilter) Page[Rule]
	GetRule(id string) (Rule, error)
	SaveRule(r Rule) Rule
	DeleteRule(id string)

	// Alarms
	ListAlarms(q QueryFilter) Page[Alarm]
	GetAlarm(id string) (Alarm, error)
	SaveAlarm(a Alarm) Alarm
	UpdateAlarmStatus(id, status, actor string) (Alarm, error)
	AssignAlarm(id, assigneeID string) (Alarm, error)

	// Bootstraps
	ListBootstrapProfiles(q QueryFilter) Page[BootstrapProfile]
	GetBootstrapProfile(id string) (BootstrapProfile, error)
	SaveBootstrapProfile(p BootstrapProfile) BootstrapProfile
	DeleteBootstrapProfile(id string)
	ListBootstrapConfigs(q QueryFilter) Page[BootstrapConfig]
	GetBootstrapConfig(id string) (BootstrapConfig, error)
	SaveBootstrapConfig(c BootstrapConfig) BootstrapConfig
	DeleteBootstrapConfig(id string)

	// Device Types
	ListDeviceTypes(q QueryFilter) Page[DeviceType]
	GetDeviceType(id string) (DeviceType, error)
	SaveDeviceType(dt DeviceType) DeviceType
	DeleteDeviceType(id string)
	ListDeviceTypeVersions(typeID string) []DeviceTypeVersion
	SaveDeviceTypeVersion(v DeviceTypeVersion) DeviceTypeVersion
	DeleteDeviceTypeVersion(id string)

	// Reports
	ListReports(q QueryFilter) Page[Report]
	GetReport(id string) (Report, error)
	SaveReport(r Report) Report
	DeleteReport(id string)

	// Dashboards
	ListDashboards(q QueryFilter) Page[Dashboard]
	GetDashboard(id string) (Dashboard, error)
	GetDashboardByShareToken(token string) (Dashboard, error)
	SaveDashboard(d Dashboard) Dashboard
	DeleteDashboard(id string)

	// Custom Nodes
	ListCustomNodes(q QueryFilter) Page[CustomNode]
	GetCustomNode(id string) (CustomNode, error)
	SaveCustomNode(n CustomNode) CustomNode
	DeleteCustomNode(id string)

	// Messages & Telemetry
	SaveMessage(m MessageRecord) MessageRecord
	ListMessages(channelID string, limit int) []MessageRecord

	// Journals
	AddJournal(j Journal) Journal
	ListJournals(entityID string, limit int) []Journal

	// Invitations
	ListInvitations(wsID string) []Invitation
	CreateInvitation(inv Invitation) Invitation
	GetInvitationByToken(token string) (Invitation, error)
	AcceptInvitation(token, userID string) error
	DeleteInvitation(id string)

	// Users & Platform
	ListUsers(q QueryFilter) Page[User]
	GetUser(id string) (User, error)
	GetUserByEmail(email string) (User, bool)
	SaveUser(u User) User
	DeleteUser(id string)

	// PATs
	ListPATs(userID, wsID string) []PAT
	GetPAT(id string) (PAT, error)
	SavePAT(p PAT) PAT
	DeletePAT(id string)

	// Support
	CreateSupportTicket(t SupportTicket) SupportTicket
	ListSupportTickets(userID string) []SupportTicket
}
