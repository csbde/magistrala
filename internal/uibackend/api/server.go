// Copyright (c) Abstract Machines
// SPDX-License-Identifier: Apache-2.0

package api

import (
	"context"
	"encoding/json"
	"fmt"
	"io/fs"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/absmach/magistrala/internal/uibackend/casbin"
	"github.com/absmach/magistrala/internal/uibackend/oidc"
	"github.com/absmach/magistrala/internal/uibackend/store"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/golang-jwt/jwt/v5"
)

type Server struct {
	router     *chi.Mux
	store      store.Storage
	casbin     *casbin.Manager
	oidcSvc    *oidc.Service
	jwtSecret  []byte
	distFS     fs.FS
}

type TokenClaims struct {
	UserID      string   `json:"user_id"`
	Email       string   `json:"email"`
	Name        string   `json:"name"`
	WorkspaceID string   `json:"workspace_id,omitempty"`
	Roles       []string `json:"roles,omitempty"`
	jwt.RegisteredClaims
}

func NewServer(storage store.Storage, casbinMgr *casbin.Manager, oidcConfig *oidc.Config, distFS fs.FS) (*Server, error) {
	jwtSecret := []byte(os.Getenv("MG_JWT_SECRET"))
	if len(jwtSecret) == 0 {
		jwtSecret = []byte("magistrala-ui-super-secret-key-change-in-prod-2026")
	}

	var oidcSvc *oidc.Service
	if oidcConfig != nil && oidcConfig.IssuerURL != "" {
		svc, err := oidc.NewService(context.Background(), *oidcConfig)
		if err != nil {
			fmt.Printf("Notice: OIDC service init skipped/fallback (%v)\n", err)
		} else {
			oidcSvc = svc
		}
	}

	s := &Server{
		router:    chi.NewRouter(),
		store:     storage,
		casbin:    casbinMgr,
		oidcSvc:   oidcSvc,
		jwtSecret: jwtSecret,
		distFS:    distFS,
	}

	s.setupRoutes()
	return s, nil
}

func (s *Server) setupRoutes() {
	r := s.router

	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Timeout(60 * time.Second))

	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"*"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-Workspace-Id", "X-CSRF-Token"},
		ExposedHeaders:   []string{"Link"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	// API Routes
	r.Route("/api", func(api chi.Router) {
		// Health & Version Info
		api.Get("/health", func(w http.ResponseWriter, r *http.Request) {
			renderJSON(w, http.StatusOK, map[string]any{
				"status":      "pass",
				"description": "Magistrala Admin Console UI Backend",
				"version":     "v1.0.0-embedded",
				"time":        time.Now().Format(time.RFC3339),
			})
		})

		// FluxMQ / MQTT Auth webhook endpoints (for external Broker authentication)
		api.Post("/auth/mqtt", s.handleMQTTAuth)
		api.Post("/auth/mqtt/acl", s.handleMQTTACL)

		// Auth & OIDC
		api.Post("/auth/login", s.handlePasswordLogin)
		api.Get("/auth/oidc/login", s.handleOIDCLogin)
		api.Get("/auth/oidc/callback", s.handleOIDCCallback)
		api.Get("/auth/oidc/info", s.handleOIDCInfo)

		// Protected endpoints
		api.Group(func(auth chi.Router) {
			auth.Use(s.authMiddleware)

			auth.Get("/auth/me", s.handleGetMe)
			auth.Post("/auth/switch-workspace", s.handleSwitchWorkspace)

			// Workspaces (Tenants)
			auth.Get("/workspaces", s.handleListWorkspaces)
			auth.Post("/workspaces", s.handleCreateWorkspace)
			auth.Get("/workspaces/{id}", s.handleGetWorkspace)
			auth.Delete("/workspaces/{id}", s.handleDeleteWorkspace)

			// Workspace-Scoped Resources (Enforced by Casbin Multi-Tenant)
			auth.Group(func(scoped chi.Router) {
				scoped.Use(s.casbinMiddleware)

				// Devices
				scoped.Get("/devices", s.handleListDevices)
				scoped.Post("/devices", s.handleCreateDevice)
				scoped.Get("/devices/{id}", s.handleGetDevice)
				scoped.Put("/devices/{id}", s.handleUpdateDevice)
				scoped.Delete("/devices/{id}", s.handleDeleteDevice)
				scoped.Post("/devices/{id}/secret", s.handleResetDeviceSecret)
				scoped.Get("/devices/{id}/channels", s.handleListDeviceChannels)
				scoped.Post("/devices/{id}/channels/{channel_id}", s.handleConnectChannel)
				scoped.Delete("/devices/{id}/channels/{channel_id}", s.handleDisconnectChannel)

				// Gateways (Device with IsGateway=true)
				scoped.Get("/gateways", s.handleListGateways)
				scoped.Post("/gateways", s.handleCreateGateway)
				scoped.Get("/gateways/{id}/devices", s.handleListGatewayDevices)
				scoped.Post("/gateways/{id}/devices", s.handleBindGatewayDevice)
				scoped.Delete("/gateways/{id}/devices/{device_id}", s.handleUnbindGatewayDevice)

				// Channels
				scoped.Get("/channels", s.handleListChannels)
				scoped.Post("/channels", s.handleCreateChannel)
				scoped.Get("/channels/{id}", s.handleGetChannel)
				scoped.Put("/channels/{id}", s.handleUpdateChannel)
				scoped.Delete("/channels/{id}", s.handleDeleteChannel)
				scoped.Get("/channels/{id}/devices", s.handleListChannelDevices)

				// Messages & Live Console
				scoped.Get("/channels/{id}/messages", s.handleListMessages)
				scoped.Post("/channels/{id}/messages", s.handleSendMessage)

				// Groups
				scoped.Get("/groups", s.handleListGroups)
				scoped.Post("/groups", s.handleCreateGroup)
				scoped.Get("/groups/{id}", s.handleGetGroup)
				scoped.Put("/groups/{id}", s.handleUpdateGroup)
				scoped.Delete("/groups/{id}", s.handleDeleteGroup)
				scoped.Post("/groups/{id}/members", s.handleAssignToGroup)
				scoped.Delete("/groups/{id}/members/{entity_id}", s.handleRemoveFromGroup)

				// Rules
				scoped.Get("/rules", s.handleListRules)
				scoped.Post("/rules", s.handleCreateRule)
				scoped.Put("/rules/{id}", s.handleUpdateRule)
				scoped.Delete("/rules/{id}", s.handleDeleteRule)

				// Alarms
				scoped.Get("/alarms", s.handleListAlarms)
				scoped.Post("/alarms", s.handleCreateAlarm)
				scoped.Post("/alarms/{id}/action", s.handleAlarmAction)

				// Bootstrap Profiles
				scoped.Get("/bootstraps/profiles", s.handleListBootstrapProfiles)
				scoped.Post("/bootstraps/profiles", s.handleCreateBootstrapProfile)
				scoped.Delete("/bootstraps/profiles/{id}", s.handleDeleteBootstrapProfile)

				// Bootstrap Configs
				scoped.Get("/bootstraps/configs", s.handleListBootstrapConfigs)
				scoped.Post("/bootstraps/configs", s.handleCreateBootstrapConfig)
				scoped.Put("/bootstraps/configs/{id}", s.handleUpdateBootstrapConfig)
				scoped.Delete("/bootstraps/configs/{id}", s.handleDeleteBootstrapConfig)

				// Device Types & Versions
				scoped.Get("/device-types", s.handleListDeviceTypes)
				scoped.Post("/device-types", s.handleCreateDeviceType)
				scoped.Get("/device-types/{id}", s.handleGetDeviceType)
				scoped.Put("/device-types/{id}", s.handleUpdateDeviceType)
				scoped.Delete("/device-types/{id}", s.handleDeleteDeviceType)
				scoped.Get("/device-types/{id}/versions", s.handleListDeviceTypeVersions)
				scoped.Post("/device-types/{id}/versions", s.handleCreateDeviceTypeVersion)
				scoped.Delete("/device-types/{id}/versions/{version_id}", s.handleDeleteDeviceTypeVersion)

				// Dashboards
				scoped.Get("/dashboards", s.handleListDashboards)
				scoped.Post("/dashboards", s.handleCreateDashboard)
				scoped.Get("/dashboards/{id}", s.handleGetDashboard)
				scoped.Put("/dashboards/{id}", s.handleUpdateDashboard)
				scoped.Delete("/dashboards/{id}", s.handleDeleteDashboard)

				// Reports
				scoped.Get("/reports", s.handleListReports)
				scoped.Post("/reports", s.handleCreateReport)
				scoped.Get("/reports/{id}", s.handleGetReport)
				scoped.Put("/reports/{id}", s.handleUpdateReport)
				scoped.Delete("/reports/{id}", s.handleDeleteReport)

				// Custom Nodes (WASM / Scripts)
				scoped.Get("/custom-nodes", s.handleListCustomNodes)
				scoped.Post("/custom-nodes", s.handleCreateCustomNode)
				scoped.Put("/custom-nodes/{id}", s.handleUpdateCustomNode)
				scoped.Delete("/custom-nodes/{id}", s.handleDeleteCustomNode)

				// Journals / Audit Logs
				scoped.Get("/journals", s.handleListJournals)

				// Invitations
				scoped.Get("/invitations", s.handleListInvitations)
				scoped.Post("/invitations", s.handleCreateInvitation)
				scoped.Delete("/invitations/{id}", s.handleDeleteInvitation)

				// Support Tickets
				scoped.Get("/support/tickets", s.handleListSupportTickets)
				scoped.Post("/support/tickets", s.handleCreateSupportTicket)

				// Platform Info (MQTT / FluxMQ connection hints)
				scoped.Get("/platform/info", s.handlePlatformInfo)

				// Users & Roles in Workspace
				scoped.Get("/users", s.handleListUsers)
				scoped.Get("/roles", s.handleListRoles)
				scoped.Post("/roles/assign", s.handleAssignRole)
				scoped.Post("/roles/revoke", s.handleRevokeRole)

				// PATs
				scoped.Get("/pats", s.handleListPATs)
				scoped.Post("/pats", s.handleCreatePAT)
				scoped.Delete("/pats/{id}", s.handleDeletePAT)
			})
		})
	})

	// Static SPA Serving from go:embed
	if s.distFS != nil {
		fileServer := http.FileServer(http.FS(s.distFS))
		r.Get("/*", func(w http.ResponseWriter, req *http.Request) {
			path := strings.TrimPrefix(req.URL.Path, "/")
			if path != "" {
				if f, err := s.distFS.Open(path); err == nil {
					_ = f.Close()
					fileServer.ServeHTTP(w, req)
					return
				}
			}
			// Fallback to index.html for SPA router
			indexFile, err := s.distFS.Open("index.html")
			if err != nil {
				http.NotFound(w, req)
				return
			}
			defer indexFile.Close()
			http.ServeContent(w, req, "index.html", time.Now(), indexFile.(interface {
				ReadSeeker
			}))
		})
	}
}

type ReadSeeker interface {
	fs.File
	Seek(offset int64, whence int) (int64, error)
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	s.router.ServeHTTP(w, r)
}

// Auth Middleware
func (s *Server) authMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		if !strings.HasPrefix(authHeader, "Bearer ") {
			http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
			return
		}
		tokenString := strings.TrimPrefix(authHeader, "Bearer ")

		claims := &TokenClaims{}
		token, err := jwt.ParseWithClaims(tokenString, claims, func(t *jwt.Token) (any, error) {
			return s.jwtSecret, nil
		})
		if err != nil || !token.Valid {
			http.Error(w, `{"error":"invalid token"}`, http.StatusUnauthorized)
			return
		}

		ctx := context.WithValue(r.Context(), "user_id", claims.UserID)
		ctx = context.WithValue(ctx, "email", claims.Email)
		ctx = context.WithValue(ctx, "claims", claims)

		wsID := r.Header.Get("X-Workspace-Id")
		if wsID == "" {
			wsID = claims.WorkspaceID
		}
		if wsID == "" {
			wsID = "ws-default-01"
		}
		ctx = context.WithValue(ctx, "workspace_id", wsID)

		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// Casbin Multi-Tenant Enforcement Middleware
func (s *Server) casbinMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		claims, _ := r.Context().Value("claims").(*TokenClaims)
		wsID, _ := r.Context().Value("workspace_id").(string)

		sub := "user:" + claims.UserID
		dom := wsID
		obj := r.URL.Path
		act := r.Method

		for _, role := range claims.Roles {
			if role == "role:admin" || role == "admin" {
				next.ServeHTTP(w, r)
				return
			}
		}

		allowed, err := s.casbin.CheckPermission(sub, dom, obj, act)
		if err != nil || !allowed {
			roles := s.casbin.GetRolesForUserInTenant(sub, dom)
			roleAllowed := false
			for _, role := range roles {
				if ok, _ := s.casbin.CheckPermission(role, dom, obj, act); ok {
					roleAllowed = true
					break
				}
			}

			if !roleAllowed {
				http.Error(w, `{"error":"forbidden: casbin permission check failed"}`, http.StatusForbidden)
				return
			}
		}

		next.ServeHTTP(w, r)
	})
}

func renderJSON(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(data)
}
