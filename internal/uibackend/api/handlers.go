// Copyright (c) Abstract Machines
// SPDX-License-Identifier: Apache-2.0

package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/absmach/magistrala/internal/uibackend/store"
	"github.com/go-chi/chi/v5"
	"github.com/golang-jwt/jwt/v5"
)

type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type LoginResponse struct {
	Token       string          `json:"token"`
	User        store.User      `json:"user"`
	WorkspaceID string          `json:"workspace_id"`
	Workspaces  []store.Workspace `json:"workspaces"`
}

func (s *Server) handlePasswordLogin(w http.ResponseWriter, r *http.Request) {
	var req LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	if req.Email == "" {
		req.Email = "admin@magistrala.local"
	}

	user, exists := s.store.GetUserByEmail(req.Email)
	if !exists {
		user = s.store.SaveUser(store.User{
			Email:  req.Email,
			Name:   req.Email,
			Role:   "admin",
			Status: "enabled",
		})
	}

	workspaces := s.store.ListWorkspaces()
	var defaultWsID string
	if len(workspaces) > 0 {
		defaultWsID = workspaces[0].ID
	}

	// Assign role in default workspace
	_, _ = s.casbin.AddRoleForUserInTenant("user:"+user.ID, "role:admin", defaultWsID)

	token, err := s.generateToken(user, defaultWsID, []string{"role:admin"})
	if err != nil {
		http.Error(w, `{"error":"failed to generate token"}`, http.StatusInternalServerError)
		return
	}

	renderJSON(w, http.StatusOK, LoginResponse{
		Token:       token,
		User:        user,
		WorkspaceID: defaultWsID,
		Workspaces:  workspaces,
	})
}

func (s *Server) handleOIDCLogin(w http.ResponseWriter, r *http.Request) {
	if s.oidcSvc == nil {
		http.Error(w, `{"error":"OIDC provider is not configured. Please set OIDC_ISSUER_URL"}`, http.StatusNotImplemented)
		return
	}

	url, _, err := s.oidcSvc.GetAuthURL()
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"failed to build auth url: %v"}`, err), http.StatusInternalServerError)
		return
	}

	http.Redirect(w, r, url, http.StatusFound)
}

func (s *Server) handleOIDCCallback(w http.ResponseWriter, r *http.Request) {
	if s.oidcSvc == nil {
		http.Error(w, `{"error":"OIDC provider is not configured"}`, http.StatusNotImplemented)
		return
	}

	code := r.URL.Query().Get("code")
	state := r.URL.Query().Get("state")
	if code == "" || state == "" {
		http.Error(w, `{"error":"missing code or state in callback"}`, http.StatusBadRequest)
		return
	}

	userInfo, _, err := s.oidcSvc.ExchangeAndVerify(r.Context(), code, state)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"%v"}`, err), http.StatusUnauthorized)
		return
	}

	// Auto-provision user
	user, exists := s.store.GetUserByEmail(userInfo.Email)
	if !exists {
		user = s.store.SaveUser(store.User{
			Email:  userInfo.Email,
			Name:   userInfo.Name,
			Role:   "editor",
			Status: "enabled",
		})
	}

	workspaces := s.store.ListWorkspaces()
	var defaultWsID string
	if len(workspaces) > 0 {
		defaultWsID = workspaces[0].ID
	}

	// Assign Casbin role
	_, _ = s.casbin.AddRoleForUserInTenant("user:"+user.ID, "role:editor", defaultWsID)

	token, _ := s.generateToken(user, defaultWsID, []string{"role:editor"})

	// Redirect back to UI frontend with token
	redirectTarget := fmt.Sprintf("/?token=%s&workspace_id=%s", token, defaultWsID)
	http.Redirect(w, r, redirectTarget, http.StatusFound)
}

func (s *Server) handleOIDCInfo(w http.ResponseWriter, r *http.Request) {
	if s.oidcSvc == nil {
		renderJSON(w, http.StatusOK, map[string]any{
			"enabled": false,
		})
		return
	}
	cfg := s.oidcSvc.Config()
	renderJSON(w, http.StatusOK, map[string]any{
		"enabled":       true,
		"provider_name": cfg.ProviderName,
		"issuer_url":    cfg.IssuerURL,
		"client_id":     cfg.ClientID,
	})
}

func (s *Server) handleGetMe(w http.ResponseWriter, r *http.Request) {
	claims := r.Context().Value("claims").(*TokenClaims)
	user, exists := s.store.GetUserByEmail(claims.Email)
	if !exists {
		user = store.User{
			ID:    claims.UserID,
			Email: claims.Email,
			Name:  claims.Name,
			Role:  "admin",
		}
	}
	workspaces := s.store.ListWorkspaces()
	renderJSON(w, http.StatusOK, map[string]any{
		"user":         user,
		"workspace_id": claims.WorkspaceID,
		"workspaces":   workspaces,
		"roles":        claims.Roles,
	})
}

func (s *Server) handleSwitchWorkspace(w http.ResponseWriter, r *http.Request) {
	claims := r.Context().Value("claims").(*TokenClaims)
	var body struct {
		WorkspaceID string `json:"workspace_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.WorkspaceID == "" {
		http.Error(w, `{"error":"invalid workspace_id"}`, http.StatusBadRequest)
		return
	}

	user, _ := s.store.GetUserByEmail(claims.Email)
	roles := s.casbin.GetRolesForUserInTenant("user:"+user.ID, body.WorkspaceID)
	if len(roles) == 0 {
		roles = claims.Roles
	}

	token, err := s.generateToken(user, body.WorkspaceID, roles)
	if err != nil {
		http.Error(w, `{"error":"failed to generate token"}`, http.StatusInternalServerError)
		return
	}

	renderJSON(w, http.StatusOK, map[string]any{
		"token":        token,
		"workspace_id": body.WorkspaceID,
	})
}

// Workspaces
func (s *Server) handleListWorkspaces(w http.ResponseWriter, r *http.Request) {
	renderJSON(w, http.StatusOK, s.store.ListWorkspaces())
}

func (s *Server) handleCreateWorkspace(w http.ResponseWriter, r *http.Request) {
	var ws store.Workspace
	if err := json.NewDecoder(r.Body).Decode(&ws); err != nil {
		http.Error(w, `{"error":"invalid body"}`, http.StatusBadRequest)
		return
	}
	claims := r.Context().Value("claims").(*TokenClaims)
	ws.OwnerID = claims.UserID
	ws.Status = "enabled"
	created := s.store.SaveWorkspace(ws)

	// Creator is admin of the new workspace in Casbin
	_, _ = s.casbin.AddRoleForUserInTenant("user:"+claims.UserID, "role:admin", created.ID)

	renderJSON(w, http.StatusCreated, created)
}

func (s *Server) handleGetWorkspace(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	ws, err := s.store.GetWorkspace(id)
	if err != nil {
		http.Error(w, `{"error":"workspace not found"}`, http.StatusNotFound)
		return
	}
	renderJSON(w, http.StatusOK, ws)
}

func (s *Server) handleDeleteWorkspace(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	s.store.DeleteWorkspace(id)
	renderJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

// Devices
func (s *Server) handleListDevices(w http.ResponseWriter, r *http.Request) {
	wsID := r.Context().Value("workspace_id").(string)
	renderJSON(w, http.StatusOK, s.store.ListDevices(wsID))
}

func (s *Server) handleCreateDevice(w http.ResponseWriter, r *http.Request) {
	wsID := r.Context().Value("workspace_id").(string)
	var d store.Device
	if err := json.NewDecoder(r.Body).Decode(&d); err != nil {
		http.Error(w, `{"error":"invalid body"}`, http.StatusBadRequest)
		return
	}
	d.WorkspaceID = wsID
	if d.Status == "" {
		d.Status = "enabled"
	}
	if d.Credentials == nil {
		d.Credentials = map[string]any{"secret": store.GenID("sec")}
	}
	created := s.store.SaveDevice(d)
	renderJSON(w, http.StatusCreated, created)
}

func (s *Server) handleDeleteDevice(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	s.store.DeleteDevice(id)
	renderJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

// Channels
func (s *Server) handleListChannels(w http.ResponseWriter, r *http.Request) {
	wsID := r.Context().Value("workspace_id").(string)
	renderJSON(w, http.StatusOK, s.store.ListChannels(wsID))
}

func (s *Server) handleCreateChannel(w http.ResponseWriter, r *http.Request) {
	wsID := r.Context().Value("workspace_id").(string)
	var c store.Channel
	if err := json.NewDecoder(r.Body).Decode(&c); err != nil {
		http.Error(w, `{"error":"invalid body"}`, http.StatusBadRequest)
		return
	}
	c.WorkspaceID = wsID
	if c.Status == "" {
		c.Status = "enabled"
	}
	created := s.store.SaveChannel(c)
	renderJSON(w, http.StatusCreated, created)
}

func (s *Server) handleDeleteChannel(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	s.store.DeleteChannel(id)
	renderJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

// Groups
func (s *Server) handleListGroups(w http.ResponseWriter, r *http.Request) {
	wsID := r.Context().Value("workspace_id").(string)
	renderJSON(w, http.StatusOK, s.store.ListGroups(wsID))
}

func (s *Server) handleCreateGroup(w http.ResponseWriter, r *http.Request) {
	wsID := r.Context().Value("workspace_id").(string)
	var g store.Group
	if err := json.NewDecoder(r.Body).Decode(&g); err != nil {
		http.Error(w, `{"error":"invalid body"}`, http.StatusBadRequest)
		return
	}
	g.WorkspaceID = wsID
	if g.Status == "" {
		g.Status = "enabled"
	}
	if g.GroupType == "" {
		g.GroupType = "object"
	}
	created := s.store.SaveGroup(g)
	renderJSON(w, http.StatusCreated, created)
}

func (s *Server) handleDeleteGroup(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	s.store.DeleteGroup(id)
	renderJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

// Rules
func (s *Server) handleListRules(w http.ResponseWriter, r *http.Request) {
	wsID := r.Context().Value("workspace_id").(string)
	renderJSON(w, http.StatusOK, s.store.ListRules(wsID))
}

func (s *Server) handleCreateRule(w http.ResponseWriter, r *http.Request) {
	wsID := r.Context().Value("workspace_id").(string)
	var rule store.Rule
	if err := json.NewDecoder(r.Body).Decode(&rule); err != nil {
		http.Error(w, `{"error":"invalid body"}`, http.StatusBadRequest)
		return
	}
	rule.WorkspaceID = wsID
	if rule.Status == "" {
		rule.Status = "enabled"
	}
	created := s.store.SaveRule(rule)
	renderJSON(w, http.StatusCreated, created)
}

func (s *Server) handleDeleteRule(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	s.store.DeleteRule(id)
	renderJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

// Alarms
func (s *Server) handleListAlarms(w http.ResponseWriter, r *http.Request) {
	wsID := r.Context().Value("workspace_id").(string)
	renderJSON(w, http.StatusOK, s.store.ListAlarms(wsID))
}

func (s *Server) handleCreateAlarm(w http.ResponseWriter, r *http.Request) {
	wsID := r.Context().Value("workspace_id").(string)
	var a store.Alarm
	if err := json.NewDecoder(r.Body).Decode(&a); err != nil {
		http.Error(w, `{"error":"invalid body"}`, http.StatusBadRequest)
		return
	}
	a.WorkspaceID = wsID
	if a.Status == "" {
		a.Status = "active"
	}
	created := s.store.SaveAlarm(a)
	renderJSON(w, http.StatusCreated, created)
}

// Users & Casbin Role Assignment
func (s *Server) handleListUsers(w http.ResponseWriter, r *http.Request) {
	wsID := r.Context().Value("workspace_id").(string)
	users := s.store.ListUsers()

	// Decorate with roles in current workspace
	type UserWithRoles struct {
		store.User
		Roles []string `json:"workspace_roles"`
	}
	res := make([]UserWithRoles, 0, len(users))
	for _, u := range users {
		roles := s.casbin.GetRolesForUserInTenant("user:"+u.ID, wsID)
		res = append(res, UserWithRoles{
			User:  u,
			Roles: roles,
		})
	}
	renderJSON(w, http.StatusOK, res)
}

func (s *Server) handleListRoles(w http.ResponseWriter, r *http.Request) {
	wsID := r.Context().Value("workspace_id").(string)
	policies := s.casbin.GetPoliciesForTenant(wsID)
	renderJSON(w, http.StatusOK, map[string]any{
		"workspace_id": wsID,
		"builtin_roles": []map[string]string{
			{"name": "role:admin", "description": "工作区管理员：拥有该租户下所有资源的管理与读写权限"},
			{"name": "role:editor", "description": "操作员：拥有设备/通道/规则/告警等配置编辑权限"},
			{"name": "role:viewer", "description": "观察员：仅具备只读查看权限"},
		},
		"policies": policies,
	})
}

func (s *Server) handleAssignRole(w http.ResponseWriter, r *http.Request) {
	wsID := r.Context().Value("workspace_id").(string)
	var body struct {
		UserID string `json:"user_id"`
		Role   string `json:"role"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.UserID == "" || body.Role == "" {
		http.Error(w, `{"error":"invalid parameters"}`, http.StatusBadRequest)
		return
	}
	_, _ = s.casbin.AddRoleForUserInTenant("user:"+body.UserID, body.Role, wsID)
	renderJSON(w, http.StatusOK, map[string]string{"status": "assigned"})
}

func (s *Server) handleRevokeRole(w http.ResponseWriter, r *http.Request) {
	wsID := r.Context().Value("workspace_id").(string)
	var body struct {
		UserID string `json:"user_id"`
		Role   string `json:"role"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.UserID == "" || body.Role == "" {
		http.Error(w, `{"error":"invalid parameters"}`, http.StatusBadRequest)
		return
	}
	_, _ = s.casbin.RemoveRoleForUserInTenant("user:"+body.UserID, body.Role, wsID)
	renderJSON(w, http.StatusOK, map[string]string{"status": "revoked"})
}

// PATs
func (s *Server) handleListPATs(w http.ResponseWriter, r *http.Request) {
	claims := r.Context().Value("claims").(*TokenClaims)
	renderJSON(w, http.StatusOK, s.store.ListPATs(claims.UserID))
}

func (s *Server) handleCreatePAT(w http.ResponseWriter, r *http.Request) {
	claims := r.Context().Value("claims").(*TokenClaims)
	wsID := r.Context().Value("workspace_id").(string)
	var pat store.PAT
	if err := json.NewDecoder(r.Body).Decode(&pat); err != nil {
		http.Error(w, `{"error":"invalid body"}`, http.StatusBadRequest)
		return
	}
	pat.UserID = claims.UserID
	pat.WorkspaceID = wsID
	pat.Token = "pat_" + store.GenID("token")
	pat.ExpiresAt = time.Now().Add(30 * 24 * time.Hour)
	created := s.store.SavePAT(pat)
	renderJSON(w, http.StatusCreated, created)
}

func (s *Server) handleDeletePAT(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	s.store.DeletePAT(id)
	renderJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

func (s *Server) generateToken(user store.User, wsID string, roles []string) (string, error) {
	claims := &TokenClaims{
		UserID:      user.ID,
		Email:       user.Email,
		Name:        user.Name,
		WorkspaceID: wsID,
		Roles:       roles,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(7 * 24 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Issuer:    "magistrala-ui-backend",
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(s.jwtSecret)
}
