// Copyright (c) Abstract Machines
// SPDX-License-Identifier: Apache-2.0

package pki

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"fmt"
	"math/big"
	"net"
	"sync"
	"time"
)

type Manager struct {
	mu        sync.RWMutex
	caCert    *x509.Certificate
	caKey     *ecdsa.PrivateKey
	caCertPEM string
}

func NewManager(caCertPEM, caKeyPEM string) (*Manager, error) {
	m := &Manager{}
	if caCertPEM != "" && caKeyPEM != "" {
		if err := m.loadCA(caCertPEM, caKeyPEM); err == nil {
			return m, nil
		}
	}
	// Generate new self-signed Root CA
	if err := m.generateRootCA(); err != nil {
		return nil, fmt.Errorf("failed to generate root CA: %w", err)
	}
	return m, nil
}

func (m *Manager) generateRootCA() error {
	priv, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return err
	}

	serialNumberLimit := new(big.Int).Lsh(big.NewInt(1), 128)
	serialNumber, err := rand.Int(rand.Reader, serialNumberLimit)
	if err != nil {
		return err
	}

	template := x509.Certificate{
		SerialNumber: serialNumber,
		Subject: pkix.Name{
			Organization: []string{"IoT Platform Root CA"},
			CommonName:   "IoT Platform Internal Root CA",
		},
		NotBefore:             time.Now().Add(-1 * time.Hour),
		NotAfter:              time.Now().Add(10 * 365 * 24 * time.Hour), // 10 years
		KeyUsage:              x509.KeyUsageCertSign | x509.KeyUsageCRLSign,
		BasicConstraintsValid: true,
		IsCA:                  true,
	}

	derBytes, err := x509.CreateCertificate(rand.Reader, &template, &template, &priv.PublicKey, priv)
	if err != nil {
		return err
	}

	caCert, err := x509.ParseCertificate(derBytes)
	if err != nil {
		return err
	}

	certPEM := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: derBytes})

	m.caCert = caCert
	m.caKey = priv
	m.caCertPEM = string(certPEM)
	return nil
}

func (m *Manager) loadCA(certPEM, keyPEM string) error {
	block, _ := pem.Decode([]byte(certPEM))
	if block == nil {
		return fmt.Errorf("failed to parse certificate PEM")
	}
	cert, err := x509.ParseCertificate(block.Bytes)
	if err != nil {
		return err
	}

	keyBlock, _ := pem.Decode([]byte(keyPEM))
	if keyBlock == nil {
		return fmt.Errorf("failed to parse key PEM")
	}
	key, err := x509.ParseECPrivateKey(keyBlock.Bytes)
	if err != nil {
		return err
	}

	m.caCert = cert
	m.caKey = key
	m.caCertPEM = certPEM
	return nil
}

func (m *Manager) CACertPEM() string {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.caCertPEM
}

func (m *Manager) CAKeyPEM() string {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if m.caKey == nil {
		return ""
	}
	der, err := x509.MarshalECPrivateKey(m.caKey)
	if err != nil {
		return ""
	}
	return string(pem.EncodeToMemory(&pem.Block{Type: "EC PRIVATE KEY", Bytes: der}))
}

// IssueCertificate creates an X.509 client certificate for a device/entity
func (m *Manager) IssueCertificate(entityID string, ttl time.Duration, ipAddresses []string) (certPEM, keyPEM, serialNumber string, expiry time.Time, err error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if ttl <= 0 {
		ttl = 365 * 24 * time.Hour // default 1 year
	}

	clientKey, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return "", "", "", time.Time{}, err
	}

	serialLimit := new(big.Int).Lsh(big.NewInt(1), 128)
	serial, err := rand.Int(rand.Reader, serialLimit)
	if err != nil {
		return "", "", "", time.Time{}, err
	}

	now := time.Now()
	expiry = now.Add(ttl)

	template := x509.Certificate{
		SerialNumber: serial,
		Subject: pkix.Name{
			CommonName:   entityID,
			Organization: []string{"IoT Platform Device"},
		},
		NotBefore:   now.Add(-10 * time.Minute),
		NotAfter:    expiry,
		KeyUsage:    x509.KeyUsageDigitalSignature | x509.KeyUsageKeyEncipherment,
		ExtKeyUsage: []x509.ExtKeyUsage{x509.ExtKeyUsageClientAuth},
	}

	for _, ipStr := range ipAddresses {
		if ip := net.ParseIP(ipStr); ip != nil {
			template.IPAddresses = append(template.IPAddresses, ip)
		}
	}

	der, err := x509.CreateCertificate(rand.Reader, &template, m.caCert, &clientKey.PublicKey, m.caKey)
	if err != nil {
		return "", "", "", time.Time{}, err
	}

	certBytes := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der})

	keyDer, err := x509.MarshalECPrivateKey(clientKey)
	if err != nil {
		return "", "", "", time.Time{}, err
	}
	keyBytes := pem.EncodeToMemory(&pem.Block{Type: "EC PRIVATE KEY", Bytes: keyDer})

	return string(certBytes), string(keyBytes), fmt.Sprintf("%x", serial), expiry, nil
}
