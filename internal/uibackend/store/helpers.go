// Copyright (c) Abstract Machines
// SPDX-License-Identifier: Apache-2.0

package store

import (
	"crypto/rand"
	"database/sql/driver"
	"encoding/hex"
	"encoding/json"
	"errors"
	"strings"
)

type JSONMap map[string]any

func (j JSONMap) Value() (driver.Value, error) {
	if j == nil {
		return "{}", nil
	}
	b, err := json.Marshal(j)
	if err != nil {
		return "{}", nil
	}
	return string(b), nil
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
		return errors.New("cannot scan to JSONMap")
	}
	if len(bytes) == 0 || string(bytes) == "{}" {
		*j = make(map[string]any)
		return nil
	}
	return json.Unmarshal(bytes, j)
}

type StringList []string

func (s StringList) Value() (driver.Value, error) {
	if s == nil {
		return "", nil
	}
	return strings.Join(s, ","), nil
}

func (s *StringList) Scan(value any) error {
	if value == nil {
		*s = StringList{}
		return nil
	}
	var str string
	switch v := value.(type) {
	case []byte:
		str = string(v)
	case string:
		str = v
	default:
		return errors.New("cannot scan to StringList")
	}
	if str == "" {
		*s = StringList{}
	} else {
		*s = strings.Split(str, ",")
	}
	return nil
}

func GenID(prefix string) string {
	b := make([]byte, 8)
	_, _ = rand.Read(b)
	return prefix + "-" + hex.EncodeToString(b)
}
