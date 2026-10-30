// Copyright (c) Abstract Machines
// SPDX-License-Identifier: Apache-2.0

package store

import (
	"errors"
	"fmt"
	"time"

	"github.com/glebarez/sqlite"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// ---------------------------------------------------------------------------
// GORM table models (portable across PostgreSQL and pure-Go SQLite)
// ---------------------------------------------------------------------------

type workspaceRow struct {
	ID          string    `gorm:"primaryKey;size:64"`
	Name        string    `gorm:"size:255;not null"`
	Alias       string    `gorm:"size:128"`
	Description string    `gorm:"type:text"`
	Status      string    `gorm:"size:32;default:'enabled'"`
	Metadata    JSONMap   `gorm:"type:text"`
	OwnerID     string    `gorm:"size:64"`
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

func (workspaceRow) TableName() string { return "mg_workspaces" }

type deviceRow struct {
	ID          string    `gorm:"primaryKey;size:64"`
	Name        string    `gorm:"size:255;not null"`
	WorkspaceID string    `gorm:"index;size:64;not null"`
	Status      string    `gorm:"size:32;default:'enabled'"`
	Credentials JSONMap   `gorm:"type:text"`
	Tags        StringList `gorm:"type:text"`
	Metadata    JSONMap   `gorm:"type:text"`
	ParentID    string    `gorm:"index;size:64"`
	DeviceType  string    `gorm:"size:64"`
	IsGateway   bool      `gorm:"default:false"`
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

func (deviceRow) TableName() string { return "mg_devices" }

type channelRow struct {
	ID          string    `gorm:"primaryKey;size:64"`
	Name        string    `gorm:"size:255;not null"`
	WorkspaceID string    `gorm:"index;size:64;not null"`
	Status      string    `gorm:"size:32;default:'enabled'"`
	Metadata    JSONMap   `gorm:"type:text"`
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

func (channelRow) TableName() string { return "mg_channels" }

type connectionRow struct {
	ID          uint      `gorm:"primaryKey;autoIncrement"`
	DeviceID    string    `gorm:"index;size:64;not null"`
	ChannelID   string    `gorm:"index;size:64;not null"`
	WorkspaceID string    `gorm:"index;size:64;not null"`
	CreatedAt   time.Time
}

func (connectionRow) TableName() string { return "mg_connections" }

type groupRow struct {
	ID          string    `gorm:"primaryKey;size:64"`
	Name        string    `gorm:"size:255;not null"`
	WorkspaceID string    `gorm:"index;size:64;not null"`
	GroupType   string    `gorm:"size:32;default:'object'"`
	ParentID    string    `gorm:"index;size:64"`
	Description string    `gorm:"type:text"`
	Status      string    `gorm:"size:32;default:'enabled'"`
	Metadata    JSONMap   `gorm:"type:text"`
	Level       int       `gorm:"default:0"`
	Path        string    `gorm:"size:512"`
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

func (groupRow) TableName() string { return "mg_groups" }

type groupEntityRow struct {
	ID          uint   `gorm:"primaryKey;autoIncrement"`
	GroupID     string `gorm:"index;size:64;not null"`
	EntityID    string `gorm:"index;size:64;not null"`
	EntityType  string `gorm:"size:32"`
	WorkspaceID string `gorm:"index;size:64;not null"`
}

func (groupEntityRow) TableName() string { return "mg_group_entities" }

type ruleRow struct {
	ID           string     `gorm:"primaryKey;size:64"`
	Name         string     `gorm:"size:255;not null"`
	WorkspaceID  string     `gorm:"index;size:64;not null"`
	InputChannel string     `gorm:"size:64"`
	InputTopic   string     `gorm:"size:255"`
	Logic        JSONMap    `gorm:"type:text"`
	Outputs      JSONMap    `gorm:"type:text"`
	Status       string     `gorm:"size:32;default:'enabled'"`
	Tags         StringList `gorm:"type:text"`
	Metadata     JSONMap    `gorm:"type:text"`
	CreatedAt    time.Time
	UpdatedAt    time.Time
}

func (ruleRow) TableName() string { return "mg_rules" }

type alarmRow struct {
	ID           string     `gorm:"primaryKey;size:64"`
	WorkspaceID  string     `gorm:"index;size:64;not null"`
	DeviceID     string     `gorm:"index;size:64"`
	RuleID       string     `gorm:"size:64"`
	Severity     string     `gorm:"size:32"`
	Title        string     `gorm:"size:255"`
	Summary      string     `gorm:"type:text"`
	Status       string     `gorm:"size:32;default:'active'"`
	AssigneeID   string     `gorm:"size:64"`
	Acknowledger string     `gorm:"size:64"`
	Resolver     string     `gorm:"size:64"`
	History      StringList `gorm:"type:text"`
	Details      JSONMap    `gorm:"type:text"`
	CreatedAt    time.Time
	UpdatedAt    time.Time
}

func (alarmRow) TableName() string { return "mg_alarms" }

type bootstrapProfileRow struct {
	ID            string     `gorm:"primaryKey;size:64"`
	Name          string     `gorm:"size:255;not null"`
	WorkspaceID   string     `gorm:"index;size:64;not null"`
	Channels      StringList `gorm:"type:text"`
	Content       string     `gorm:"type:text"`
	EncryptionKey string     `gorm:"size:255"`
	Encrypted     bool       `gorm:"default:false"`
	ClientVersion string     `gorm:"size:64"`
	Metadata      JSONMap    `gorm:"type:text"`
	CreatedAt     time.Time
	UpdatedAt     time.Time
}

func (bootstrapProfileRow) TableName() string { return "mg_bootstrap_profiles" }

type bootstrapConfigRow struct {
	ID          string     `gorm:"primaryKey;size:64"`
	ExternalID  string     `gorm:"size:255"`
	DeviceID    string     `gorm:"index;size:64"`
	WorkspaceID string     `gorm:"index;size:64;not null"`
	ProfileID   string     `gorm:"index;size:64"`
	Channels    StringList `gorm:"type:text"`
	Status      string     `gorm:"size:32;default:'enabled'"`
	Name        string     `gorm:"size:255"`
	Secure      bool       `gorm:"default:false"`
	MACAddr     string     `gorm:"size:64"`
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

func (bootstrapConfigRow) TableName() string { return "mg_bootstrap_configs" }

type deviceTypeRow struct {
	ID            string    `gorm:"primaryKey;size:64"`
	Name          string    `gorm:"size:255;not null"`
	WorkspaceID   string    `gorm:"index;size:64;not null"`
	Kind          string    `gorm:"size:64"`
	Description   string    `gorm:"type:text"`
	Metadata      JSONMap   `gorm:"type:text"`
	Attributes    JSONMap   `gorm:"type:text"`
	LatestVersion string    `gorm:"size:64"`
	CreatedAt     time.Time
	UpdatedAt     time.Time
}

func (deviceTypeRow) TableName() string { return "mg_device_types" }

type deviceTypeVersionRow struct {
	ID           string    `gorm:"primaryKey;size:64"`
	DeviceTypeID string    `gorm:"index;size:64;not null"`
	Version      string    `gorm:"size:64"`
	WorkspaceID  string    `gorm:"index;size:64;not null"`
	Manifest     JSONMap   `gorm:"type:text"`
	ReleaseNote  string    `gorm:"type:text"`
	Status       string    `gorm:"size:32;default:'released'"`
	CreatedAt    time.Time
	UpdatedAt    time.Time
}

func (deviceTypeVersionRow) TableName() string { return "mg_device_type_versions" }

type reportRow struct {
	ID          string     `gorm:"primaryKey;size:64"`
	Name        string     `gorm:"size:255;not null"`
	WorkspaceID string     `gorm:"index;size:64;not null"`
	TemplateID  string     `gorm:"size:64"`
	Format      string     `gorm:"size:32"`
	TimeFrom    string     `gorm:"size:64"`
	TimeTo      string     `gorm:"size:64"`
	Channels    StringList `gorm:"type:text"`
	Status      string     `gorm:"size:32;default:'pending'"`
	Members     StringList `gorm:"type:text"`
	Result      JSONMap    `gorm:"type:text"`
	DownloadURL string     `gorm:"type:text"`
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

func (reportRow) TableName() string { return "mg_reports" }

type dashboardRow struct {
	ID          string    `gorm:"primaryKey;size:64"`
	Name        string    `gorm:"size:255;not null"`
	WorkspaceID string    `gorm:"index;size:64;not null"`
	Description string    `gorm:"type:text"`
	Layout      JSONMap   `gorm:"type:text"`
	Shareable   bool      `gorm:"default:false"`
	ShareToken  string    `gorm:"index;size:64"`
	Metadata    JSONMap   `gorm:"type:text"`
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

func (dashboardRow) TableName() string { return "mg_dashboards" }

type customNodeRow struct {
	ID          string    `gorm:"primaryKey;size:64"`
	Name        string    `gorm:"size:255;not null"`
	WorkspaceID string    `gorm:"index;size:64;not null"`
	Kind        string    `gorm:"size:32"`
	Runtime     string    `gorm:"size:64"`
	Entry       string    `gorm:"type:text"`
	Size        int64     `gorm:"default:0"`
	Version     string    `gorm:"size:64"`
	Status      string    `gorm:"size:32;default:'enabled'"`
	Metadata    JSONMap   `gorm:"type:text"`
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

func (customNodeRow) TableName() string { return "mg_custom_nodes" }

type messageRow struct {
	ID        string `gorm:"primaryKey;size:64"`
	ChannelID string `gorm:"index;size:64;not null"`
	Subtopic  string `gorm:"size:255"`
	Publisher string `gorm:"index;size:64"`
	Protocol  string `gorm:"size:32"`
	Payload   string `gorm:"type:text"`
	Name      string `gorm:"size:255"`
	Value     string `gorm:"size:255"`
	Unit      string `gorm:"size:32"`
	Time      int64
	CreatedAt time.Time `gorm:"index"`
}

func (messageRow) TableName() string { return "mg_messages" }

type journalRow struct {
	ID          string    `gorm:"primaryKey;size:64"`
	WorkspaceID string    `gorm:"index;size:64;not null"`
	EntityID    string    `gorm:"index;size:64;not null"`
	EntityType  string    `gorm:"size:64"`
	Operation   string    `gorm:"size:255"`
	Attributes  JSONMap   `gorm:"type:text"`
	Metadata    JSONMap   `gorm:"type:text"`
	UserID      string    `gorm:"size:64"`
	CreatedAt   time.Time `gorm:"index"`
}

func (journalRow) TableName() string { return "mg_journals" }

type invitationRow struct {
	ID          string    `gorm:"primaryKey;size:64"`
	WorkspaceID string    `gorm:"index;size:64;not null"`
	Email       string    `gorm:"size:255"`
	Role        string    `gorm:"size:64"`
	Token       string    `gorm:"index;size:64"`
	Status      string    `gorm:"size:32;default:'pending'"`
	InvitedBy   string    `gorm:"size:64"`
	ExpiresAt   time.Time
	CreatedAt   time.Time
}

func (invitationRow) TableName() string { return "mg_invitations" }

type userRow struct {
	ID        string  `gorm:"primaryKey;size:64"`
	Email     string  `gorm:"size:255;uniqueIndex;not null"`
	Name      string  `gorm:"size:255"`
	Username  string  `gorm:"size:128"`
	Role      string  `gorm:"size:64;default:'user'"`
	Status    string  `gorm:"size:32;default:'enabled'"`
	Profile   JSONMap `gorm:"type:text"`
	Verified  bool    `gorm:"default:false"`
	CreatedAt time.Time
	UpdatedAt time.Time
}

func (userRow) TableName() string { return "mg_users" }

type patRow struct {
	ID          string     `gorm:"primaryKey;size:64"`
	Name        string     `gorm:"size:255;not null"`
	Token       string     `gorm:"size:255;uniqueIndex;not null"`
	UserID      string     `gorm:"index;size:64;not null"`
	WorkspaceID string     `gorm:"index;size:64;not null"`
	Operations  StringList `gorm:"type:text"`
	Duration    int        `gorm:"default:30"`
	Status      string     `gorm:"size:32;default:'enabled'"`
	Metadata    JSONMap    `gorm:"type:text"`
	LastUsedAt  *time.Time
	ExpiresAt   time.Time
	CreatedAt   time.Time
}

func (patRow) TableName() string { return "mg_pats" }

type supportTicketRow struct {
	ID        string     `gorm:"primaryKey;size:64"`
	UserID    string     `gorm:"index;size:64"`
	Email     string     `gorm:"size:255"`
	Subject   string     `gorm:"size:255"`
	Message   string     `gorm:"type:text"`
	Status    string     `gorm:"size:32;default:'open'"`
	Labels    StringList `gorm:"type:text"`
	Metadata  JSONMap    `gorm:"type:text"`
	CreatedAt time.Time
}

func (supportTicketRow) TableName() string { return "mg_support_tickets" }

// ---------------------------------------------------------------------------
// DBStore: single GORM implementation for PostgreSQL and SQLite
// ---------------------------------------------------------------------------

var ErrNotFound = errors.New("record not found")

type DBStore struct {
	db *gorm.DB
}

// NewPGStore connects to an external PostgreSQL database.
func NewPGStore(dsn string) (*DBStore, error) {
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Warn),
	})
	if err != nil {
		return nil, fmt.Errorf("failed to connect to PostgreSQL: %w", err)
	}
	return newStore(db)
}

// NewSQLiteStore connects to a pure-Go SQLite database (no CGO required),
// which lets the single binary run without any external database server.
func NewSQLiteStore(path string) (*DBStore, error) {
	db, err := gorm.Open(sqlite.Open(path), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Warn),
	})
	if err != nil {
		return nil, fmt.Errorf("failed to open SQLite database at %s: %w", path, err)
	}
	return newStore(db)
}

func newStore(db *gorm.DB) (*DBStore, error) {
	if err := db.AutoMigrate(
		&workspaceRow{}, &userRow{}, &deviceRow{}, &channelRow{}, &connectionRow{},
		&groupRow{}, &groupEntityRow{}, &ruleRow{}, &alarmRow{},
		&bootstrapProfileRow{}, &bootstrapConfigRow{},
		&deviceTypeRow{}, &deviceTypeVersionRow{}, &reportRow{}, &dashboardRow{},
		&customNodeRow{}, &messageRow{}, &journalRow{}, &invitationRow{},
		&patRow{}, &supportTicketRow{},
	); err != nil {
		return nil, fmt.Errorf("failed to run AutoMigrate: %w", err)
	}

	s := &DBStore{db: db}
	if err := s.seed(); err != nil {
		return nil, err
	}
	return s, nil
}

func (s *DBStore) DB() *gorm.DB { return s.db }

func (s *DBStore) dialect() string { return s.db.Dialector.Name() }

// likeOp returns a case-insensitive LIKE operator for the active dialect.
func (s *DBStore) likeOp() string {
	if s.dialect() == "postgres" {
		return "ILIKE"
	}
	return "LIKE"
}

func (s *DBStore) seed() error {
	var count int64
	if err := s.db.Model(&workspaceRow{}).Count(&count).Error; err != nil {
		return err
	}
	if count > 0 {
		return nil
	}
	return s.seedDemoData()
}
