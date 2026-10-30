// Copyright (c) Abstract Machines
// SPDX-License-Identifier: Apache-2.0

package store

// NewMemoryStore creates an in-memory DBStore instance using pure-Go SQLite
func NewMemoryStore() Storage {
	s, err := NewSQLiteStore(":memory:")
	if err != nil {
		panic(err)
	}
	return s
}
