// Copyright (c) Abstract Machines
// SPDX-License-Identifier: Apache-2.0

package oidc

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"sync"
	"time"

	"github.com/coreos/go-oidc/v3/oidc"
	"golang.org/x/oauth2"
)

type Config struct {
	IssuerURL    string   `json:"issuer_url"`
	ClientID     string   `json:"client_id"`
	ClientSecret string   `json:"client_secret"`
	RedirectURL  string   `json:"redirect_url"`
	Scopes       []string `json:"scopes"`
	ProviderName string   `json:"provider_name"`
}

type UserInfo struct {
	Subject       string   `json:"sub"`
	Email         string   `json:"email"`
	EmailVerified bool     `json:"email_verified"`
	Name          string   `json:"name"`
	PreferredName string   `json:"preferred_username"`
	Picture       string   `json:"picture"`
	Groups        []string `json:"groups,omitempty"`
}

type Service struct {
	cfg      Config
	provider *oidc.Provider
	verifier *oidc.IDTokenVerifier
	oauth2   *oauth2.Config

	statesMu sync.Mutex
	states   map[string]time.Time
}

func NewService(ctx context.Context, cfg Config) (*Service, error) {
	if cfg.IssuerURL == "" {
		return nil, errors.New("OIDC issuer URL is required")
	}

	provider, err := oidc.NewProvider(ctx, cfg.IssuerURL)
	if err != nil {
		return nil, fmt.Errorf("failed to query OIDC provider at %s: %w", cfg.IssuerURL, err)
	}

	verifier := provider.Verifier(&oidc.Config{
		ClientID: cfg.ClientID,
	})

	scopes := cfg.Scopes
	if len(scopes) == 0 {
		scopes = []string{oidc.ScopeOpenID, "profile", "email"}
	}

	oauthCfg := &oauth2.Config{
		ClientID:     cfg.ClientID,
		ClientSecret: cfg.ClientSecret,
		RedirectURL:  cfg.RedirectURL,
		Endpoint:     provider.Endpoint(),
		Scopes:       scopes,
	}

	svc := &Service{
		cfg:      cfg,
		provider: provider,
		verifier: verifier,
		oauth2:   oauthCfg,
		states:   make(map[string]time.Time),
	}

	go svc.cleanupStatesRoutine()

	return svc, nil
}

func (s *Service) GetAuthURL() (string, string, error) {
	state, err := generateRandomString(32)
	if err != nil {
		return "", "", err
	}

	s.statesMu.Lock()
	s.states[state] = time.Now().Add(10 * time.Minute)
	s.statesMu.Unlock()

	url := s.oauth2.AuthCodeURL(state, oauth2.AccessTypeOffline)
	return url, state, nil
}

func (s *Service) ExchangeAndVerify(ctx context.Context, code, state string) (*UserInfo, *oauth2.Token, error) {
	s.statesMu.Lock()
	expiry, exists := s.states[state]
	if !exists || time.Now().After(expiry) {
		delete(s.states, state)
		s.statesMu.Unlock()
		return nil, nil, errors.New("invalid or expired OIDC state")
	}
	delete(s.states, state)
	s.statesMu.Unlock()

	token, err := s.oauth2.Exchange(ctx, code)
	if err != nil {
		return nil, nil, fmt.Errorf("token exchange failed: %w", err)
	}

	rawIDToken, ok := token.Extra("id_token").(string)
	if !ok {
		return nil, nil, errors.New("no id_token in token response")
	}

	idToken, err := s.verifier.Verify(ctx, rawIDToken)
	if err != nil {
		return nil, nil, fmt.Errorf("id_token verification failed: %w", err)
	}

	var claims struct {
		Subject       string   `json:"sub"`
		Email         string   `json:"email"`
		EmailVerified bool     `json:"email_verified"`
		Name          string   `json:"name"`
		PreferredName string   `json:"preferred_username"`
		Picture       string   `json:"picture"`
		Groups        []string `json:"groups"`
	}

	if err := idToken.Claims(&claims); err != nil {
		return nil, nil, fmt.Errorf("failed to parse id_token claims: %w", err)
	}

	userInfo := &UserInfo{
		Subject:       claims.Subject,
		Email:         claims.Email,
		EmailVerified: claims.EmailVerified,
		Name:          claims.Name,
		PreferredName: claims.PreferredName,
		Picture:       claims.Picture,
		Groups:        claims.Groups,
	}

	if userInfo.Name == "" && userInfo.PreferredName != "" {
		userInfo.Name = userInfo.PreferredName
	}
	if userInfo.Name == "" {
		userInfo.Name = userInfo.Email
	}

	return userInfo, token, nil
}

func (s *Service) Config() Config {
	return s.cfg
}

func (s *Service) cleanupStatesRoutine() {
	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()

	for range ticker.C {
		s.statesMu.Lock()
		now := time.Now()
		for st, expiry := range s.states {
			if now.After(expiry) {
				delete(s.states, st)
			}
		}
		s.statesMu.Unlock()
	}
}

func generateRandomString(n int) (string, error) {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}
