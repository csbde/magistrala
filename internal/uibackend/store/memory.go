// Copyright (c) Abstract Machines
// SPDX-License-Identifier: Apache-2.0

package store

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"sync"
	"time"
)

type User struct {
	ID        string    `json:"id"`
	Email     string    `json:"email"`
	Name      string    `json:"name"`
	Role      string    `json:"role"`
	Status    string    `json:"status"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type Workspace struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	Alias       string    `json:"alias"`
	Description string    `json:"description"`
	Status      string    `json:"status"`
	OwnerID     string    `json:"owner_id"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type Device struct {
	ID          string                 `json:"id"`
	Name        string                 `json:"name"`
	WorkspaceID string                 `json:"workspace_id"`
	Status      string                 `json:"status"`
	Credentials map[string]any         `json:"credentials"`
	Tags        []string               `json:"tags"`
	Metadata    map[string]any         `json:"metadata"`
	CreatedAt   time.Time              `json:"created_at"`
	UpdatedAt   time.Time              `json:"updated_at"`
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

type Group struct {
	ID          string         `json:"id"`
	Name        string         `json:"name"`
	WorkspaceID string         `json:"workspace_id"`
	GroupType   string         `json:"group_type"`
	ParentID    string         `json:"parent_id,omitempty"`
	Description string         `json:"description"`
	Status      string         `json:"status"`
	Metadata    map[string]any `json:"metadata"`
	CreatedAt   time.Time      `json:"created_at"`
	UpdatedAt   time.Time      `json:"updated_at"`
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
	CreatedAt    time.Time      `json:"created_at"`
	UpdatedAt    time.Time      `json:"updated_at"`
}

type Alarm struct {
	ID          string    `json:"id"`
	WorkspaceID string    `json:"workspace_id"`
	RuleID      string    `json:"rule_id"`
	Severity    string    `json:"severity"`
	Status      string    `json:"status"`
	Summary     string    `json:"summary"`
	AssigneeID  string    `json:"assignee_id,omitempty"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type PAT struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	Token       string    `json:"token"`
	UserID      string    `json:"user_id"`
	WorkspaceID string    `json:"workspace_id"`
	ExpiresAt   time.Time `json:"expires_at"`
	CreatedAt   time.Time `json:"created_at"`
}

type MemoryStore struct {
	mu sync.RWMutex

	users      map[string]User
	workspaces map[string]Workspace
	devices    map[string]Device
	channels   map[string]Channel
	groups     map[string]Group
	rules      map[string]Rule
	alarms     map[string]Alarm
	pats       map[string]PAT
}

func NewMemoryStore() *MemoryStore {
	s := &MemoryStore{
		users:      make(map[string]User),
		workspaces: make(map[string]Workspace),
		devices:    make(map[string]Device),
		channels:   make(map[string]Channel),
		groups:     make(map[string]Group),
		rules:      make(map[string]Rule),
		alarms:     make(map[string]Alarm),
		pats:       make(map[string]PAT),
	}

	// Seed default workspace and sample data
	defaultWsID := "ws-default-01"
	s.workspaces[defaultWsID] = Workspace{
		ID:          defaultWsID,
		Name:        "默认工作空间 (Default Workspace)",
		Alias:       "default",
		Description: "系统预设的多租户工作区，已启用多租户隔离与 Casbin 权限保障",
		Status:      "enabled",
		OwnerID:     "usr-admin",
		CreatedAt:   time.Now().Add(-24 * time.Hour),
		UpdatedAt:   time.Now(),
	}

	adminUser := User{
		ID:        "usr-admin",
		Email:     "admin@magistrala.local",
		Name:      "平台管理员 (Admin)",
		Role:      "admin",
		Status:    "enabled",
		CreatedAt: time.Now().Add(-24 * time.Hour),
		UpdatedAt: time.Now(),
	}
	s.users[adminUser.ID] = adminUser

	// Sample devices
	d1 := Device{
		ID:          "dev-mqtt-sensor-01",
		Name:        "温湿度传感器 01 (Sensor-01)",
		WorkspaceID: defaultWsID,
		Status:      "enabled",
		Credentials: map[string]any{"secret": "sec_dev_sens_001"},
		Tags:        []string{"sensor", "temperature", "lora"},
		Metadata:    map[string]any{"protocol": "MQTT", "location": "Building A"},
		CreatedAt:   time.Now().Add(-12 * time.Hour),
		UpdatedAt:   time.Now(),
	}
	s.devices[d1.ID] = d1

	// Sample channel
	c1 := Channel{
		ID:          "chan-telemetry-01",
		Name:        "遥测数据通道 (Telemetry Channel)",
		WorkspaceID: defaultWsID,
		Status:      "enabled",
		Metadata:    map[string]any{"type": "telemetry", "retention": "30d"},
		CreatedAt:   time.Now().Add(-12 * time.Hour),
		UpdatedAt:   time.Now(),
	}
	s.channels[c1.ID] = c1

	// Sample group
	g1 := Group{
		ID:          "grp-devices-factory-1",
		Name:        "智能车间群组 (Workshop Group)",
		WorkspaceID: defaultWsID,
		GroupType:   "object",
		Description: "车间1号区域内全部物联设备",
		Status:      "enabled",
		Metadata:    map[string]any{"zone": "zone-1"},
		CreatedAt:   time.Now().Add(-12 * time.Hour),
		UpdatedAt:   time.Now(),
	}
	s.groups[g1.ID] = g1

	// Sample rule
	r1 := Rule{
		ID:           "rule-temp-warning",
		Name:         "高温告警规则 (Temp Warning)",
		WorkspaceID:  defaultWsID,
		InputChannel: c1.ID,
		InputTopic:   "channels/+/messages",
		Logic:        map[string]any{"condition": "temperature > 40"},
		Outputs:      map[string]any{"action": "create_alarm", "severity": "critical"},
		Status:       "enabled",
		CreatedAt:    time.Now().Add(-6 * time.Hour),
		UpdatedAt:    time.Now(),
	}
	s.rules[r1.ID] = r1

	// Sample alarm
	a1 := Alarm{
		ID:          "alm-001",
		WorkspaceID: defaultWsID,
		RuleID:      r1.ID,
		Severity:    "critical",
		Status:      "active",
		Summary:     "设备 dev-mqtt-sensor-01 温度超过阈值 (42.5°C)",
		AssigneeID:  adminUser.ID,
		CreatedAt:   time.Now().Add(-1 * time.Hour),
		UpdatedAt:   time.Now(),
	}
	s.alarms[a1.ID] = a1

	return s
}

// Helper to generate IDs
func GenID(prefix string) string {
	b := make([]byte, 8)
	_, _ = rand.Read(b)
	return prefix + "-" + hex.EncodeToString(b)
}

// Workspaces
func (s *MemoryStore) ListWorkspaces() []Workspace {
	s.mu.RLock()
	defer s.mu.RUnlock()
	list := make([]Workspace, 0, len(s.workspaces))
	for _, w := range s.workspaces {
		list = append(list, w)
	}
	return list
}

func (s *MemoryStore) GetWorkspace(id string) (Workspace, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	w, ok := s.workspaces[id]
	if !ok {
		return Workspace{}, errors.New("workspace not found")
	}
	return w, nil
}

func (s *MemoryStore) SaveWorkspace(w Workspace) Workspace {
	s.mu.Lock()
	defer s.mu.Unlock()
	if w.ID == "" {
		w.ID = GenID("ws")
	}
	w.UpdatedAt = time.Now()
	if w.CreatedAt.IsZero() {
		w.CreatedAt = w.UpdatedAt
	}
	s.workspaces[w.ID] = w
	return w
}

func (s *MemoryStore) DeleteWorkspace(id string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.workspaces, id)
}

// Devices
func (s *MemoryStore) ListDevices(wsID string) []Device {
	s.mu.RLock()
	defer s.mu.RUnlock()
	var list []Device
	for _, d := range s.devices {
		if wsID == "" || d.WorkspaceID == wsID {
			list = append(list, d)
		}
	}
	return list
}

func (s *MemoryStore) SaveDevice(d Device) Device {
	s.mu.Lock()
	defer s.mu.Unlock()
	if d.ID == "" {
		d.ID = GenID("dev")
	}
	d.UpdatedAt = time.Now()
	if d.CreatedAt.IsZero() {
		d.CreatedAt = d.UpdatedAt
	}
	s.devices[d.ID] = d
	return d
}

func (s *MemoryStore) DeleteDevice(id string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.devices, id)
}

// Channels
func (s *MemoryStore) ListChannels(wsID string) []Channel {
	s.mu.RLock()
	defer s.mu.RUnlock()
	var list []Channel
	for _, c := range s.channels {
		if wsID == "" || c.WorkspaceID == wsID {
			list = append(list, c)
		}
	}
	return list
}

func (s *MemoryStore) SaveChannel(c Channel) Channel {
	s.mu.Lock()
	defer s.mu.Unlock()
	if c.ID == "" {
		c.ID = GenID("chan")
	}
	c.UpdatedAt = time.Now()
	if c.CreatedAt.IsZero() {
		c.CreatedAt = c.UpdatedAt
	}
	s.channels[c.ID] = c
	return c
}

func (s *MemoryStore) DeleteChannel(id string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.channels, id)
}

// Groups
func (s *MemoryStore) ListGroups(wsID string) []Group {
	s.mu.RLock()
	defer s.mu.RUnlock()
	var list []Group
	for _, g := range s.groups {
		if wsID == "" || g.WorkspaceID == wsID {
			list = append(list, g)
		}
	}
	return list
}

func (s *MemoryStore) SaveGroup(g Group) Group {
	s.mu.Lock()
	defer s.mu.Unlock()
	if g.ID == "" {
		g.ID = GenID("grp")
	}
	g.UpdatedAt = time.Now()
	if g.CreatedAt.IsZero() {
		g.CreatedAt = g.UpdatedAt
	}
	s.groups[g.ID] = g
	return g
}

func (s *MemoryStore) DeleteGroup(id string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.groups, id)
}

// Rules
func (s *MemoryStore) ListRules(wsID string) []Rule {
	s.mu.RLock()
	defer s.mu.RUnlock()
	var list []Rule
	for _, r := range s.rules {
		if wsID == "" || r.WorkspaceID == wsID {
			list = append(list, r)
		}
	}
	return list
}

func (s *MemoryStore) SaveRule(r Rule) Rule {
	s.mu.Lock()
	defer s.mu.Unlock()
	if r.ID == "" {
		r.ID = GenID("rule")
	}
	r.UpdatedAt = time.Now()
	if r.CreatedAt.IsZero() {
		r.CreatedAt = r.UpdatedAt
	}
	s.rules[r.ID] = r
	return r
}

func (s *MemoryStore) DeleteRule(id string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.rules, id)
}

// Alarms
func (s *MemoryStore) ListAlarms(wsID string) []Alarm {
	s.mu.RLock()
	defer s.mu.RUnlock()
	var list []Alarm
	for _, a := range s.alarms {
		if wsID == "" || a.WorkspaceID == wsID {
			list = append(list, a)
		}
	}
	return list
}

func (s *MemoryStore) SaveAlarm(a Alarm) Alarm {
	s.mu.Lock()
	defer s.mu.Unlock()
	if a.ID == "" {
		a.ID = GenID("alm")
	}
	a.UpdatedAt = time.Now()
	if a.CreatedAt.IsZero() {
		a.CreatedAt = a.UpdatedAt
	}
	s.alarms[a.ID] = a
	return a
}

// Users
func (s *MemoryStore) ListUsers() []User {
	s.mu.RLock()
	defer s.mu.RUnlock()
	var list []User
	for _, u := range s.users {
		list = append(list, u)
	}
	return list
}

func (s *MemoryStore) GetUserByEmail(email string) (User, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, u := range s.users {
		if u.Email == email {
			return u, true
		}
	}
	return User{}, false
}

func (s *MemoryStore) SaveUser(u User) User {
	s.mu.Lock()
	defer s.mu.Unlock()
	if u.ID == "" {
		u.ID = GenID("usr")
	}
	u.UpdatedAt = time.Now()
	if u.CreatedAt.IsZero() {
		u.CreatedAt = u.UpdatedAt
	}
	s.users[u.ID] = u
	return u
}

// PATs
func (s *MemoryStore) ListPATs(userID string) []PAT {
	s.mu.RLock()
	defer s.mu.RUnlock()
	var list []PAT
	for _, p := range s.pats {
		if userID == "" || p.UserID == userID {
			list = append(list, p)
		}
	}
	return list
}

func (s *MemoryStore) SavePAT(p PAT) PAT {
	s.mu.Lock()
	defer s.mu.Unlock()
	if p.ID == "" {
		p.ID = GenID("pat")
	}
	if p.CreatedAt.IsZero() {
		p.CreatedAt = time.Now()
	}
	s.pats[p.ID] = p
	return p
}

func (s *MemoryStore) DeletePAT(id string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.pats, id)
}
