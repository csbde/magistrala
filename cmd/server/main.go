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
	"github.com/joho/godotenv"
)

//go:embed dist/*
var embeddedDist embed.FS

func main() {
	// Load config.env or .env if present
	_ = godotenv.Load("config.env")
	_ = godotenv.Load(".env")

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

	// Database Strategy: Check DATABASE_URL for external PostgreSQL
	var storage store.Storage
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		// Also check standard PG variables
		pgHost := os.Getenv("POSTGRES_HOST")
		if pgHost != "" {
			pgPort := os.Getenv("POSTGRES_PORT")
			if pgPort == "" {
				pgPort = "5432"
			}
			pgUser := os.Getenv("POSTGRES_USER")
			pgPass := os.Getenv("POSTGRES_PASSWORD")
			pgDB := os.Getenv("POSTGRES_DB")
			dbURL = fmt.Sprintf("postgres://%s:%s@%s:%s/%s?sslmode=disable", pgUser, pgPass, pgHost, pgPort, pgDB)
		}
	}

	if dbURL != "" {
		log.Printf("[DB] 正在连接外部 PostgreSQL: %s ...", maskDBURL(dbURL))
		pgStore, err := store.NewPGStore(dbURL)
		if err != nil {
			log.Fatalf("[DB 错误] 外部 PostgreSQL 连接或迁移失败: %v", err)
		}
		storage = pgStore
		log.Printf("[DB] 外部 PostgreSQL 连接并自动完成数据表结构迁移 (AutoMigrate)")
	} else {
		log.Printf("[DB] 未检测到 DATABASE_URL，运行在内存演示模式 (可通过 config.env 配置外部 PG)")
		storage = store.NewMemoryStore()
	}

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

	server, err := api.NewServer(storage, casbinMgr, oidcConfig, distFS)
	if err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}

	addr := fmt.Sprintf(":%d", port)
	log.Printf("==========================================================")
	log.Printf("  Magistrala 物联网管理控制台 (独立单文件二进制)")
	log.Printf("  服务地址: http://localhost%s", addr)
	log.Printf("  默认管理员: admin@magistrala.local (密码任意)")
	log.Printf("==========================================================")

	if err := http.ListenAndServe(addr, server); err != nil {
		log.Fatalf("Server exited with error: %v", err)
	}
}

func maskDBURL(url string) string {
	parts := strings.Split(url, "@")
	if len(parts) == 2 {
		return "...@" + parts[1]
	}
	return url
}
