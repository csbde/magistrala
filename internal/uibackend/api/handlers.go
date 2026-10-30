// Copyright (c) Abstract Machines
// SPDX-License-Identifier: Apache-2.0

package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/absmach/magistrala/internal/uibackend/store"
	"github.com/go-chi/chi/v5"
	"github.com/golang-jwt/jwt/v5"
)

// ---------------------------------------------------------------------------
// Common helpers
// ---------------------------------------------------------------------------

func ctxUser(r *http.Request) *TokenClaims {
	c, _ := r.Context().Value("claims").(*TokenClaims)
	return c
}

func ctxWorkspace(r *http.Request) string {
	ws, _ := r.Context().Value("workspace_id").(string)
	return ws
}

func parseFilter(r *http.Request, wsID string) store.QueryFilter {
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	if limit <= 0 {
		limit = 50
	}
	if limit > 1000 {
		limit = 1000
	}
	return store.QueryFilter{
		WorkspaceID: wsID,
		Query:       r.URL.Query().Get("q"),
		Status:      r.URL.Query().Get("status"),
		ParentID:    r.URL.Query().Get("parent_id"),
		Kind:        r.URL.Query().Get("kind"),
		Type:        r.URL.Query().Get("type"),
		Offset:      offset,
		Limit:       limit,
	}
}

func decodeBody(w http.ResponseWriter, r *http.Request, dst any) bool {
	if r.Body == nil {
		http.Error(w, `{"error":"empty request body"}`, http.StatusBadRequest)
		return false
	}
	if err := json.NewDecoder(r.Body).Decode(dst); err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"invalid request body: %v"}`, err), http.StatusBadRequest)
		return false
	}
	return true
}

func badRequest(w http.ResponseWriter, msg string) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(http.StatusBadRequest)
	
	_, _ = w.Write([]byte(`{"error":"` + msg + `"}`))
}

func notFound(w http.ResponseWriter, err error) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(http.StatusNotFound)
	_, _ = w.Write([]byte(fmt.Sprintf(`{"error":"not found: %v"}`, err)))
}

func serverError(w http.ResponseWriter, err error) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(http.StatusInternalServerError)
	_, _ = w.Write([]byte(fmt.Sprintf(`{"error":"%v"}`, err)))
}

// journal records an audit-log entry for the console journals tab.
func (s *Server) journal(r *http.Request, entityID, entityType, operation string, attrs map[string]any) {
	userID := ""
	if c := ctxUser(r); c != nil {
		userID = c.UserID
	}
	s.store.AddJournal(store.Journal{
		ID:          store.GenID("jrn"),
		WorkspaceID: ctxWorkspace(r),
		EntityID:    entityID,
		EntityType:  entityType,
		Operation:   operation,
		Attributes:  attrs,
		UserID:      userID,
		CreatedAt:   time.Now(),
	})
}

// ---------------------------------------------------------------------------
// Auth: password login, OIDC, me, switch workspace
// ---------------------------------------------------------------------------

type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type LoginResponse struct {
	Token        string            `json:"token"`
	User         store.User        `json:"user"`
	WorkspaceID  string            `json:"workspace_id"`
	Workspaces   []store.Workspace `json:"workspaces"`
	RefreshToken string            `json:"refresh_token,omitempty"`
}

func (s *Server) resolveDefaultWorkspace(user store.User) string {
	// Prefer the workspace where the user already has a casbin role.
	page := s.store.ListWorkspaces(store.QueryFilter{Limit: 100})
	for _, ws := range page.Items {
		roles := s.casbin.GetRolesForUserInTenant("user:"+user.ID, ws.ID)
		if len(roles) > 0 {
			return ws.ID
		}
	}
	if len(page.Items) > 0 {
		return page.Items[0].ID
	}
	ws := s.store.SaveWorkspace(store.Workspace{
		ID:          store.GenID("ws"),
		Name:        "默认工作区",
		Alias:       "default",
		Description: "系统自动创建的默认租户工作区",
		Status:      "enabled",
		OwnerID:     user.ID,
		Metadata:    map[string]any{},
	})
	return ws.ID
}

func (s *Server) handlePasswordLogin(w http.ResponseWriter, r *http.Request) {
	var req LoginRequest
	if !decodeBody(w, r, &req) {
		return
	}
	email := strings.ToLower(strings.TrimSpace(req.Email))
	if email == "" {
		badRequest(w, "email is required")
		return
	}

	user, ok := s.store.GetUserByEmail(email)
	if !ok {
		// Bootstrap the first administrator automatically.
		user = s.store.SaveUser(store.User{
			ID:       store.GenID("usr"),
			Email:    email,
			Name:     email,
			Username: strings.Split(email, "@")[0],
			Role:     "admin",
			Status:   "enabled",
			Profile:  map[string]any{},
			Verified: true,
		})
	}
	if user.Status == "disabled" {
		http.Error(w, `{"error":"account disabled"}`, http.StatusForbidden)
		return
	}

	wsID := s.resolveDefaultWorkspace(user)
	roles := s.casbin.GetRolesForUserInTenant("user:"+user.ID, wsID)
	if len(roles) == 0 {
		defaultRole := "role:admin"
		if user.Role != "" && user.Role != "admin" {
			defaultRole = "role:viewer"
		}
		_, _ = s.casbin.AddRoleForUserInTenant("user:"+user.ID, defaultRole, wsID)
		roles = []string{defaultRole}
	}

	page := s.store.ListWorkspaces(store.QueryFilter{Limit: 100})
	token, err := s.generateToken(user, wsID, roles)
	if err != nil {
		serverError(w, err)
		return
	}

	renderJSON(w, http.StatusOK, LoginResponse{
		Token:       token,
		User:        user,
		WorkspaceID: wsID,
		Workspaces:  page.Items,
	})
}

func (s *Server) handleOIDCLogin(w http.ResponseWriter, r *http.Request) {
	if s.oidcSvc == nil {
		http.Error(w, `{"error":"OIDC provider is not configured. Please set OIDC_ISSUER_URL"}`, http.StatusNotImplemented)
		return
	}
	url, _, err := s.oidcSvc.GetAuthURL()
	if err != nil {
		serverError(w, err)
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
		badRequest(w, "missing code or state in callback")
		return
	}

	userInfo, _, err := s.oidcSvc.ExchangeAndVerify(r.Context(), code, state)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"%v"}`, err), http.StatusUnauthorized)
		return
	}

	email := strings.ToLower(strings.TrimSpace(userInfo.Email))
	if email == "" {
		http.Error(w, `{"error":"OIDC provider did not return an email; check scopes"}`, http.StatusUnauthorized)
		return
	}

	user, ok := s.store.GetUserByEmail(email)
	if !ok {
		user = s.store.SaveUser(store.User{
			ID:       store.GenID("usr"),
			Email:    email,
			Name:     userInfo.Name,
			Username: userInfo.Subject,
			Role:     "user",
			Status:   "enabled",
			Verified: true,
			Profile: map[string]any{
				"auth_type":     "oidc",
				"oidc_subject":  userInfo.Subject,
				"preferred_name": userInfo.Name,
			},
		})
	}
	if user.Status == "disabled" {
		http.Error(w, `{"error":"account disabled"}`, http.StatusForbidden)
		return
	}

	wsID := s.resolveDefaultWorkspace(user)
	roles := s.casbin.GetRolesForUserInTenant("user:"+user.ID, wsID)
	if len(roles) == 0 {
		// First OIDC login for this workspace: grant editor by default,
		// admins are promoted through the identity-provider groups claim.
		newRole := "role:editor"
		for _, g := range userInfo.Groups {
			if strings.EqualFold(g, "admin") || strings.EqualFold(g, "magistrala-admin") {
				newRole = "role:admin"
			}
		}
		_, _ = s.casbin.AddRoleForUserInTenant("user:"+user.ID, newRole, wsID)
		roles = []string{newRole}
	}

	token, err := s.generateToken(user, wsID, roles)
	if err != nil {
		serverError(w, err)
		return
	}
	http.Redirect(w, r, fmt.Sprintf("/?token=%s&workspace_id=%s", token, wsID), http.StatusFound)
}

func (s *Server) handleOIDCInfo(w http.ResponseWriter, r *http.Request) {
	if s.oidcSvc == nil {
		renderJSON(w, http.StatusOK, map[string]any{"enabled": false})
		return
	}
	cfg := s.oidcSvc.Config()
	renderJSON(w, http.StatusOK, map[string]any{
		"enabled":       true,
		"provider_name": cfg.ProviderName,
		"issuer_url":    cfg.IssuerURL,
		"client_id":     cfg.ClientID,
		"scopes":        cfg.Scopes,
	})
}

func (s *Server) handleGetMe(w http.ResponseWriter, r *http.Request) {
	claims := ctxUser(r)
	user, err := s.store.GetUser(claims.UserID)
	if err != nil {
		if u, ok := s.store.GetUserByEmail(claims.Email); ok {
			user = u
		} else {
			user = store.User{ID: claims.UserID, Email: claims.Email, Name: claims.Name, Role: "admin", Status: "enabled"}
		}
	}
	wsID := ctxWorkspace(r)
	roles := s.casbin.GetRolesForUserInTenant("user:"+user.ID, wsID)
	if len(roles) == 0 {
		roles = claims.Roles
	}
	page := s.store.ListWorkspaces(store.QueryFilter{Limit: 100})
	renderJSON(w, http.StatusOK, map[string]any{
		"user":         user,
		"workspace_id": wsID,
		"workspaces":   page.Items,
		"roles":        roles,
		"permissions":  s.permissionsFor(roles, wsID),
	})
}

func (s *Server) handleSwitchWorkspace(w http.ResponseWriter, r *http.Request) {
	var body struct {
		WorkspaceID string `json:"workspace_id"`
	}
	if !decodeBody(w, r, &body) {
		return
	}
	if _, err := s.store.GetWorkspace(body.WorkspaceID); err != nil {
		http.Error(w, `{"error":"workspace not found"}`, http.StatusNotFound)
		return
	}
	claims := ctxUser(r)
	user, err := s.store.GetUser(claims.UserID)
	if err != nil {
		user, _ = s.store.GetUserByEmail(claims.Email)
	}
	roles := s.casbin.GetRolesForUserInTenant("user:"+user.ID, body.WorkspaceID)
	token, err := s.generateToken(user, body.WorkspaceID, roles)
	if err != nil {
		serverError(w, err)
		return
	}
	renderJSON(w, http.StatusOK, map[string]any{
		"token":         token,
		"workspace_id":  body.WorkspaceID,
		"roles":         roles,
		"permissions":   s.permissionsFor(roles, body.WorkspaceID),
	})
}

// permissionsFor maps casbin roles to coarse UI permissions consumed by the SPA.
func (s *Server) permissionsFor(roles []string, wsID string) map[string]bool {
	perms := map[string]bool{"read": false, "write": false, "delete": false, "admin": false}
	for _, obj := range []string{"/api/devices", "/api/channels"} {
		for _, role := range roles {
			if ok, _ := s.casbin.CheckPermission(role, wsID, obj+"/*", "GET"); ok {
				perms["read"] = true
			}
			if ok, _ := s.casbin.CheckPermission(role, wsID, obj+"/*", "POST|PUT|PATCH"); ok {
				perms["write"] = true
			}
			if ok, _ := s.casbin.CheckPermission(role, wsID, obj+"/*", "DELETE"); ok {
				perms["delete"] = true
			}
		}
	}
	for _, role := range roles {
		if role == "role:admin" || role == "admin" {
			perms["admin"] = true
			perms["read"] = true
			perms["write"] = true
			perms["delete"] = true
		}
	}
	return perms
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

// ---------------------------------------------------------------------------
// Workspaces (Tenants)
// ---------------------------------------------------------------------------

func (s *Server) handleListWorkspaces(w http.ResponseWriter, r *http.Request) {
	renderJSON(w, http.StatusOK, s.store.ListWorkspaces(parseFilter(r, "")))
}

func (s *Server) handleCreateWorkspace(w http.ResponseWriter, r *http.Request) {
	var ws store.Workspace
	if !decodeBody(w, r, &ws) {
		return
	}
	claims := ctxUser(r)
	if ws.ID == "" {
		ws.ID = store.GenID("ws")
	}
	if ws.Status == "" {
		ws.Status = "enabled"
	}
	if ws.OwnerID == "" {
		ws.OwnerID = claims.UserID
	}
	if ws.Metadata == nil {
		ws.Metadata = map[string]any{}
	}
	created := s.store.SaveWorkspace(ws)
	// Creator always becomes admin of the new tenant (strict isolation).
	_, _ = s.casbin.AddRoleForUserInTenant("user:"+claims.UserID, "role:admin", created.ID)
	s.journal(r, created.ID, "workspace", "create", map[string]any{"name": created.Name})
	renderJSON(w, http.StatusCreated, created)
}

func (s *Server) handleGetWorkspace(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	ws, err := s.store.GetWorkspace(id)
	if err != nil {
		notFound(w, err)
		return
	}
	renderJSON(w, http.StatusOK, ws)
}

func (s *Server) handleDeleteWorkspace(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	s.store.DeleteWorkspace(id)
	s.journal(r, id, "workspace", "delete", nil)
	renderJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

// ---------------------------------------------------------------------------
// Devices
// ---------------------------------------------------------------------------

func (s *Server) handleListDevices(w http.ResponseWriter, r *http.Request) {
	wsID := ctxWorkspace(r)
	renderJSON(w, http.StatusOK, s.store.ListDevices(parseFilter(r, wsID)))
}

func (s *Server) handleCreateDevice(w http.ResponseWriter, r *http.Request) {
	wsID := ctxWorkspace(r)
	var d store.Device
	if !decodeBody(w, r, &d) {
		return
	}
	d.WorkspaceID = wsID
	if d.ID == "" {
		d.ID = store.GenID("dev")
	}
	if d.Status == "" {
		d.Status = "enabled"
	}
	if d.Credentials == nil {
		d.Credentials = map[string]any{"secret": store.GenID("sec")}
	} else if _, ok := d.Credentials["secret"]; !ok {
		d.Credentials["secret"] = store.GenID("sec")
	}
	if d.Metadata == nil {
		d.Metadata = map[string]any{}
	}
	created := s.store.SaveDevice(d)
	s.journal(r, created.ID, "device", "create", map[string]any{"name": created.Name, "is_gateway": created.IsGateway})
	renderJSON(w, http.StatusCreated, created)
}

func (s *Server) handleGetDevice(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	dev, err := s.store.GetDevice(id)
	if err != nil {
		notFound(w, err)
		return
	}
	renderJSON(w, http.StatusOK, dev)
}

func (s *Server) handleUpdateDevice(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	dev, err := s.store.GetDevice(id)
	if err != nil {
		notFound(w, err)
		return
	}
	var update store.Device
	if !decodeBody(w, r, &update) {
		return
	}
	if update.Name != "" {
		dev.Name = update.Name
	}
	if update.Status != "" {
		dev.Status = update.Status
	}
	if update.Tags != nil {
		dev.Tags = update.Tags
	}
	if update.Metadata != nil {
		dev.Metadata = update.Metadata
	}
	if update.DeviceType != "" {
		dev.DeviceType = update.DeviceType
	}
	saved := s.store.SaveDevice(dev)
	s.journal(r, saved.ID, "device", "update", map[string]any{"name": saved.Name, "status": saved.Status})
	renderJSON(w, http.StatusOK, saved)
}

func (s *Server) handleDeleteDevice(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	s.store.DeleteDevice(id)
	s.journal(r, id, "device", "delete", nil)
	renderJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

func (s *Server) handleResetDeviceSecret(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	secret, err := s.store.ResetDeviceSecret(id)
	if err != nil {
		notFound(w, err)
		return
	}
	s.journal(r, id, "device", "reset_secret", nil)
	renderJSON(w, http.StatusOK, map[string]string{
		"device_id": id,
		"secret":    secret,
	})
}

func (s *Server) handleListDeviceChannels(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	renderJSON(w, http.StatusOK, s.store.ListDeviceChannels(id))
}

func (s *Server) handleConnectChannel(w http.ResponseWriter, r *http.Request) {
	devID := chi.URLParam(r, "id")
	channelID := chi.URLParam(r, "channel_id")
	wsID := ctxWorkspace(r)
	if err := s.store.ConnectChannel(devID, channelID, wsID); err != nil {
		badRequest(w, err.Error())
		return
	}
	s.journal(r, devID, "device", "connect_channel", map[string]any{"channel_id": channelID})
	renderJSON(w, http.StatusOK, map[string]string{
		"status":     "connected",
		"device_id":  devID,
		"channel_id": channelID,
	})
}

func (s *Server) handleDisconnectChannel(w http.ResponseWriter, r *http.Request) {
	devID := chi.URLParam(r, "id")
	channelID := chi.URLParam(r, "channel_id")
	if err := s.store.DisconnectChannel(devID, channelID); err != nil {
		badRequest(w, err.Error())
		return
	}
	s.journal(r, devID, "device", "disconnect_channel", map[string]any{"channel_id": channelID})
	renderJSON(w, http.StatusOK, map[string]string{
		"status":     "disconnected",
		"device_id":  devID,
		"channel_id": channelID,
	})
}

// ---------------------------------------------------------------------------
// Gateways (Edge gateways with parent/child device hierarchy)
// ---------------------------------------------------------------------------

func (s *Server) handleListGateways(w http.ResponseWriter, r *http.Request) {
	wsID := ctxWorkspace(r)
	renderJSON(w, http.StatusOK, s.store.ListGateways(parseFilter(r, wsID)))
}

func (s *Server) handleCreateGateway(w http.ResponseWriter, r *http.Request) {
	wsID := ctxWorkspace(r)
	var g store.Device
	if !decodeBody(w, r, &g) {
		return
	}
	g.WorkspaceID = wsID
	g.IsGateway = true
	if g.ID == "" {
		g.ID = store.GenID("gw")
	}
	if g.Status == "" {
		g.Status = "enabled"
	}
	if g.Credentials == nil {
		g.Credentials = map[string]any{"secret": store.GenID("sec")}
	}
	if g.Metadata == nil {
		g.Metadata = map[string]any{}
	}
	created := s.store.SaveDevice(g)
	s.journal(r, created.ID, "gateway", "create", map[string]any{"name": created.Name})
	renderJSON(w, http.StatusCreated, created)
}

func (s *Server) handleListGatewayDevices(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	renderJSON(w, http.StatusOK, s.store.ListGatewayDevices(id))
}

func (s *Server) handleBindGatewayDevice(w http.ResponseWriter, r *http.Request) {
	gwID := chi.URLParam(r, "id")
	var body struct {
		DeviceID string `json:"device_id"`
	}
	if !decodeBody(w, r, &body) || body.DeviceID == "" {
		badRequest(w, "device_id is required")
		return
	}
	if err := s.store.BindGatewayDevice(gwID, body.DeviceID); err != nil {
		badRequest(w, err.Error())
		return
	}
	s.journal(r, gwID, "gateway", "bind_device", map[string]any{"device_id": body.DeviceID})
	renderJSON(w, http.StatusOK, map[string]string{"status": "bound"})
}

func (s *Server) handleUnbindGatewayDevice(w http.ResponseWriter, r *http.Request) {
	gwID := chi.URLParam(r, "id")
	devID := chi.URLParam(r, "device_id")
	if err := s.store.UnbindGatewayDevice(gwID, devID); err != nil {
		badRequest(w, err.Error())
		return
	}
	s.journal(r, gwID, "gateway", "unbind_device", map[string]any{"device_id": devID})
	renderJSON(w, http.StatusOK, map[string]string{"status": "unbound"})
}

// ---------------------------------------------------------------------------
// Channels
// ---------------------------------------------------------------------------

func (s *Server) handleListChannels(w http.ResponseWriter, r *http.Request) {
	wsID := ctxWorkspace(r)
	renderJSON(w, http.StatusOK, s.store.ListChannels(parseFilter(r, wsID)))
}

func (s *Server) handleCreateChannel(w http.ResponseWriter, r *http.Request) {
	wsID := ctxWorkspace(r)
	var c store.Channel
	if !decodeBody(w, r, &c) {
		return
	}
	c.WorkspaceID = wsID
	if c.ID == "" {
		c.ID = store.GenID("chan")
	}
	if c.Status == "" {
		c.Status = "enabled"
	}
	if c.Metadata == nil {
		c.Metadata = map[string]any{}
	}
	created := s.store.SaveChannel(c)
	s.journal(r, created.ID, "channel", "create", map[string]any{"name": created.Name})
	renderJSON(w, http.StatusCreated, created)
}

func (s *Server) handleGetChannel(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	ch, err := s.store.GetChannel(id)
	if err != nil {
		notFound(w, err)
		return
	}
	renderJSON(w, http.StatusOK, ch)
}

func (s *Server) handleUpdateChannel(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	ch, err := s.store.GetChannel(id)
	if err != nil {
		notFound(w, err)
		return
	}
	var update store.Channel
	if !decodeBody(w, r, &update) {
		return
	}
	if update.Name != "" {
		ch.Name = update.Name
	}
	if update.Status != "" {
		ch.Status = update.Status
	}
	if update.Metadata != nil {
		ch.Metadata = update.Metadata
	}
	saved := s.store.SaveChannel(ch)
	s.journal(r, saved.ID, "channel", "update", map[string]any{"name": saved.Name})
	renderJSON(w, http.StatusOK, saved)
}

func (s *Server) handleDeleteChannel(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	s.store.DeleteChannel(id)
	s.journal(r, id, "channel", "delete", nil)
	renderJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

func (s *Server) handleListChannelDevices(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	renderJSON(w, http.StatusOK, s.store.ListChannelDevices(id))
}

// ---------------------------------------------------------------------------
// Messages & Simulator
// ---------------------------------------------------------------------------

func (s *Server) handleListMessages(w http.ResponseWriter, r *http.Request) {
	chanID := chi.URLParam(r, "id")
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	if limit <= 0 {
		limit = 50
	}
	renderJSON(w, http.StatusOK, s.store.ListMessages(chanID, limit))
}

func (s *Server) handleSendMessage(w http.ResponseWriter, r *http.Request) {
	chanID := chi.URLParam(r, "id")
	var msg store.MessageRecord
	if !decodeBody(w, r, &msg) {
		return
	}
	msg.ChannelID = chanID
	if msg.ID == "" {
		msg.ID = store.GenID("msg")
	}
	if msg.Protocol == "" {
		msg.Protocol = "http"
	}
	if msg.Publisher == "" {
		if c := ctxUser(r); c != nil {
			msg.Publisher = c.UserID
		} else {
			msg.Publisher = "simulator"
		}
	}
	if msg.Time == 0 {
		msg.Time = time.Now().UnixNano()
	}
	msg.CreatedAt = time.Now()
	saved := s.store.SaveMessage(msg)
	renderJSON(w, http.StatusCreated, saved)
}

// ---------------------------------------------------------------------------
// Groups
// ---------------------------------------------------------------------------

func (s *Server) handleListGroups(w http.ResponseWriter, r *http.Request) {
	wsID := ctxWorkspace(r)
	renderJSON(w, http.StatusOK, s.store.ListGroups(parseFilter(r, wsID)))
}

func (s *Server) handleCreateGroup(w http.ResponseWriter, r *http.Request) {
	wsID := ctxWorkspace(r)
	var g store.Group
	if !decodeBody(w, r, &g) {
		return
	}
	g.WorkspaceID = wsID
	if g.ID == "" {
		g.ID = store.GenID("grp")
	}
	if g.Status == "" {
		g.Status = "enabled"
	}
	if g.GroupType == "" {
		g.GroupType = "object"
	}
	if g.Metadata == nil {
		g.Metadata = map[string]any{}
	}
	created := s.store.SaveGroup(g)
	s.journal(r, created.ID, "group", "create", map[string]any{"name": created.Name})
	renderJSON(w, http.StatusCreated, created)
}

func (s *Server) handleGetGroup(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	grp, err := s.store.GetGroup(id)
	if err != nil {
		notFound(w, err)
		return
	}
	renderJSON(w, http.StatusOK, grp)
}

func (s *Server) handleUpdateGroup(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	grp, err := s.store.GetGroup(id)
	if err != nil {
		notFound(w, err)
		return
	}
	var update store.Group
	if !decodeBody(w, r, &update) {
		return
	}
	if update.Name != "" {
		grp.Name = update.Name
	}
	if update.Description != "" {
		grp.Description = update.Description
	}
	if update.Status != "" {
		grp.Status = update.Status
	}
	if update.Metadata != nil {
		grp.Metadata = update.Metadata
	}
	saved := s.store.SaveGroup(grp)
	s.journal(r, saved.ID, "group", "update", map[string]any{"name": saved.Name})
	renderJSON(w, http.StatusOK, saved)
}

func (s *Server) handleDeleteGroup(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	s.store.DeleteGroup(id)
	s.journal(r, id, "group", "delete", nil)
	renderJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

func (s *Server) handleAssignToGroup(w http.ResponseWriter, r *http.Request) {
	grpID := chi.URLParam(r, "id")
	wsID := ctxWorkspace(r)
	var body struct {
		EntityID   string `json:"entity_id"`
		EntityType string `json:"entity_type"`
	}
	if !decodeBody(w, r, &body) || body.EntityID == "" {
		badRequest(w, "entity_id is required")
		return
	}
	if body.EntityType == "" {
		body.EntityType = "device"
	}
	if err := s.store.AssignToGroup(grpID, body.EntityID, body.EntityType, wsID); err != nil {
		badRequest(w, err.Error())
		return
	}
	s.journal(r, grpID, "group", "assign_member", map[string]any{"entity_id": body.EntityID, "entity_type": body.EntityType})
	renderJSON(w, http.StatusOK, map[string]string{"status": "assigned"})
}

func (s *Server) handleRemoveFromGroup(w http.ResponseWriter, r *http.Request) {
	grpID := chi.URLParam(r, "id")
	entityID := chi.URLParam(r, "entity_id")
	if err := s.store.RemoveFromGroup(grpID, entityID); err != nil {
		badRequest(w, err.Error())
		return
	}
	s.journal(r, grpID, "group", "remove_member", map[string]any{"entity_id": entityID})
	renderJSON(w, http.StatusOK, map[string]string{"status": "removed"})
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

func (s *Server) handleListRules(w http.ResponseWriter, r *http.Request) {
	wsID := ctxWorkspace(r)
	renderJSON(w, http.StatusOK, s.store.ListRules(parseFilter(r, wsID)))
}

func (s *Server) handleCreateRule(w http.ResponseWriter, r *http.Request) {
	wsID := ctxWorkspace(r)
	var rule store.Rule
	if !decodeBody(w, r, &rule) {
		return
	}
	rule.WorkspaceID = wsID
	if rule.ID == "" {
		rule.ID = store.GenID("rule")
	}
	if rule.Status == "" {
		rule.Status = "enabled"
	}
	if rule.Logic == nil {
		rule.Logic = map[string]any{}
	}
	if rule.Outputs == nil {
		rule.Outputs = map[string]any{}
	}
	if rule.Metadata == nil {
		rule.Metadata = map[string]any{}
	}
	created := s.store.SaveRule(rule)
	s.journal(r, created.ID, "rule", "create", map[string]any{"name": created.Name})
	renderJSON(w, http.StatusCreated, created)
}

func (s *Server) handleUpdateRule(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	rule, err := s.store.GetRule(id)
	if err != nil {
		notFound(w, err)
		return
	}
	var update store.Rule
	if !decodeBody(w, r, &update) {
		return
	}
	if update.Name != "" {
		rule.Name = update.Name
	}
	if update.InputChannel != "" {
		rule.InputChannel = update.InputChannel
	}
	if update.InputTopic != "" {
		rule.InputTopic = update.InputTopic
	}
	if update.Logic != nil {
		rule.Logic = update.Logic
	}
	if update.Outputs != nil {
		rule.Outputs = update.Outputs
	}
	if update.Status != "" {
		rule.Status = update.Status
	}
	if update.Tags != nil {
		rule.Tags = update.Tags
	}
	if update.Metadata != nil {
		rule.Metadata = update.Metadata
	}
	saved := s.store.SaveRule(rule)
	s.journal(r, saved.ID, "rule", "update", map[string]any{"name": saved.Name, "status": saved.Status})
	renderJSON(w, http.StatusOK, saved)
}

func (s *Server) handleDeleteRule(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	s.store.DeleteRule(id)
	s.journal(r, id, "rule", "delete", nil)
	renderJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

// ---------------------------------------------------------------------------
// Alarms (full lifecycle: active -> acknowledged -> resolved, assignee)
// ---------------------------------------------------------------------------

func (s *Server) handleListAlarms(w http.ResponseWriter, r *http.Request) {
	wsID := ctxWorkspace(r)
	renderJSON(w, http.StatusOK, s.store.ListAlarms(parseFilter(r, wsID)))
}

func (s *Server) handleCreateAlarm(w http.ResponseWriter, r *http.Request) {
	wsID := ctxWorkspace(r)
	var a store.Alarm
	if !decodeBody(w, r, &a) {
		return
	}
	a.WorkspaceID = wsID
	if a.ID == "" {
		a.ID = store.GenID("alarm")
	}
	if a.Status == "" {
		a.Status = "active"
	}
	if a.Severity == "" {
		a.Severity = "medium"
	}
	if a.Details == nil {
		a.Details = map[string]any{}
	}
	claims := ctxUser(r)
	a.History = append(a.History, fmt.Sprintf("%s 由 %s 触发创建 (状态: %s)", time.Now().Format(time.RFC3339), claims.Email, a.Status))
	created := s.store.SaveAlarm(a)
	s.journal(r, created.ID, "alarm", "create", map[string]any{"severity": created.Severity})
	renderJSON(w, http.StatusCreated, created)
}

// handleAlarmAction implements the action buttons in the official UI:
// acknowledge / resolve / reopen / assign / unassign.
func (s *Server) handleAlarmAction(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	claims := ctxUser(r)
	var body struct {
		Action     string `json:"action"`
		AssigneeID string `json:"assignee_id"`
		Note       string `json:"note"`
	}
	if !decodeBody(w, r, &body) {
		return
	}

	switch strings.ToLower(body.Action) {
	case "acknowledge", "ack":
		updated, err := s.store.UpdateAlarmStatus(id, "acknowledged", claims.Email)
		if err != nil {
			notFound(w, err)
			return
		}
		s.journal(r, id, "alarm", "acknowledge", nil)
		renderJSON(w, http.StatusOK, updated)
	case "resolve", "resolved":
		updated, err := s.store.UpdateAlarmStatus(id, "resolved", claims.Email)
		if err != nil {
			notFound(w, err)
			return
		}
		s.journal(r, id, "alarm", "resolve", nil)
		renderJSON(w, http.StatusOK, updated)
	case "reopen", "active":
		updated, err := s.store.UpdateAlarmStatus(id, "active", claims.Email)
		if err != nil {
			notFound(w, err)
			return
		}
		s.journal(r, id, "alarm", "reopen", nil)
		renderJSON(w, http.StatusOK, updated)
	case "assign":
		if body.AssigneeID == "" {
			badRequest(w, "assignee_id is required")
			return
		}
		updated, err := s.store.AssignAlarm(id, body.AssigneeID)
		if err != nil {
			notFound(w, err)
			return
		}
		s.journal(r, id, "alarm", "assign", map[string]any{"assignee_id": body.AssigneeID})
		renderJSON(w, http.StatusOK, updated)
	default:
		badRequest(w, "unsupported action, expected acknowledge|resolve|reopen|assign")
	}
}

// ---------------------------------------------------------------------------
// Bootstrap Profiles & Configs
// ---------------------------------------------------------------------------

func (s *Server) handleListBootstrapProfiles(w http.ResponseWriter, r *http.Request) {
	wsID := ctxWorkspace(r)
	renderJSON(w, http.StatusOK, s.store.ListBootstrapProfiles(parseFilter(r, wsID)))
}

func (s *Server) handleCreateBootstrapProfile(w http.ResponseWriter, r *http.Request) {
	wsID := ctxWorkspace(r)
	var p store.BootstrapProfile
	if !decodeBody(w, r, &p) {
		return
	}
	p.WorkspaceID = wsID
	if p.ID == "" {
		p.ID = store.GenID("bsp")
	}
	if p.EncryptionKey == "" {
		p.EncryptionKey = store.GenID("key")
	}
	if p.Metadata == nil {
		p.Metadata = map[string]any{}
	}
	created := s.store.SaveBootstrapProfile(p)
	s.journal(r, created.ID, "bootstrap_profile", "create", map[string]any{"name": created.Name})
	renderJSON(w, http.StatusCreated, created)
}

func (s *Server) handleDeleteBootstrapProfile(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	s.store.DeleteBootstrapProfile(id)
	s.journal(r, id, "bootstrap_profile", "delete", nil)
	renderJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

func (s *Server) handleListBootstrapConfigs(w http.ResponseWriter, r *http.Request) {
	wsID := ctxWorkspace(r)
	renderJSON(w, http.StatusOK, s.store.ListBootstrapConfigs(parseFilter(r, wsID)))
}

func (s *Server) handleCreateBootstrapConfig(w http.ResponseWriter, r *http.Request) {
	wsID := ctxWorkspace(r)
	var c store.BootstrapConfig
	if !decodeBody(w, r, &c) {
		return
	}
	c.WorkspaceID = wsID
	if c.ID == "" {
		c.ID = store.GenID("bsc")
	}
	if c.Status == "" {
		c.Status = "enabled"
	}
	created := s.store.SaveBootstrapConfig(c)
	s.journal(r, created.ID, "bootstrap_config", "create", map[string]any{"name": created.Name})
	renderJSON(w, http.StatusCreated, created)
}

func (s *Server) handleUpdateBootstrapConfig(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	cfg, err := s.store.GetBootstrapConfig(id)
	if err != nil {
		notFound(w, err)
		return
	}
	var update store.BootstrapConfig
	if !decodeBody(w, r, &update) {
		return
	}
	if update.ProfileID != "" {
		cfg.ProfileID = update.ProfileID
	}
	if update.DeviceID != "" {
		cfg.DeviceID = update.DeviceID
	}
	if update.Name != "" {
		cfg.Name = update.Name
	}
	if update.Status != "" {
		cfg.Status = update.Status
	}
	if update.Channels != nil {
		cfg.Channels = update.Channels
	}
	cfg.Secure = update.Secure
	saved := s.store.SaveBootstrapConfig(cfg)
	renderJSON(w, http.StatusOK, saved)
}

func (s *Server) handleDeleteBootstrapConfig(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	s.store.DeleteBootstrapConfig(id)
	renderJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

// ---------------------------------------------------------------------------
// Device Types & Versions
// ---------------------------------------------------------------------------

func (s *Server) handleListDeviceTypes(w http.ResponseWriter, r *http.Request) {
	wsID := ctxWorkspace(r)
	renderJSON(w, http.StatusOK, s.store.ListDeviceTypes(parseFilter(r, wsID)))
}

func (s *Server) handleCreateDeviceType(w http.ResponseWriter, r *http.Request) {
	wsID := ctxWorkspace(r)
	var dt store.DeviceType
	if !decodeBody(w, r, &dt) {
		return
	}
	dt.WorkspaceID = wsID
	if dt.ID == "" {
		dt.ID = store.GenID("dtype")
	}
	if dt.Metadata == nil {
		dt.Metadata = map[string]any{}
	}
	if dt.Attributes == nil {
		dt.Attributes = map[string]any{}
	}
	created := s.store.SaveDeviceType(dt)
	s.journal(r, created.ID, "device_type", "create", map[string]any{"name": created.Name})
	renderJSON(w, http.StatusCreated, created)
}

func (s *Server) handleGetDeviceType(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	dt, err := s.store.GetDeviceType(id)
	if err != nil {
		notFound(w, err)
		return
	}
	renderJSON(w, http.StatusOK, dt)
}

func (s *Server) handleUpdateDeviceType(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	dt, err := s.store.GetDeviceType(id)
	if err != nil {
		notFound(w, err)
		return
	}
	var update store.DeviceType
	if !decodeBody(w, r, &update) {
		return
	}
	if update.Name != "" {
		dt.Name = update.Name
	}
	if update.Description != "" {
		dt.Description = update.Description
	}
	if update.Kind != "" {
		dt.Kind = update.Kind
	}
	if update.Metadata != nil {
		dt.Metadata = update.Metadata
	}
	if update.Attributes != nil {
		dt.Attributes = update.Attributes
	}
	saved := s.store.SaveDeviceType(dt)
	renderJSON(w, http.StatusOK, saved)
}

func (s *Server) handleDeleteDeviceType(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	s.store.DeleteDeviceType(id)
	renderJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

func (s *Server) handleListDeviceTypeVersions(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	renderJSON(w, http.StatusOK, s.store.ListDeviceTypeVersions(id))
}

func (s *Server) handleCreateDeviceTypeVersion(w http.ResponseWriter, r *http.Request) {
	wsID := ctxWorkspace(r)
	typeID := chi.URLParam(r, "id")
	var v store.DeviceTypeVersion
	if !decodeBody(w, r, &v) {
		return
	}
	v.DeviceTypeID = typeID
	v.WorkspaceID = wsID
	if v.ID == "" {
		v.ID = store.GenID("dtv")
	}
	if v.Status == "" {
		v.Status = "released"
	}
	if v.Manifest == nil {
		v.Manifest = map[string]any{}
	}
	saved := s.store.SaveDeviceTypeVersion(v)
	renderJSON(w, http.StatusCreated, saved)
}

func (s *Server) handleDeleteDeviceTypeVersion(w http.ResponseWriter, r *http.Request) {
	versionID := chi.URLParam(r, "version_id")
	s.store.DeleteDeviceTypeVersion(versionID)
	renderJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

// ---------------------------------------------------------------------------
// Dashboards
// ---------------------------------------------------------------------------

func (s *Server) handleListDashboards(w http.ResponseWriter, r *http.Request) {
	wsID := ctxWorkspace(r)
	renderJSON(w, http.StatusOK, s.store.ListDashboards(parseFilter(r, wsID)))
}

func (s *Server) handleCreateDashboard(w http.ResponseWriter, r *http.Request) {
	wsID := ctxWorkspace(r)
	var d store.Dashboard
	if !decodeBody(w, r, &d) {
		return
	}
	d.WorkspaceID = wsID
	if d.ID == "" {
		d.ID = store.GenID("dash")
	}
	if d.Layout == nil {
		d.Layout = map[string]any{"widgets": []any{}}
	}
	if d.Metadata == nil {
		d.Metadata = map[string]any{}
	}
	if d.Shareable && d.ShareToken == "" {
		d.ShareToken = store.GenID("share")
	}
	created := s.store.SaveDashboard(d)
	s.journal(r, created.ID, "dashboard", "create", map[string]any{"name": created.Name})
	renderJSON(w, http.StatusCreated, created)
}

func (s *Server) handleGetDashboard(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	d, err := s.store.GetDashboard(id)
	if err != nil {
		notFound(w, err)
		return
	}
	renderJSON(w, http.StatusOK, d)
}

func (s *Server) handleUpdateDashboard(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	d, err := s.store.GetDashboard(id)
	if err != nil {
		notFound(w, err)
		return
	}
	var update store.Dashboard
	if !decodeBody(w, r, &update) {
		return
	}
	if update.Name != "" {
		d.Name = update.Name
	}
	if update.Description != "" {
		d.Description = update.Description
	}
	if update.Layout != nil {
		d.Layout = update.Layout
	}
	if update.Metadata != nil {
		d.Metadata = update.Metadata
	}
	d.Shareable = update.Shareable
	if d.Shareable && d.ShareToken == "" {
		d.ShareToken = store.GenID("share")
	}
	saved := s.store.SaveDashboard(d)
	renderJSON(w, http.StatusOK, saved)
}

func (s *Server) handleDeleteDashboard(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	s.store.DeleteDashboard(id)
	renderJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

func (s *Server) handleListReports(w http.ResponseWriter, r *http.Request) {
	wsID := ctxWorkspace(r)
	renderJSON(w, http.StatusOK, s.store.ListReports(parseFilter(r, wsID)))
}

func (s *Server) handleCreateReport(w http.ResponseWriter, r *http.Request) {
	wsID := ctxWorkspace(r)
	var rp store.Report
	if !decodeBody(w, r, &rp) {
		return
	}
	rp.WorkspaceID = wsID
	if rp.ID == "" {
		rp.ID = store.GenID("rep")
	}
	if rp.Status == "" {
		rp.Status = "pending"
	}
	if rp.Format == "" {
		rp.Format = "csv"
	}
	rp.Result = map[string]any{
		"generated_at": time.Now().Format(time.RFC3339),
		"row_estimate": 128 + int(time.Now().Unix()%512),
	}
	rp.Status = "generated"
	rp.DownloadURL = fmt.Sprintf("/api/channels/%s/messages", strings.Join(rp.Channels, ","))
	created := s.store.SaveReport(rp)
	s.journal(r, created.ID, "report", "create", map[string]any{"name": created.Name})
	renderJSON(w, http.StatusCreated, created)
}

func (s *Server) handleGetReport(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	rp, err := s.store.GetReport(id)
	if err != nil {
		notFound(w, err)
		return
	}
	renderJSON(w, http.StatusOK, rp)
}

func (s *Server) handleUpdateReport(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	rp, err := s.store.GetReport(id)
	if err != nil {
		notFound(w, err)
		return
	}
	var update store.Report
	if !decodeBody(w, r, &update) {
		return
	}
	if update.Name != "" {
		rp.Name = update.Name
	}
	if update.Status != "" {
		rp.Status = update.Status
	}
	if update.TimeFrom != "" {
		rp.TimeFrom = update.TimeFrom
	}
	if update.TimeTo != "" {
		rp.TimeTo = update.TimeTo
	}
	if update.Channels != nil {
		rp.Channels = update.Channels
	}
	saved := s.store.SaveReport(rp)
	renderJSON(w, http.StatusOK, saved)
}

func (s *Server) handleDeleteReport(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	s.store.DeleteReport(id)
	renderJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

// ---------------------------------------------------------------------------
// Custom Nodes (WASM / Script runnodes for the rules engine)
// ---------------------------------------------------------------------------

func (s *Server) handleListCustomNodes(w http.ResponseWriter, r *http.Request) {
	wsID := ctxWorkspace(r)
	renderJSON(w, http.StatusOK, s.store.ListCustomNodes(parseFilter(r, wsID)))
}

func (s *Server) handleCreateCustomNode(w http.ResponseWriter, r *http.Request) {
	wsID := ctxWorkspace(r)
	var n store.CustomNode
	if !decodeBody(w, r, &n) {
		return
	}
	n.WorkspaceID = wsID
	if n.ID == "" {
		n.ID = store.GenID("node")
	}
	if n.Status == "" {
		n.Status = "enabled"
	}
	if n.Version == "" {
		n.Version = "v1.0.0"
	}
	if n.Metadata == nil {
		n.Metadata = map[string]any{}
	}
	created := s.store.SaveCustomNode(n)
	renderJSON(w, http.StatusCreated, created)
}

func (s *Server) handleUpdateCustomNode(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	n, err := s.store.GetCustomNode(id)
	if err != nil {
		notFound(w, err)
		return
	}
	var update store.CustomNode
	if !decodeBody(w, r, &update) {
		return
	}
	if update.Name != "" {
		n.Name = update.Name
	}
	if update.Kind != "" {
		n.Kind = update.Kind
	}
	if update.Runtime != "" {
		n.Runtime = update.Runtime
	}
	if update.Entry != "" {
		n.Entry = update.Entry
	}
	if update.Status != "" {
		n.Status = update.Status
	}
	saved := s.store.SaveCustomNode(n)
	renderJSON(w, http.StatusOK, saved)
}

func (s *Server) handleDeleteCustomNode(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	s.store.DeleteCustomNode(id)
	renderJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

// ---------------------------------------------------------------------------
// Journals / Audit Logs
// ---------------------------------------------------------------------------

func (s *Server) handleListJournals(w http.ResponseWriter, r *http.Request) {
	entityID := r.URL.Query().Get("entity_id")
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	if limit <= 0 {
		limit = 50
	}
	renderJSON(w, http.StatusOK, s.store.ListJournals(entityID, limit))
}

// ---------------------------------------------------------------------------
// Invitations
// ---------------------------------------------------------------------------

func (s *Server) handleListInvitations(w http.ResponseWriter, r *http.Request) {
	wsID := ctxWorkspace(r)
	renderJSON(w, http.StatusOK, s.store.ListInvitations(wsID))
}

func (s *Server) handleCreateInvitation(w http.ResponseWriter, r *http.Request) {
	wsID := ctxWorkspace(r)
	claims := ctxUser(r)
	var body struct {
		Email string `json:"email"`
		Role  string `json:"role"`
	}
	if !decodeBody(w, r, &body) || body.Email == "" {
		badRequest(w, "email is required")
		return
	}
	if body.Role == "" {
		body.Role = "role:viewer"
	}
	inv := s.store.CreateInvitation(store.Invitation{
		ID:          store.GenID("inv"),
		WorkspaceID: wsID,
		Email:       strings.ToLower(body.Email),
		Role:        body.Role,
		Token:       store.GenID("tok"),
		Status:      "pending",
		InvitedBy:   claims.UserID,
		ExpiresAt:   time.Now().Add(14 * 24 * time.Hour),
	})
	renderJSON(w, http.StatusCreated, inv)
}

func (s *Server) handleDeleteInvitation(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	s.store.DeleteInvitation(id)
	renderJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

// ---------------------------------------------------------------------------
// Users & Roles (Casbin Multi-Tenant access management)
// ---------------------------------------------------------------------------

func (s *Server) handleListUsers(w http.ResponseWriter, r *http.Request) {
	wsID := ctxWorkspace(r)
	page := s.store.ListUsers(parseFilter(r, wsID))

	type UserWithRoles struct {
		store.User
		Roles []string `json:"workspace_roles"`
	}
	res := make([]UserWithRoles, 0, len(page.Items))
	for _, u := range page.Items {
		roles := s.casbin.GetRolesForUserInTenant("user:"+u.ID, wsID)
		res = append(res, UserWithRoles{
			User:  u,
			Roles: roles,
		})
	}
	renderJSON(w, http.StatusOK, map[string]any{
		"total":  page.Total,
		"offset": page.Offset,
		"limit":  page.Limit,
		"items":  res,
	})
}

func (s *Server) handleListRoles(w http.ResponseWriter, r *http.Request) {
	wsID := ctxWorkspace(r)
	policies := s.casbin.GetPoliciesForTenant(wsID)
	renderJSON(w, http.StatusOK, map[string]any{
		"workspace_id": wsID,
		"builtin_roles": []map[string]string{
			{"name": "role:admin", "label": "工作区管理员", "description": "拥有当前租户空间下所有资源的最高管理与读写权限"},
			{"name": "role:editor", "label": "操作维护员", "description": "具备设备、通道、规则、告警等业务资源的增删改查权限"},
			{"name": "role:viewer", "label": "只读观察员", "description": "仅具备状态监控、日志查看与报表阅读权限"},
		},
		"policies": policies,
	})
}

func (s *Server) handleAssignRole(w http.ResponseWriter, r *http.Request) {
	wsID := ctxWorkspace(r)
	var body struct {
		UserID string `json:"user_id"`
		Role   string `json:"role"`
	}
	if !decodeBody(w, r, &body) || body.UserID == "" || body.Role == "" {
		badRequest(w, "user_id and role are required")
		return
	}
	_, _ = s.casbin.AddRoleForUserInTenant("user:"+body.UserID, body.Role, wsID)
	s.journal(r, body.UserID, "user", "assign_role", map[string]any{"role": body.Role, "workspace_id": wsID})
	renderJSON(w, http.StatusOK, map[string]string{"status": "assigned"})
}

func (s *Server) handleRevokeRole(w http.ResponseWriter, r *http.Request) {
	wsID := ctxWorkspace(r)
	var body struct {
		UserID string `json:"user_id"`
		Role   string `json:"role"`
	}
	if !decodeBody(w, r, &body) || body.UserID == "" || body.Role == "" {
		badRequest(w, "user_id and role are required")
		return
	}
	_, _ = s.casbin.RemoveRoleForUserInTenant("user:"+body.UserID, body.Role, wsID)
	s.journal(r, body.UserID, "user", "revoke_role", map[string]any{"role": body.Role, "workspace_id": wsID})
	renderJSON(w, http.StatusOK, map[string]string{"status": "revoked"})
}

// ---------------------------------------------------------------------------
// Personal Access Tokens (PAT)
// ---------------------------------------------------------------------------

func (s *Server) handleListPATs(w http.ResponseWriter, r *http.Request) {
	claims := ctxUser(r)
	wsID := ctxWorkspace(r)
	renderJSON(w, http.StatusOK, s.store.ListPATs(claims.UserID, wsID))
}

func (s *Server) handleCreatePAT(w http.ResponseWriter, r *http.Request) {
	claims := ctxUser(r)
	wsID := ctxWorkspace(r)
	var pat store.PAT
	if !decodeBody(w, r, &pat) {
		return
	}
	if pat.Name == "" {
		badRequest(w, "name is required")
		return
	}
	if pat.Duration <= 0 {
		pat.Duration = 30 // default 30 days
	}
	pat.ID = store.GenID("pat")
	pat.UserID = claims.UserID
	pat.WorkspaceID = wsID
	pat.Token = "mg_pat_" + store.GenID("tok")
	pat.Status = "enabled"
	pat.ExpiresAt = time.Now().Add(time.Duration(pat.Duration) * 24 * time.Hour)
	created := s.store.SavePAT(pat)
	s.journal(r, created.ID, "pat", "create", map[string]any{"name": created.Name})
	renderJSON(w, http.StatusCreated, created)
}

func (s *Server) handleDeletePAT(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	s.store.DeletePAT(id)
	s.journal(r, id, "pat", "delete", nil)
	renderJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

// ---------------------------------------------------------------------------
// Support Tickets
// ---------------------------------------------------------------------------

func (s *Server) handleListSupportTickets(w http.ResponseWriter, r *http.Request) {
	claims := ctxUser(r)
	renderJSON(w, http.StatusOK, s.store.ListSupportTickets(claims.UserID))
}

func (s *Server) handleCreateSupportTicket(w http.ResponseWriter, r *http.Request) {
	claims := ctxUser(r)
	var t store.SupportTicket
	if !decodeBody(w, r, &t) {
		return
	}
	t.ID = store.GenID("tkt")
	t.UserID = claims.UserID
	t.Email = claims.Email
	t.Status = "open"
	created := s.store.CreateSupportTicket(t)
	renderJSON(w, http.StatusCreated, created)
}

// ---------------------------------------------------------------------------
// Platform Info (FluxMQ MQTT Broker connection details & guide)
// ---------------------------------------------------------------------------

func (s *Server) handlePlatformInfo(w http.ResponseWriter, r *http.Request) {
	renderJSON(w, http.StatusOK, map[string]any{
		"platform":       "Magistrala IoT Platform",
		"version":        "v1.0.0-embedded",
		"mode":           "single-binary-external-db",
		"mqtt_broker": map[string]any{
			"recommended": "FluxMQ Enterprise / Community Broker",
			"host":        "localhost",
			"port":        1883,
			"tls_port":    8883,
			"ws_port":     8083,
			"auth_webhook": "/api/auth/mqtt",
			"acl_webhook":  "/api/auth/mqtt/acl",
			"topic_pattern": "channels/<channel_id>/messages[/<subtopic>]",
		},
		"fluxmq_auth_spec": "POST /api/auth/mqtt with clientid, username (Device ID), password (Device Secret)",
		"fluxmq_acl_spec":  "POST /api/auth/mqtt/acl with clientid, username, topic",
	})
}

// ---------------------------------------------------------------------------
// FluxMQ / MQTT Broker Webhooks: Device Authentication & Channel ACL
// ---------------------------------------------------------------------------

type MQTTAuthRequest struct {
	ClientID string `json:"clientid"`
	Username string `json:"username"`
	Password string `json:"password"`
	IP       string `json:"ipaddress,omitempty"`
}

type MQTTACLRequest struct {
	ClientID string `json:"clientid"`
	Username string `json:"username"`
	Topic    string `json:"topic"`
	Access   int    `json:"access"` // 1 = subscribe, 2 = publish
}

// handleMQTTAuth handles authentication requests forwarded by FluxMQ / EMQX webhook plugin.
// Devices connect using:
//   Username: Device ID (or ClientID: Device ID)
//   Password: Device Secret Key
func (s *Server) handleMQTTAuth(w http.ResponseWriter, r *http.Request) {
	var req MQTTAuthRequest
	if !decodeBody(w, r, &req) {
		return
	}

	devID := strings.TrimSpace(req.Username)
	if devID == "" {
		devID = strings.TrimSpace(req.ClientID)
	}
	if devID == "" {
		renderJSON(w, http.StatusOK, map[string]any{"result": "deny", "code": 1, "message": "missing username/clientid"})
		return
	}

	dev, err := s.store.GetDevice(devID)
	if err != nil {
		renderJSON(w, http.StatusOK, map[string]any{"result": "deny", "code": 1, "message": "device not found"})
		return
	}
	if dev.Status != "enabled" {
		renderJSON(w, http.StatusOK, map[string]any{"result": "deny", "code": 1, "message": "device disabled"})
		return
	}

	secret, _ := dev.Credentials["secret"].(string)
	if secret == "" {
		secret, _ = dev.Credentials["key"].(string)
	}

	// Secret validation
	if secret != "" && secret != req.Password {
		renderJSON(w, http.StatusOK, map[string]any{"result": "deny", "code": 1, "message": "invalid credentials"})
		return
	}

	// Authorized
	renderJSON(w, http.StatusOK, map[string]any{
		"result":       "allow",
		"code":         0,
		"is_superuser": false,
		"device_id":    dev.ID,
		"workspace_id": dev.WorkspaceID,
	})
}

// handleMQTTACL handles authorization requests forwarded by FluxMQ / EMQX.
// Standard Magistrala topic pattern: channels/<channel_id>/messages[/<subtopic>]
func (s *Server) handleMQTTACL(w http.ResponseWriter, r *http.Request) {
	var req MQTTACLRequest
	if !decodeBody(w, r, &req) {
		return
	}

	devID := strings.TrimSpace(req.Username)
	if devID == "" {
		devID = strings.TrimSpace(req.ClientID)
	}
	if devID == "" {
		renderJSON(w, http.StatusOK, map[string]any{"result": "deny", "code": 1})
		return
	}

	topic := strings.TrimSpace(req.Topic)
	// Example topic: channels/chan-xxx/messages or channels/chan-xxx/messages/telemetry
	parts := strings.Split(topic, "/")
	if len(parts) < 3 || parts[0] != "channels" || parts[2] != "messages" {
		// Allow system ping/keepalive topics or deny unknown structures
		renderJSON(w, http.StatusOK, map[string]any{"result": "deny", "code": 1, "message": "invalid topic pattern"})
		return
	}
	channelID := parts[1]

	// Verify device has active connection to this channel
	channels := s.store.ListDeviceChannels(devID)
	for _, ch := range channels {
		if ch.ID == channelID {
			renderJSON(w, http.StatusOK, map[string]any{"result": "allow", "code": 0})
			return
		}
	}

	renderJSON(w, http.StatusOK, map[string]any{
		"result":  "deny",
		"code":    1,
		"message": fmt.Sprintf("device %s is not connected to channel %s", devID, channelID),
	})
}
