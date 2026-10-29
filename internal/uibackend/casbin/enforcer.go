// Copyright (c) Abstract Machines
// SPDX-License-Identifier: Apache-2.0

package casbin

import (
	_ "embed"
	"fmt"
	"sync"

	"github.com/casbin/casbin/v2"
	"github.com/casbin/casbin/v2/model"
)

//go:embed rbac_model.conf
var rbacModelConf string

type Manager struct {
	mu       sync.RWMutex
	enforcer *casbin.SyncedEnforcer
}

func NewCasbinManager() (*Manager, error) {
	m, err := model.NewModelFromString(rbacModelConf)
	if err != nil {
		return nil, fmt.Errorf("failed to load casbin model: %w", err)
	}

	e, err := casbin.NewSyncedEnforcer(m)
	if err != nil {
		return nil, fmt.Errorf("failed to create casbin enforcer: %w", err)
	}

	mgr := &Manager{
		enforcer: e,
	}

	if err := mgr.initDefaultPolicies(); err != nil {
		return nil, err
	}

	return mgr, nil
}

func (m *Manager) initDefaultPolicies() error {
	m.mu.Lock()
	defer m.mu.Unlock()

	// Default tenant-level policies:
	// Format: sub (role), dom (tenant/workspace), obj, act
	// Admin has full access to resources under the workspace
	policies := [][]string{
		{"role:admin", "*", "/api/workspaces/*", ".*"},
		{"role:admin", "*", "/api/devices/*", ".*"},
		{"role:admin", "*", "/api/channels/*", ".*"},
		{"role:admin", "*", "/api/groups/*", ".*"},
		{"role:admin", "*", "/api/rules/*", ".*"},
		{"role:admin", "*", "/api/alarms/*", ".*"},
		{"role:admin", "*", "/api/reports/*", ".*"},
		{"role:admin", "*", "/api/bootstraps/*", ".*"},
		{"role:admin", "*", "/api/users/*", ".*"},
		{"role:admin", "*", "/api/roles/*", ".*"},

		// Editor can read and modify entities, but cannot delete or manage roles
		{"role:editor", "*", "/api/devices/*", "GET|POST|PUT|PATCH"},
		{"role:editor", "*", "/api/channels/*", "GET|POST|PUT|PATCH"},
		{"role:editor", "*", "/api/groups/*", "GET|POST|PUT|PATCH"},
		{"role:editor", "*", "/api/rules/*", "GET|POST|PUT|PATCH"},
		{"role:editor", "*", "/api/alarms/*", "GET|POST|PUT|PATCH"},
		{"role:editor", "*", "/api/reports/*", "GET|POST|PUT|PATCH"},
		{"role:editor", "*", "/api/bootstraps/*", "GET|POST|PUT|PATCH"},
		{"role:editor", "*", "/api/workspaces/*", "GET"},

		// Viewer can only read
		{"role:viewer", "*", "/api/devices/*", "GET"},
		{"role:viewer", "*", "/api/channels/*", "GET"},
		{"role:viewer", "*", "/api/groups/*", "GET"},
		{"role:viewer", "*", "/api/rules/*", "GET"},
		{"role:viewer", "*", "/api/alarms/*", "GET"},
		{"role:viewer", "*", "/api/reports/*", "GET"},
		{"role:viewer", "*", "/api/bootstraps/*", "GET"},
		{"role:viewer", "*", "/api/workspaces/*", "GET"},
	}

	for _, p := range policies {
		if _, err := m.enforcer.AddPolicy(p); err != nil {
			return err
		}
	}

	return nil
}

// CheckPermission checks if subject can perform action on object in domain/tenant
func (m *Manager) CheckPermission(sub, dom, obj, act string) (bool, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	// Check domain-specific match first
	allowed, err := m.enforcer.Enforce(sub, dom, obj, act)
	if err != nil {
		return false, err
	}
	if allowed {
		return true, nil
	}

	// Check wildcard domain fallback
	return m.enforcer.Enforce(sub, "*", obj, act)
}

// AddRoleForUserInTenant assigns a role to a user in a specific workspace/tenant
func (m *Manager) AddRoleForUserInTenant(user, role, dom string) (bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.enforcer.AddGroupingPolicy(user, role, dom)
}

// RemoveRoleForUserInTenant removes a role from a user in a specific workspace/tenant
func (m *Manager) RemoveRoleForUserInTenant(user, role, dom string) (bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.enforcer.RemoveGroupingPolicy(user, role, dom)
}

// GetRolesForUserInTenant retrieves roles for a user in a workspace/tenant
func (m *Manager) GetRolesForUserInTenant(user, dom string) []string {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.enforcer.GetRolesForUserInDomain(user, dom)
}

// GetUsersForRoleInTenant retrieves users who have a role in a workspace/tenant
func (m *Manager) GetUsersForRoleInTenant(role, dom string) []string {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.enforcer.GetUsersForRoleInDomain(role, dom)
}

// AddPolicy adds a custom policy rule
func (m *Manager) AddPolicy(sub, dom, obj, act string) (bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.enforcer.AddPolicy(sub, dom, obj, act)
}

// RemovePolicy removes a policy rule
func (m *Manager) RemovePolicy(sub, dom, obj, act string) (bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.enforcer.RemovePolicy(sub, dom, obj, act)
}

// GetPoliciesForTenant returns all policies defined for a specific tenant
func (m *Manager) GetPoliciesForTenant(dom string) [][]string {
	m.mu.RLock()
	defer m.mu.RUnlock()
	policies, _ := m.enforcer.GetFilteredPolicy(1, dom)
	return policies
}
