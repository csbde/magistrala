// Copyright (c) Abstract Machines
// SPDX-License-Identifier: Apache-2.0

package store

import (
	"database/sql/driver"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// JSONMap helper for Postgres JSONB columns
type JSONMap map[string]any

func (j JSONMap) Value() (driver.Value, error) {
	if j == nil {
		return "{}", nil
	}
	return json.Marshal(j)
}

func (j *JSONMap) Scan(value any) error {
	if value == nil {
		*j = make(map[string]any)
		return nil
	}
	var bytes []byte
	switch v := value.(type) {
	case []byte:
		bytes = v
	case string:
		bytes = []byte(v)
	default:
		return errors.New("type assertion to []byte or string failed")
	}
	return json.Unmarshal(bytes, j)
}

// GORM Models for PostgreSQL
type WorkspaceModel struct {
	ID          string    `gorm:"primaryKey;size:64" json:"id"`
	Name        string    `gorm:"size:255;not null" json:"name"`
	Alias       string    `gorm:"size:128" json:"alias"`
	Description string    `gorm:"type:text" json:"description"`
	Status      string    `gorm:"size:32;default:'enabled'" json:"status"`
	OwnerID     string    `gorm:"size:64" json:"owner_id"`
	CreatedAt   time.Time `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt   time.Time `gorm:"autoUpdateTime" json:"updated_at"`
}

func (WorkspaceModel) TableName() string { return "mg_workspaces" }

type DeviceModel struct {
	ID          string    `gorm:"primaryKey;size:64" json:"id"`
	Name        string    `gorm:"size:255;not null" json:"name"`
	WorkspaceID string    `gorm:"index;size:64;not null" json:"workspace_id"`
	Status      string    `gorm:"size:32;default:'enabled'" json:"status"`
	Credentials JSONMap   `gorm:"type:jsonb" json:"credentials"`
	Tags        string    `gorm:"type:text" json:"tags"` // comma-separated
	Metadata    JSONMap   `gorm:"type:jsonb" json:"metadata"`
	CreatedAt   time.Time `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt   time.Time `gorm:"autoUpdateTime" json:"updated_at"`
}

func (DeviceModel) TableName() string { return "mg_devices" }

type ChannelModel struct {
	ID          string    `gorm:"primaryKey;size:64" json:"id"`
	Name        string    `gorm:"size:255;not null" json:"name"`
	WorkspaceID string    `gorm:"index;size:64;not null" json:"workspace_id"`
	Status      string    `gorm:"size:32;default:'enabled'" json:"status"`
	Metadata    JSONMap   `gorm:"type:jsonb" json:"metadata"`
	CreatedAt   time.Time `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt   time.Time `gorm:"autoUpdateTime" json:"updated_at"`
}

func (ChannelModel) TableName() string { return "mg_channels" }

type GroupModel struct {
	ID          string    `gorm:"primaryKey;size:64" json:"id"`
	Name        string    `gorm:"size:255;not null" json:"name"`
	WorkspaceID string    `gorm:"index;size:64;not null" json:"workspace_id"`
	GroupType   string    `gorm:"size:32;default:'object'" json:"group_type"`
	ParentID    string    `gorm:"size:64" json:"parent_id,omitempty"`
	Description string    `gorm:"type:text" json:"description"`
	Status      string    `gorm:"size:32;default:'enabled'" json:"status"`
	Metadata    JSONMap   `gorm:"type:jsonb" json:"metadata"`
	CreatedAt   time.Time `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt   time.Time `gorm:"autoUpdateTime" json:"updated_at"`
}

func (GroupModel) TableName() string { return "mg_groups" }

type RuleModel struct {
	ID           string    `gorm:"primaryKey;size:64" json:"id"`
	Name         string    `gorm:"size:255;not null" json:"name"`
	WorkspaceID  string    `gorm:"index;size:64;not null" json:"workspace_id"`
	InputChannel string    `gorm:"size:64" json:"input_channel"`
	InputTopic   string    `gorm:"size:255" json:"input_topic"`
	Logic        JSONMap   `gorm:"type:jsonb" json:"logic"`
	Outputs      JSONMap   `gorm:"type:jsonb" json:"outputs"`
	Status       string    `gorm:"size:32;default:'enabled'" json:"status"`
	CreatedAt    time.Time `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt    time.Time `gorm:"autoUpdateTime" json:"updated_at"`
}

func (RuleModel) TableName() string { return "mg_rules" }

type AlarmModel struct {
	ID          string    `gorm:"primaryKey;size:64" json:"id"`
	WorkspaceID string    `gorm:"index;size:64;not null" json:"workspace_id"`
	RuleID      string    `gorm:"size:64" json:"rule_id"`
	Severity    string    `gorm:"size:32" json:"severity"`
	Status      string    `gorm:"size:32" json:"status"`
	Summary     string    `gorm:"type:text" json:"summary"`
	AssigneeID  string    `gorm:"size:64" json:"assignee_id,omitempty"`
	CreatedAt   time.Time `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt   time.Time `gorm:"autoUpdateTime" json:"updated_at"`
}

func (AlarmModel) TableName() string { return "mg_alarms" }

type UserModel struct {
	ID        string    `gorm:"primaryKey;size:64" json:"id"`
	Email     string    `gorm:"size:255;uniqueIndex;not null" json:"email"`
	Name      string    `gorm:"size:255" json:"name"`
	Role      string    `gorm:"size:64;default:'member'" json:"role"`
	Status    string    `gorm:"size:32;default:'enabled'" json:"status"`
	CreatedAt time.Time `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt time.Time `gorm:"autoUpdateTime" json:"updated_at"`
}

func (UserModel) TableName() string { return "mg_users" }

type PATModel struct {
	ID          string    `gorm:"primaryKey;size:64" json:"id"`
	Name        string    `gorm:"size:255;not null" json:"name"`
	Token       string    `gorm:"size:255;uniqueIndex;not null" json:"token"`
	UserID      string    `gorm:"index;size:64;not null" json:"user_id"`
	WorkspaceID string    `gorm:"index;size:64;not null" json:"workspace_id"`
	ExpiresAt   time.Time `json:"expires_at"`
	CreatedAt   time.Time `gorm:"autoCreateTime" json:"created_at"`
}

func (PATModel) TableName() string { return "mg_pats" }

// Store interface implemented by both MemoryStore and PGStore
type Storage interface {
	ListWorkspaces() []Workspace
	GetWorkspace(id string) (Workspace, error)
	SaveWorkspace(w Workspace) Workspace
	DeleteWorkspace(id string)

	ListDevices(wsID string) []Device
	SaveDevice(d Device) Device
	DeleteDevice(id string)

	ListChannels(wsID string) []Channel
	SaveChannel(c Channel) Channel
	DeleteChannel(id string)

	ListGroups(wsID string) []Group
	SaveGroup(g Group) Group
	DeleteGroup(id string)

	ListRules(wsID string) []Rule
	SaveRule(r Rule) Rule
	DeleteRule(id string)

	ListAlarms(wsID string) []Alarm
	SaveAlarm(a Alarm) Alarm

	ListUsers() []User
	GetUserByEmail(email string) (User, bool)
	SaveUser(u User) User

	ListPATs(userID string) []PAT
	SavePAT(p PAT) PAT
	DeletePAT(id string)
}

type PGStore struct {
	db *gorm.DB
}

func NewPGStore(dsn string) (*PGStore, error) {
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Warn),
	})
	if err != nil {
		return nil, fmt.Errorf("failed to connect to PostgreSQL: %w", err)
	}

	// Auto-migrate tables
	if err := db.AutoMigrate(
		&WorkspaceModel{},
		&DeviceModel{},
		&ChannelModel{},
		&GroupModel{},
		&RuleModel{},
		&AlarmModel{},
		&UserModel{},
		&PATModel{},
	); err != nil {
		return nil, fmt.Errorf("failed to run AutoMigrate: %w", err)
	}

	pgs := &PGStore{db: db}
	pgs.seedInitialData()

	return pgs, nil
}

func (s *PGStore) DB() *gorm.DB {
	return s.db
}

func (s *PGStore) seedInitialData() {
	var count int64
	s.db.Model(&WorkspaceModel{}).Count(&count)
	if count == 0 {
		defaultWs := WorkspaceModel{
			ID:          "ws-default-01",
			Name:        "默认工作空间 (Default Workspace)",
			Alias:       "default",
			Description: "PostgreSQL 持久化多租户空间，已开启 Casbin 租户隔离",
			Status:      "enabled",
			OwnerID:     "usr-admin",
		}
		s.db.Create(&defaultWs)

		adminUser := UserModel{
			ID:     "usr-admin",
			Email:  "admin@magistrala.local",
			Name:   "系统管理员 (Admin)",
			Role:   "admin",
			Status: "enabled",
		}
		s.db.Create(&adminUser)

		dev := DeviceModel{
			ID:          "dev-sensor-01",
			Name:        "智能电表传感器 (Smart Meter)",
			WorkspaceID: "ws-default-01",
			Status:      "enabled",
			Credentials: JSONMap{"secret": "sec_meter_9921"},
			Metadata:    JSONMap{"protocol": "MQTT", "voltage": 220},
		}
		s.db.Create(&dev)

		ch := ChannelModel{
			ID:          "chan-telemetry-01",
			Name:        "遥测上报通道",
			WorkspaceID: "ws-default-01",
			Status:      "enabled",
			Metadata:    JSONMap{"format": "senml+json"},
		}
		s.db.Create(&ch)
	}
}

// Workspaces
func (s *PGStore) ListWorkspaces() []Workspace {
	var rows []WorkspaceModel
	s.db.Order("created_at desc").Find(&rows)
	list := make([]Workspace, len(rows))
	for i, r := range rows {
		list[i] = Workspace{
			ID:          r.ID,
			Name:        r.Name,
			Alias:       r.Alias,
			Description: r.Description,
			Status:      r.Status,
			OwnerID:     r.OwnerID,
			CreatedAt:   r.CreatedAt,
			UpdatedAt:   r.UpdatedAt,
		}
	}
	return list
}

func (s *PGStore) GetWorkspace(id string) (Workspace, error) {
	var r WorkspaceModel
	if err := s.db.First(&r, "id = ?", id).Error; err != nil {
		return Workspace{}, err
	}
	return Workspace{
		ID:          r.ID,
		Name:        r.Name,
		Alias:       r.Alias,
		Description: r.Description,
		Status:      r.Status,
		OwnerID:     r.OwnerID,
		CreatedAt:   r.CreatedAt,
		UpdatedAt:   r.UpdatedAt,
	}, nil
}

func (s *PGStore) SaveWorkspace(w Workspace) Workspace {
	if w.ID == "" {
		w.ID = GenID("ws")
	}
	m := WorkspaceModel{
		ID:          w.ID,
		Name:        w.Name,
		Alias:       w.Alias,
		Description: w.Description,
		Status:      w.Status,
		OwnerID:     w.OwnerID,
	}
	s.db.Save(&m)
	return w
}

func (s *PGStore) DeleteWorkspace(id string) {
	s.db.Delete(&WorkspaceModel{}, "id = ?", id)
}

// Devices
func (s *PGStore) ListDevices(wsID string) []Device {
	var rows []DeviceModel
	q := s.db.Order("created_at desc")
	if wsID != "" {
		q = q.Where("workspace_id = ?", wsID)
	}
	q.Find(&rows)
	list := make([]Device, len(rows))
	for i, r := range rows {
		list[i] = Device{
			ID:          r.ID,
			Name:        r.Name,
			WorkspaceID: r.WorkspaceID,
			Status:      r.Status,
			Credentials: r.Credentials,
			Metadata:    r.Metadata,
			CreatedAt:   r.CreatedAt,
			UpdatedAt:   r.UpdatedAt,
		}
	}
	return list
}

func (s *PGStore) SaveDevice(d Device) Device {
	if d.ID == "" {
		d.ID = GenID("dev")
	}
	m := DeviceModel{
		ID:          d.ID,
		Name:        d.Name,
		WorkspaceID: d.WorkspaceID,
		Status:      d.Status,
		Credentials: d.Credentials,
		Metadata:    d.Metadata,
	}
	s.db.Save(&m)
	return d
}

func (s *PGStore) DeleteDevice(id string) {
	s.db.Delete(&DeviceModel{}, "id = ?", id)
}

// Channels
func (s *PGStore) ListChannels(wsID string) []Channel {
	var rows []ChannelModel
	q := s.db.Order("created_at desc")
	if wsID != "" {
		q = q.Where("workspace_id = ?", wsID)
	}
	q.Find(&rows)
	list := make([]Channel, len(rows))
	for i, r := range rows {
		list[i] = Channel{
			ID:          r.ID,
			Name:        r.Name,
			WorkspaceID: r.WorkspaceID,
			Status:      r.Status,
			Metadata:    r.Metadata,
			CreatedAt:   r.CreatedAt,
			UpdatedAt:   r.UpdatedAt,
		}
	}
	return list
}

func (s *PGStore) SaveChannel(c Channel) Channel {
	if c.ID == "" {
		c.ID = GenID("chan")
	}
	m := ChannelModel{
		ID:          c.ID,
		Name:        c.Name,
		WorkspaceID: c.WorkspaceID,
		Status:      c.Status,
		Metadata:    c.Metadata,
	}
	s.db.Save(&m)
	return c
}

func (s *PGStore) DeleteChannel(id string) {
	s.db.Delete(&ChannelModel{}, "id = ?", id)
}

// Groups
func (s *PGStore) ListGroups(wsID string) []Group {
	var rows []GroupModel
	q := s.db.Order("created_at desc")
	if wsID != "" {
		q = q.Where("workspace_id = ?", wsID)
	}
	q.Find(&rows)
	list := make([]Group, len(rows))
	for i, r := range rows {
		list[i] = Group{
			ID:          r.ID,
			Name:        r.Name,
			WorkspaceID: r.WorkspaceID,
			GroupType:   r.GroupType,
			ParentID:    r.ParentID,
			Description: r.Description,
			Status:      r.Status,
			Metadata:    r.Metadata,
			CreatedAt:   r.CreatedAt,
			UpdatedAt:   r.UpdatedAt,
		}
	}
	return list
}

func (s *PGStore) SaveGroup(g Group) Group {
	if g.ID == "" {
		g.ID = GenID("grp")
	}
	m := GroupModel{
		ID:          g.ID,
		Name:        g.Name,
		WorkspaceID: g.WorkspaceID,
		GroupType:   g.GroupType,
		ParentID:    g.ParentID,
		Description: g.Description,
		Status:      g.Status,
		Metadata:    g.Metadata,
	}
	s.db.Save(&m)
	return g
}

func (s *PGStore) DeleteGroup(id string) {
	s.db.Delete(&GroupModel{}, "id = ?", id)
}

// Rules
func (s *PGStore) ListRules(wsID string) []Rule {
	var rows []RuleModel
	q := s.db.Order("created_at desc")
	if wsID != "" {
		q = q.Where("workspace_id = ?", wsID)
	}
	q.Find(&rows)
	list := make([]Rule, len(rows))
	for i, r := range rows {
		list[i] = Rule{
			ID:           r.ID,
			Name:         r.Name,
			WorkspaceID:  r.WorkspaceID,
			InputChannel: r.InputChannel,
			InputTopic:   r.InputTopic,
			Logic:        r.Logic,
			Outputs:      r.Outputs,
			Status:       r.Status,
			CreatedAt:    r.CreatedAt,
			UpdatedAt:    r.UpdatedAt,
		}
	}
	return list
}

func (s *PGStore) SaveRule(r Rule) Rule {
	if r.ID == "" {
		r.ID = GenID("rule")
	}
	m := RuleModel{
		ID:           r.ID,
		Name:         r.Name,
		WorkspaceID:  r.WorkspaceID,
		InputChannel: r.InputChannel,
		InputTopic:   r.InputTopic,
		Logic:        r.Logic,
		Outputs:      r.Outputs,
		Status:       r.Status,
	}
	s.db.Save(&m)
	return r
}

func (s *PGStore) DeleteRule(id string) {
	s.db.Delete(&RuleModel{}, "id = ?", id)
}

// Alarms
func (s *PGStore) ListAlarms(wsID string) []Alarm {
	var rows []AlarmModel
	q := s.db.Order("created_at desc")
	if wsID != "" {
		q = q.Where("workspace_id = ?", wsID)
	}
	q.Find(&rows)
	list := make([]Alarm, len(rows))
	for i, r := range rows {
		list[i] = Alarm{
			ID:          r.ID,
			WorkspaceID: r.WorkspaceID,
			RuleID:      r.RuleID,
			Severity:    r.Severity,
			Status:      r.Status,
			Summary:     r.Summary,
			AssigneeID:  r.AssigneeID,
			CreatedAt:   r.CreatedAt,
			UpdatedAt:   r.UpdatedAt,
		}
	}
	return list
}

func (s *PGStore) SaveAlarm(a Alarm) Alarm {
	if a.ID == "" {
		a.ID = GenID("alm")
	}
	m := AlarmModel{
		ID:          a.ID,
		WorkspaceID: a.WorkspaceID,
		RuleID:      a.RuleID,
		Severity:    a.Severity,
		Status:      a.Status,
		Summary:     a.Summary,
		AssigneeID:  a.AssigneeID,
	}
	s.db.Save(&m)
	return a
}

// Users
func (s *PGStore) ListUsers() []User {
	var rows []UserModel
	s.db.Order("created_at desc").Find(&rows)
	list := make([]User, len(rows))
	for i, r := range rows {
		list[i] = User{
			ID:        r.ID,
			Email:     r.Email,
			Name:      r.Name,
			Role:      r.Role,
			Status:    r.Status,
			CreatedAt: r.CreatedAt,
			UpdatedAt: r.UpdatedAt,
		}
	}
	return list
}

func (s *PGStore) GetUserByEmail(email string) (User, bool) {
	var r UserModel
	if err := s.db.First(&r, "email = ?", email).Error; err != nil {
		return User{}, false
	}
	return User{
		ID:        r.ID,
		Email:     r.Email,
		Name:      r.Name,
		Role:      r.Role,
		Status:    r.Status,
		CreatedAt: r.CreatedAt,
		UpdatedAt: r.UpdatedAt,
	}, true
}

func (s *PGStore) SaveUser(u User) User {
	if u.ID == "" {
		u.ID = GenID("usr")
	}
	m := UserModel{
		ID:     u.ID,
		Email:  u.Email,
		Name:   u.Name,
		Role:   u.Role,
		Status: u.Status,
	}
	s.db.Save(&m)
	return u
}

// PATs
func (s *PGStore) ListPATs(userID string) []PAT {
	var rows []PATModel
	q := s.db.Order("created_at desc")
	if userID != "" {
		q = q.Where("user_id = ?", userID)
	}
	q.Find(&rows)
	list := make([]PAT, len(rows))
	for i, r := range rows {
		list[i] = PAT{
			ID:          r.ID,
			Name:        r.Name,
			Token:       r.Token,
			UserID:      r.UserID,
			WorkspaceID: r.WorkspaceID,
			ExpiresAt:   r.ExpiresAt,
			CreatedAt:   r.CreatedAt,
		}
	}
	return list
}

func (s *PGStore) SavePAT(p PAT) PAT {
	if p.ID == "" {
		p.ID = GenID("pat")
	}
	m := PATModel{
		ID:          p.ID,
		Name:        p.Name,
		Token:       p.Token,
		UserID:      p.UserID,
		WorkspaceID: p.WorkspaceID,
		ExpiresAt:   p.ExpiresAt,
	}
	s.db.Save(&m)
	return p
}

func (s *PGStore) DeletePAT(id string) {
	s.db.Delete(&PATModel{}, "id = ?", id)
}
