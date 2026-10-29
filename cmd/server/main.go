// Copyright (c) Abstract Machines
// SPDX-License-Identifier: Apache-2.0

package main

import (
	"embed"
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"

	"github.com/absmach/magistrala/internal/uibackend/api"
	"github.com/absmach/magistrala/internal/uibackend/casbin"
	"github.com/absmach/magistrala/internal/uibackend/oidc"
	"github.com/absmach/magistrala/internal/uibackend/store"
)

//go:embed dist/*
var embeddedDist embed.FS

func main() {
	port := 8080
	if p := os.Getenv("PORT"); p != "" {
		if val, err := strconv.Atoi(p); err == nil {
			port = val
		}
	} else if p := os.Getenv("MG_UI_HTTP_PORT"); p != "" {
		if val, err := strconv.Atoi(p); err == nil {
			port = val
		}
	}

	memStore := store.NewMemoryStore()

	casbinMgr, err := casbin.NewCasbinManager()
	if err != nil {
		log.Fatalf("Failed to initialize Casbin enforcer: %v", err)
	}

	var oidcConfig *oidc.Config
	issuerURL := os.Getenv("OIDC_ISSUER_URL")
	if issuerURL != "" {
		scopesStr := os.Getenv("OIDC_SCOPES")
		var scopes []string
		if scopesStr != "" {
			scopes = strings.Split(scopesStr, ",")
		}
		oidcConfig = &oidc.Config{
			IssuerURL:    issuerURL,
			ClientID:     os.Getenv("OIDC_CLIENT_ID"),
			ClientSecret: os.Getenv("OIDC_CLIENT_SECRET"),
			RedirectURL:  os.Getenv("OIDC_REDIRECT_URL"),
			ProviderName: os.Getenv("OIDC_PROVIDER_NAME"),
			Scopes:       scopes,
		}
		if oidcConfig.ProviderName == "" {
			oidcConfig.ProviderName = "企业单点登录 (OIDC SSO)"
		}
	}

	var distFS fs.FS
	sub, err := fs.Sub(embeddedDist, "dist")
	if err == nil {
		distFS = sub
	}

	server, err := api.NewServer(memStore, casbinMgr, oidcConfig, distFS)
	if err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}

	addr := fmt.Sprintf(":%d", port)
	log.Printf("==========================================================")
	log.Printf("  Magistrala 物联网管理后台 (带中文支持 + Casbin 多租户隔离 + OIDC)")
	log.Printf("  服务正在监听: http://localhost%s", addr)
	log.Printf("  内置演示账号: admin@magistrala.local / 密码任意")
	log.Printf("==========================================================")

	if err := http.ListenAndServe(addr, server); err != nil {
		log.Fatalf("Server exited with error: %v", err)
	}
}
