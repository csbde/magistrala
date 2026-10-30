// Copyright (c) Abstract Machines
// SPDX-License-Identifier: Apache-2.0

package store

import (
	"errors"
	"strings"
	"time"

	"gorm.io/gorm"
)

var _ Storage = (*DBStore)(nil)

// applyFilters narrows a query by workspace and common search fields.
func (s *DBStore) scope(q *gorm.DB, f QueryFilter, searchCols ...string) *gorm.DB {
	if f.WorkspaceID != "" {
		q = q.Where("workspace_id = ?", f.WorkspaceID)
	}
	if f.Query != "" && len(searchCols) > 0 {
		like := "%" + f.Query + "%"
		var parts []string
		var args []any
		for _, c := range searchCols {
			parts = append(parts, c+" "+s.likeOp()+" ?")
			args = append(args, like)
		}
		q = q.Where("("+strings.Join(parts, " OR ")+")", args...)
	}
	if f.Status != "" {
		q = q.Where("status = ?", f.Status)
	}
	return q
}

func pageArgs(q QueryFilter) (int, int) {
	offset := q.Offset
	if offset < 0 {
		offset = 0
	}
	limit := q.Limit
	if limit <= 0 {
		limit = 50
	}
	if limit > 1000 {
		limit = 1000
	}
	return offset, limit
}

func isNotFound(err error) bool {
	return errors.Is(err, gorm.ErrRecordNotFound)
}

// ---------------------------------------------------------------------------
// Workspaces
// ---------------------------------------------------------------------------

func (s *DBStore) ListWorkspaces(f QueryFilter) Page[Workspace] {
	var rows []workspaceRow
	var total int64
	q := s.scope(s.db.Model(&workspaceRow{}), f, "name", "alias", "description")
	q.Count(&total)
	off, lim := pageArgs(f)
	q.Order("created_at desc").Offset(off).Limit(lim).Find(&rows)
	items := make([]Workspace, len(rows))
	for i, r := range rows {
		items[i] = Workspace{
			ID: r.ID, Name: r.Name, Alias: r.Alias, Description: r.Description,
			Status: r.Status, Metadata: r.Metadata, OwnerID: r.OwnerID,
			CreatedAt: r.CreatedAt, UpdatedAt: r.UpdatedAt,
		}
	}
	return Page[Workspace]{Total: total, Offset: off, Limit: lim, Items: items}
}

func (s *DBStore) GetWorkspace(id string) (Workspace, error) {
	var r workspaceRow
	if err := s.db.First(&r, "id = ?", id).Error; err != nil {
		if isNotFound(err) {
			return Workspace{}, ErrNotFound
		}
		return Workspace{}, err
	}
	return Workspace{
		ID: r.ID, Name: r.Name, Alias: r.Alias, Description: r.Description,
		Status: r.Status, Metadata: r.Metadata, OwnerID: r.OwnerID,
		CreatedAt: r.CreatedAt, UpdatedAt: r.UpdatedAt,
	}, nil
}

func (s *DBStore) SaveWorkspace(w Workspace) Workspace {
	if w.ID == "" {
		w.ID = GenID("ws")
	}
	row := workspaceRow{
		ID: w.ID, Name: w.Name, Alias: w.Alias, Description: w.Description,
		Status: w.Status, Metadata: JSONMap(w.Metadata), OwnerID: w.OwnerID,
	}
	var existing workspaceRow
	if s.db.First(&existing, "id = ?", w.ID).Error == nil {
		row.CreatedAt = existing.CreatedAt
		row.Alias = firstNonEmpty(row.Alias, existing.Alias)
	} else {
		row.CreatedAt = time.Now()
	}
	row.UpdatedAt = time.Now()
	s.db.Save(&row)
	out, _ := s.GetWorkspace(w.ID)
	return out
}

func (s *DBStore) DeleteWorkspace(id string) {
	s.db.Delete(&workspaceRow{}, "id = ?", id)
	s.db.Where("workspace_id = ?", id).Delete(&deviceRow{})
	s.db.Where("workspace_id = ?", id).Delete(&channelRow{})
	s.db.Where("workspace_id = ?", id).Delete(&groupRow{})
	s.db.Where("workspace_id = ?", id).Delete(&ruleRow{})
	s.db.Where("workspace_id = ?", id).Delete(&alarmRow{})
	s.db.Where("workspace_id = ?", id).Delete(&connectionRow{})
}

func firstNonEmpty(a, b string) string {
	if a != "" {
		return a
	}
	return b
}

// ---------------------------------------------------------------------------
// Devices
// ---------------------------------------------------------------------------

func toDevice(r deviceRow) Device {
	return Device{
		ID: r.ID, Name: r.Name, WorkspaceID: r.WorkspaceID, Status: r.Status,
		Credentials: r.Credentials, Tags: []string(r.Tags), Metadata: r.Metadata,
		ParentID: r.ParentID, DeviceType: r.DeviceType, IsGateway: r.IsGateway,
		CreatedAt: r.CreatedAt, UpdatedAt: r.UpdatedAt,
	}
}

func (s *DBStore) listDevicesBy(f QueryFilter, extra func(*gorm.DB) *gorm.DB) Page[Device] {
	var rows []deviceRow
	model := s.db.Model(&deviceRow{})
	q := s.scope(model, f, "name", "id")
	if extra != nil {
		q = extra(q)
	}
	var total int64
	q.Count(&total)
	off, lim := pageArgs(f)
	q.Order("created_at desc").Offset(off).Limit(lim).Find(&rows)
	items := make([]Device, len(rows))
	for i, r := range rows {
		items[i] = toDevice(r)
	}
	return Page[Device]{Total: total, Offset: off, Limit: lim, Items: items}
}

func (s *DBStore) ListDevices(f QueryFilter) Page[Device] {
	return s.listDevicesBy(f, func(q *gorm.DB) *gorm.DB { return q.Where("is_gateway = ?", false) })
}

func (s *DBStore) ListGateways(f QueryFilter) Page[Device] {
	return s.listDevicesBy(f, func(q *gorm.DB) *gorm.DB { return q.Where("is_gateway = ?", true) })
}

func (s *DBStore) GetDevice(id string) (Device, error) {
	var r deviceRow
	if err := s.db.First(&r, "id = ?", id).Error; err != nil {
		if isNotFound(err) {
			return Device{}, ErrNotFound
		}
		return Device{}, err
	}
	return toDevice(r), nil
}

func (s *DBStore) SaveDevice(d Device) Device {
	if d.ID == "" {
		d.ID = GenID("dev")
	}
	row := deviceRow{
		ID: d.ID, Name: d.Name, WorkspaceID: d.WorkspaceID, Status: d.Status,
		Credentials: JSONMap(d.Credentials), Tags: StringList(d.Tags),
		Metadata: JSONMap(d.Metadata), ParentID: d.ParentID, DeviceType: d.DeviceType,
		IsGateway: d.IsGateway,
	}
	var existing deviceRow
	if s.db.First(&existing, "id = ?", d.ID).Error == nil {
		row.CreatedAt = existing.CreatedAt
		// Preserve credentials when the update payload omits them.
		if len(row.Credentials) == 0 {
			row.Credentials = existing.Credentials
		}
	} else {
		row.CreatedAt = time.Now()
	}
	row.UpdatedAt = time.Now()
	s.db.Save(&row)
	out, _ := s.GetDevice(d.ID)
	return out
}

func (s *DBStore) DeleteDevice(id string) {
	s.db.Delete(&deviceRow{}, "id = ?", id)
	s.db.Where("device_id = ?", id).Delete(&connectionRow{})
	s.db.Where("entity_id = ?", id).Delete(&groupEntityRow{})
	s.db.Where("parent_id = ?", id).Update("parent_id", "")
}

func (s *DBStore) ResetDeviceSecret(id string) (string, error) {
	var r deviceRow
	if err := s.db.First(&r, "id = ?", id).Error; err != nil {
		if isNotFound(err) {
			return "", ErrNotFound
		}
		return "", err
	}
	secret := "sec_" + strings.ReplaceAll(GenID(""), "-", "")
	if r.Credentials == nil {
		r.Credentials = JSONMap{}
	}
	r.Credentials["secret"] = secret
	if err := s.db.Model(&r).Updates(map[string]any{
		"credentials": r.Credentials, "updated_at": time.Now(),
	}).Error; err != nil {
		return "", err
	}
	return secret, nil
}

func (s *DBStore) ListGatewayDevices(gatewayID string) []Device {
	var rows []deviceRow
	s.db.Where("parent_id = ?", gatewayID).Order("created_at desc").Find(&rows)
	items := make([]Device, len(rows))
	for i, r := range rows {
		items[i] = toDevice(r)
	}
	return items
}

func (s *DBStore) BindGatewayDevice(gatewayID, deviceID string) error {
	var gw deviceRow
	if err := s.db.First(&gw, "id = ?", gatewayID).Error; err != nil {
		if isNotFound(err) {
			return ErrNotFound
		}
		return err
	}
	if !gw.IsGateway {
		return errors.New("target device is not a gateway")
	}
	if deviceID == gatewayID {
		return errors.New("gateway cannot be its own sub-device")
	}
	return s.db.Model(&deviceRow{}).Where("id = ?", deviceID).
		Updates(map[string]any{"parent_id": gatewayID, "updated_at": time.Now()}).Error
}

func (s *DBStore) UnbindGatewayDevice(gatewayID, deviceID string) error {
	return s.db.Model(&deviceRow{}).Where("id = ? AND parent_id = ?", deviceID, gatewayID).
		Updates(map[string]any{"parent_id": "", "updated_at": time.Now()}).Error
}

// ---------------------------------------------------------------------------
// Channels
// ---------------------------------------------------------------------------

func toChannel(r channelRow) Channel {
	return Channel{
		ID: r.ID, Name: r.Name, WorkspaceID: r.WorkspaceID, Status: r.Status,
		Metadata: r.Metadata, CreatedAt: r.CreatedAt, UpdatedAt: r.UpdatedAt,
	}
}

func (s *DBStore) ListChannels(f QueryFilter) Page[Channel] {
	var rows []channelRow
	q := s.scope(s.db.Model(&channelRow{}), f, "name", "id")
	var total int64
	q.Count(&total)
	off, lim := pageArgs(f)
	q.Order("created_at desc").Offset(off).Limit(lim).Find(&rows)
	items := make([]Channel, len(rows))
	for i, r := range rows {
		items[i] = toChannel(r)
	}
	return Page[Channel]{Total: total, Offset: off, Limit: lim, Items: items}
}

func (s *DBStore) GetChannel(id string) (Channel, error) {
	var r channelRow
	if err := s.db.First(&r, "id = ?", id).Error; err != nil {
		if isNotFound(err) {
			return Channel{}, ErrNotFound
		}
		return Channel{}, err
	}
	return toChannel(r), nil
}

func (s *DBStore) SaveChannel(c Channel) Channel {
	if c.ID == "" {
		c.ID = GenID("chan")
	}
	row := channelRow{
		ID: c.ID, Name: c.Name, WorkspaceID: c.WorkspaceID,
		Status: c.Status, Metadata: JSONMap(c.Metadata),
	}
	var existing channelRow
	if s.db.First(&existing, "id = ?", c.ID).Error == nil {
		row.CreatedAt = existing.CreatedAt
	} else {
		row.CreatedAt = time.Now()
	}
	row.UpdatedAt = time.Now()
	s.db.Save(&row)
	out, _ := s.GetChannel(c.ID)
	return out
}

func (s *DBStore) DeleteChannel(id string) {
	s.db.Delete(&channelRow{}, "id = ?", id)
	s.db.Where("channel_id = ?", id).Delete(&connectionRow{})
	s.db.Where("entity_id = ?", id).Delete(&groupEntityRow{})
}

// ---------------------------------------------------------------------------
// Connections (Device <-> Channel)
// ---------------------------------------------------------------------------

func (s *DBStore) ConnectChannel(deviceID, channelID, wsID string) error {
	var count int64
	s.db.Model(&connectionRow{}).Where("device_id = ? AND channel_id = ?", deviceID, channelID).Count(&count)
	if count > 0 {
		return nil
	}
	return s.db.Create(&connectionRow{
		DeviceID: deviceID, ChannelID: channelID, WorkspaceID: wsID, CreatedAt: time.Now(),
	}).Error
}

func (s *DBStore) DisconnectChannel(deviceID, channelID string) error {
	return s.db.Where("device_id = ? AND channel_id = ?", deviceID, channelID).Delete(&connectionRow{}).Error
}

func (s *DBStore) ListDeviceChannels(deviceID string) []Channel {
	var conns []connectionRow
	s.db.Where("device_id = ?", deviceID).Find(&conns)
	if len(conns) == 0 {
		return nil
	}
	ids := make([]string, len(conns))
	for i, c := range conns {
		ids[i] = c.ChannelID
	}
	var rows []channelRow
	s.db.Where("id IN ?", ids).Order("created_at desc").Find(&rows)
	items := make([]Channel, len(rows))
	for i, r := range rows {
		items[i] = toChannel(r)
	}
	return items
}

func (s *DBStore) ListChannelDevices(channelID string) []Device {
	var conns []connectionRow
	s.db.Where("channel_id = ?", channelID).Find(&conns)
	if len(conns) == 0 {
		return nil
	}
	ids := make([]string, len(conns))
	for i, c := range conns {
		ids[i] = c.DeviceID
	}
	var rows []deviceRow
	s.db.Where("id IN ?", ids).Order("created_at desc").Find(&rows)
	items := make([]Device, len(rows))
	for i, r := range rows {
		items[i] = toDevice(r)
	}
	return items
}

// ---------------------------------------------------------------------------
// Groups
// ---------------------------------------------------------------------------

func toGroup(r groupRow) Group {
	return Group{
		ID: r.ID, Name: r.Name, WorkspaceID: r.WorkspaceID, GroupType: r.GroupType,
		ParentID: r.ParentID, Description: r.Description, Status: r.Status,
		Metadata: r.Metadata, Level: r.Level, Path: r.Path,
		CreatedAt: r.CreatedAt, UpdatedAt: r.UpdatedAt,
	}
}

func (s *DBStore) ListGroups(f QueryFilter) Page[Group] {
	var rows []groupRow
	q := s.scope(s.db.Model(&groupRow{}), f, "name", "description")
	if f.Type != "" {
		q = q.Where("group_type = ?", f.Type)
	}
	if f.ParentID != "" {
		q = q.Where("parent_id = ?", f.ParentID)
	}
	var total int64
	q.Count(&total)
	off, lim := pageArgs(f)
	q.Order("level asc, created_at asc").Offset(off).Limit(lim).Find(&rows)
	items := make([]Group, len(rows))
	for i, r := range rows {
		items[i] = toGroup(r)
	}
	return Page[Group]{Total: total, Offset: off, Limit: lim, Items: items}
}

func (s *DBStore) GetGroup(id string) (Group, error) {
	var r groupRow
	if err := s.db.First(&r, "id = ?", id).Error; err != nil {
		if isNotFound(err) {
			return Group{}, ErrNotFound
		}
		return Group{}, err
	}
	return toGroup(r), nil
}

func (s *DBStore) SaveGroup(g Group) Group {
	if g.ID == "" {
		g.ID = GenID("grp")
	}
	level, path := 1, "/"+g.ID
	if g.ParentID != "" {
		if parent, err := s.GetGroup(g.ParentID); err == nil {
			level = parent.Level + 1
			path = parent.Path + "/" + g.ID
		}
	}
	row := groupRow{
		ID: g.ID, Name: g.Name, WorkspaceID: g.WorkspaceID, GroupType: g.GroupType,
		ParentID: g.ParentID, Description: g.Description, Status: g.Status,
		Metadata: JSONMap(g.Metadata), Level: level, Path: path,
	}
	var existing groupRow
	if s.db.First(&existing, "id = ?", g.ID).Error == nil {
		row.CreatedAt = existing.CreatedAt
	} else {
		row.CreatedAt = time.Now()
	}
	row.UpdatedAt = time.Now()
	s.db.Save(&row)
	out, _ := s.GetGroup(g.ID)
	return out
}

func (s *DBStore) DeleteGroup(id string) {
	s.db.Delete(&groupRow{}, "id = ?", id)
	s.db.Where("group_id = ?", id).Delete(&groupEntityRow{})
	s.db.Model(&groupRow{}).Where("parent_id = ?", id).Update("parent_id", "")
}

func (s *DBStore) AssignToGroup(groupID, entityID, entityType, wsID string) error {
	var count int64
	s.db.Model(&groupEntityRow{}).Where("group_id = ? AND entity_id = ?", groupID, entityID).Count(&count)
	if count > 0 {
		return nil
	}
	return s.db.Create(&groupEntityRow{
		GroupID: groupID, EntityID: entityID, EntityType: entityType, WorkspaceID: wsID,
	}).Error
}

func (s *DBStore) RemoveFromGroup(groupID, entityID string) error {
	return s.db.Where("group_id = ? AND entity_id = ?", groupID, entityID).Delete(&groupEntityRow{}).Error
}

func (s *DBStore) ListGroupEntities(groupID, entityType string) []string {
	var rows []groupEntityRow
	q := s.db.Where("group_id = ?", groupID)
	if entityType != "" {
		q = q.Where("entity_type = ?", entityType)
	}
	q.Find(&rows)
	ids := make([]string, len(rows))
	for i, r := range rows {
		ids[i] = r.EntityID
	}
	return ids
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

func toRule(r ruleRow) Rule {
	return Rule{
		ID: r.ID, Name: r.Name, WorkspaceID: r.WorkspaceID, InputChannel: r.InputChannel,
		InputTopic: r.InputTopic, Logic: r.Logic, Outputs: r.Outputs, Status: r.Status,
		Tags: []string(r.Tags), Metadata: r.Metadata, CreatedAt: r.CreatedAt, UpdatedAt: r.UpdatedAt,
	}
}

func (s *DBStore) ListRules(f QueryFilter) Page[Rule] {
	var rows []ruleRow
	q := s.scope(s.db.Model(&ruleRow{}), f, "name")
	var total int64
	q.Count(&total)
	off, lim := pageArgs(f)
	q.Order("created_at desc").Offset(off).Limit(lim).Find(&rows)
	items := make([]Rule, len(rows))
	for i, r := range rows {
		items[i] = toRule(r)
	}
	return Page[Rule]{Total: total, Offset: off, Limit: lim, Items: items}
}

func (s *DBStore) GetRule(id string) (Rule, error) {
	var r ruleRow
	if err := s.db.First(&r, "id = ?", id).Error; err != nil {
		if isNotFound(err) {
			return Rule{}, ErrNotFound
		}
		return Rule{}, err
	}
	return toRule(r), nil
}

func (s *DBStore) SaveRule(rl Rule) Rule {
	if rl.ID == "" {
		rl.ID = GenID("rule")
	}
	row := ruleRow{
		ID: rl.ID, Name: rl.Name, WorkspaceID: rl.WorkspaceID, InputChannel: rl.InputChannel,
		InputTopic: rl.InputTopic, Logic: JSONMap(rl.Logic), Outputs: JSONMap(rl.Outputs),
		Status: rl.Status, Tags: StringList(rl.Tags), Metadata: JSONMap(rl.Metadata),
	}
	var existing ruleRow
	if s.db.First(&existing, "id = ?", rl.ID).Error == nil {
		row.CreatedAt = existing.CreatedAt
	} else {
		row.CreatedAt = time.Now()
	}
	row.UpdatedAt = time.Now()
	s.db.Save(&row)
	out, _ := s.GetRule(rl.ID)
	return out
}

func (s *DBStore) DeleteRule(id string) {
	s.db.Delete(&ruleRow{}, "id = ?", id)
}

// ---------------------------------------------------------------------------
// Alarms
// ---------------------------------------------------------------------------

func toAlarm(r alarmRow) Alarm {
	return Alarm{
		ID: r.ID, WorkspaceID: r.WorkspaceID, DeviceID: r.DeviceID, RuleID: r.RuleID,
		Severity: r.Severity, Title: r.Title, Summary: r.Summary, Status: r.Status,
		AssigneeID: r.AssigneeID, Acknowledger: r.Acknowledger, Resolver: r.Resolver,
		History: []string(r.History), Details: r.Details,
		CreatedAt: r.CreatedAt, UpdatedAt: r.UpdatedAt,
	}
}

func (s *DBStore) ListAlarms(f QueryFilter) Page[Alarm] {
	var rows []alarmRow
	q := s.scope(s.db.Model(&alarmRow{}), f, "title", "summary")
	if f.Kind != "" {
		q = q.Where("severity = ?", f.Kind)
	}
	if f.ParentID != "" {
		q = q.Where("device_id = ?", f.ParentID)
	}
	var total int64
	q.Count(&total)
	off, lim := pageArgs(f)
	q.Order("created_at desc").Offset(off).Limit(lim).Find(&rows)
	items := make([]Alarm, len(rows))
	for i, r := range rows {
		items[i] = toAlarm(r)
	}
	return Page[Alarm]{Total: total, Offset: off, Limit: lim, Items: items}
}

func (s *DBStore) GetAlarm(id string) (Alarm, error) {
	var r alarmRow
	if err := s.db.First(&r, "id = ?", id).Error; err != nil {
		if isNotFound(err) {
			return Alarm{}, ErrNotFound
		}
		return Alarm{}, err
	}
	return toAlarm(r), nil
}

func (s *DBStore) SaveAlarm(a Alarm) Alarm {
	if a.ID == "" {
		a.ID = GenID("alm")
	}
	row := alarmRow{
		ID: a.ID, WorkspaceID: a.WorkspaceID, DeviceID: a.DeviceID, RuleID: a.RuleID,
		Severity: a.Severity, Title: a.Title, Summary: a.Summary, Status: a.Status,
		AssigneeID: a.AssigneeID, Acknowledger: a.Acknowledger, Resolver: a.Resolver,
		History: StringList(a.History), Details: JSONMap(a.Details),
	}
	var existing alarmRow
	if s.db.First(&existing, "id = ?", a.ID).Error == nil {
		row.CreatedAt = existing.CreatedAt
	} else {
		row.CreatedAt = time.Now()
	}
	row.UpdatedAt = time.Now()
	s.db.Save(&row)
	out, _ := s.GetAlarm(a.ID)
	return out
}

// UpdateAlarmStatus moves an alarm along active -> acknowledged -> resolved and
// appends an audit line to its history, mirroring the official UI actions.
func (s *DBStore) UpdateAlarmStatus(id, status, actor string) (Alarm, error) {
	var r alarmRow
	if err := s.db.First(&r, "id = ?", id).Error; err != nil {
		if isNotFound(err) {
			return Alarm{}, ErrNotFound
		}
		return Alarm{}, err
	}
	stamps := []string(r.History)
	switch status {
	case "acknowledged":
		stamps = append(stamps, "Acknowledged by "+actor+" at "+time.Now().Format(time.RFC3339))
		r.Acknowledger = actor
	case "resolved":
		stamps = append(stamps, "Resolved by "+actor+" at "+time.Now().Format(time.RFC3339))
		r.Resolver = actor
	case "active":
		stamps = append(stamps, "Re-opened by "+actor+" at "+time.Now().Format(time.RFC3339))
		r.Acknowledger = ""
		r.Resolver = ""
	}
	updates := map[string]any{
		"status": status, "history": StringList(stamps), "updated_at": time.Now(),
		"acknowledger": r.Acknowledger, "resolver": r.Resolver,
	}
	if err := s.db.Model(&r).Updates(updates).Error; err != nil {
		return Alarm{}, err
	}
	return s.GetAlarm(id)
}

func (s *DBStore) AssignAlarm(id, assigneeID string) (Alarm, error) {
	var r alarmRow
	if err := s.db.First(&r, "id = ?", id).Error; err != nil {
		if isNotFound(err) {
			return Alarm{}, ErrNotFound
		}
		return Alarm{}, err
	}
	stamps := append([]string(r.History), "Assigned to "+assigneeID+" at "+time.Now().Format(time.RFC3339))
	if err := s.db.Model(&r).Updates(map[string]any{
		"assignee_id": assigneeID, "history": StringList(stamps), "updated_at": time.Now(),
	}).Error; err != nil {
		return Alarm{}, err
	}
	return s.GetAlarm(id)
}

// ---------------------------------------------------------------------------
// Bootstrap profiles & configs
// ---------------------------------------------------------------------------

func toBootstrapProfile(r bootstrapProfileRow) BootstrapProfile {
	return BootstrapProfile{
		ID: r.ID, Name: r.Name, WorkspaceID: r.WorkspaceID, Channels: []string(r.Channels),
		Content: r.Content, EncryptionKey: r.EncryptionKey, Encrypted: r.Encrypted,
		ClientVersion: r.ClientVersion, Metadata: r.Metadata,
		CreatedAt: r.CreatedAt, UpdatedAt: r.UpdatedAt,
	}
}

func (s *DBStore) ListBootstrapProfiles(f QueryFilter) Page[BootstrapProfile] {
	var rows []bootstrapProfileRow
	q := s.scope(s.db.Model(&bootstrapProfileRow{}), f, "name")
	var total int64
	q.Count(&total)
	off, lim := pageArgs(f)
	q.Order("created_at desc").Offset(off).Limit(lim).Find(&rows)
	items := make([]BootstrapProfile, len(rows))
	for i, r := range rows {
		items[i] = toBootstrapProfile(r)
	}
	return Page[BootstrapProfile]{Total: total, Offset: off, Limit: lim, Items: items}
}

func (s *DBStore) GetBootstrapProfile(id string) (BootstrapProfile, error) {
	var r bootstrapProfileRow
	if err := s.db.First(&r, "id = ?", id).Error; err != nil {
		if isNotFound(err) {
			return BootstrapProfile{}, ErrNotFound
		}
		return BootstrapProfile{}, err
	}
	return toBootstrapProfile(r), nil
}

func (s *DBStore) SaveBootstrapProfile(p BootstrapProfile) BootstrapProfile {
	if p.ID == "" {
		p.ID = GenID("prof")
	}
	row := bootstrapProfileRow{
		ID: p.ID, Name: p.Name, WorkspaceID: p.WorkspaceID, Channels: StringList(p.Channels),
		Content: p.Content, EncryptionKey: p.EncryptionKey, Encrypted: p.Encrypted,
		ClientVersion: p.ClientVersion, Metadata: JSONMap(p.Metadata),
	}
	var existing bootstrapProfileRow
	if s.db.First(&existing, "id = ?", p.ID).Error == nil {
		row.CreatedAt = existing.CreatedAt
	} else {
		row.CreatedAt = time.Now()
	}
	row.UpdatedAt = time.Now()
	s.db.Save(&row)
	out, _ := s.GetBootstrapProfile(p.ID)
	return out
}

func (s *DBStore) DeleteBootstrapProfile(id string) {
	s.db.Delete(&bootstrapProfileRow{}, "id = ?", id)
	s.db.Model(&bootstrapConfigRow{}).Where("profile_id = ?", id).Update("profile_id", "")
}

func toBootstrapConfig(r bootstrapConfigRow) BootstrapConfig {
	return BootstrapConfig{
		ID: r.ID, ExternalID: r.ExternalID, DeviceID: r.DeviceID, WorkspaceID: r.WorkspaceID,
		ProfileID: r.ProfileID, Channels: []string(r.Channels), Status: r.Status, Name: r.Name,
		Secure: r.Secure, MACAddr: r.MACAddr, CreatedAt: r.CreatedAt, UpdatedAt: r.UpdatedAt,
	}
}

func (s *DBStore) ListBootstrapConfigs(f QueryFilter) Page[BootstrapConfig] {
	var rows []bootstrapConfigRow
	q := s.scope(s.db.Model(&bootstrapConfigRow{}), f, "name", "external_id", "device_id")
	var total int64
	q.Count(&total)
	off, lim := pageArgs(f)
	q.Order("created_at desc").Offset(off).Limit(lim).Find(&rows)
	items := make([]BootstrapConfig, len(rows))
	for i, r := range rows {
		items[i] = toBootstrapConfig(r)
	}
	return Page[BootstrapConfig]{Total: total, Offset: off, Limit: lim, Items: items}
}

func (s *DBStore) GetBootstrapConfig(id string) (BootstrapConfig, error) {
	var r bootstrapConfigRow
	if err := s.db.First(&r, "id = ?", id).Error; err != nil {
		if isNotFound(err) {
			return BootstrapConfig{}, ErrNotFound
		}
		return BootstrapConfig{}, err
	}
	return toBootstrapConfig(r), nil
}

func (s *DBStore) SaveBootstrapConfig(c BootstrapConfig) BootstrapConfig {
	if c.ID == "" {
		c.ID = GenID("boot")
	}
	row := bootstrapConfigRow{
		ID: c.ID, ExternalID: c.ExternalID, DeviceID: c.DeviceID, WorkspaceID: c.WorkspaceID,
		ProfileID: c.ProfileID, Channels: StringList(c.Channels), Status: c.Status,
		Name: c.Name, Secure: c.Secure, MACAddr: c.MACAddr,
	}
	var existing bootstrapConfigRow
	if s.db.First(&existing, "id = ?", c.ID).Error == nil {
		row.CreatedAt = existing.CreatedAt
	} else {
		row.CreatedAt = time.Now()
	}
	row.UpdatedAt = time.Now()
	s.db.Save(&row)
	out, _ := s.GetBootstrapConfig(c.ID)
	return out
}

func (s *DBStore) DeleteBootstrapConfig(id string) {
	s.db.Delete(&bootstrapConfigRow{}, "id = ?", id)
}

// ---------------------------------------------------------------------------
// Device types & versions
// ---------------------------------------------------------------------------

func toDeviceType(r deviceTypeRow) DeviceType {
	return DeviceType{
		ID: r.ID, Name: r.Name, WorkspaceID: r.WorkspaceID, Kind: r.Kind,
		Description: r.Description, Metadata: r.Metadata, Attributes: r.Attributes,
		LatestVersion: r.LatestVersion, CreatedAt: r.CreatedAt, UpdatedAt: r.UpdatedAt,
	}
}

func (s *DBStore) ListDeviceTypes(f QueryFilter) Page[DeviceType] {
	var rows []deviceTypeRow
	q := s.scope(s.db.Model(&deviceTypeRow{}), f, "name", "kind")
	var total int64
	q.Count(&total)
	off, lim := pageArgs(f)
	q.Order("created_at desc").Offset(off).Limit(lim).Find(&rows)
	items := make([]DeviceType, len(rows))
	for i, r := range rows {
		items[i] = toDeviceType(r)
	}
	return Page[DeviceType]{Total: total, Offset: off, Limit: lim, Items: items}
}

func (s *DBStore) GetDeviceType(id string) (DeviceType, error) {
	var r deviceTypeRow
	if err := s.db.First(&r, "id = ?", id).Error; err != nil {
		if isNotFound(err) {
			return DeviceType{}, ErrNotFound
		}
		return DeviceType{}, err
	}
	return toDeviceType(r), nil
}

func (s *DBStore) SaveDeviceType(dt DeviceType) DeviceType {
	if dt.ID == "" {
		dt.ID = GenID("dt")
	}
	row := deviceTypeRow{
		ID: dt.ID, Name: dt.Name, WorkspaceID: dt.WorkspaceID, Kind: dt.Kind,
		Description: dt.Description, Metadata: JSONMap(dt.Metadata),
		Attributes: JSONMap(dt.Attributes), LatestVersion: dt.LatestVersion,
	}
	var existing deviceTypeRow
	if s.db.First(&existing, "id = ?", dt.ID).Error == nil {
		row.CreatedAt = existing.CreatedAt
		row.LatestVersion = firstNonEmpty(row.LatestVersion, existing.LatestVersion)
	} else {
		row.CreatedAt = time.Now()
	}
	row.UpdatedAt = time.Now()
	s.db.Save(&row)
	out, _ := s.GetDeviceType(dt.ID)
	return out
}

func (s *DBStore) DeleteDeviceType(id string) {
	s.db.Delete(&deviceTypeRow{}, "id = ?", id)
	s.db.Where("device_type_id = ?", id).Delete(&deviceTypeVersionRow{})
}

func (s *DBStore) ListDeviceTypeVersions(typeID string) []DeviceTypeVersion {
	var rows []deviceTypeVersionRow
	s.db.Where("device_type_id = ?", typeID).Order("created_at desc").Find(&rows)
	items := make([]DeviceTypeVersion, len(rows))
	for i, r := range rows {
		items[i] = DeviceTypeVersion{
			ID: r.ID, DeviceTypeID: r.DeviceTypeID, Version: r.Version, WorkspaceID: r.WorkspaceID,
			Manifest: r.Manifest, ReleaseNote: r.ReleaseNote, Status: r.Status,
			CreatedAt: r.CreatedAt, UpdatedAt: r.UpdatedAt,
		}
	}
	return items
}

func (s *DBStore) SaveDeviceTypeVersion(v DeviceTypeVersion) DeviceTypeVersion {
	if v.ID == "" {
		v.ID = GenID("dtv")
	}
	row := deviceTypeVersionRow{
		ID: v.ID, DeviceTypeID: v.DeviceTypeID, Version: v.Version, WorkspaceID: v.WorkspaceID,
		Manifest: JSONMap(v.Manifest), ReleaseNote: v.ReleaseNote, Status: v.Status,
	}
	var existing deviceTypeVersionRow
	if s.db.First(&existing, "id = ?", v.ID).Error == nil {
		row.CreatedAt = existing.CreatedAt
	} else {
		row.CreatedAt = time.Now()
	}
	row.UpdatedAt = time.Now()
	s.db.Save(&row)
	if v.Version != "" {
		s.db.Model(&deviceTypeRow{}).Where("id = ?", v.DeviceTypeID).
			Updates(map[string]any{"latest_version": v.Version, "updated_at": time.Now()})
	}
	var out deviceTypeVersionRow
	s.db.First(&out, "id = ?", v.ID)
	return DeviceTypeVersion{
		ID: out.ID, DeviceTypeID: out.DeviceTypeID, Version: out.Version, WorkspaceID: out.WorkspaceID,
		Manifest: out.Manifest, ReleaseNote: out.ReleaseNote, Status: out.Status,
		CreatedAt: out.CreatedAt, UpdatedAt: out.UpdatedAt,
	}
}

func (s *DBStore) DeleteDeviceTypeVersion(id string) {
	s.db.Delete(&deviceTypeVersionRow{}, "id = ?", id)
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

func toReport(r reportRow) Report {
	return Report{
		ID: r.ID, Name: r.Name, WorkspaceID: r.WorkspaceID, TemplateID: r.TemplateID,
		Format: r.Format, TimeFrom: r.TimeFrom, TimeTo: r.TimeTo, Channels: []string(r.Channels),
		Status: r.Status, Members: []string(r.Members), Result: r.Result,
		DownloadURL: r.DownloadURL, CreatedAt: r.CreatedAt, UpdatedAt: r.UpdatedAt,
	}
}

func (s *DBStore) ListReports(f QueryFilter) Page[Report] {
	var rows []reportRow
	q := s.scope(s.db.Model(&reportRow{}), f, "name")
	var total int64
	q.Count(&total)
	off, lim := pageArgs(f)
	q.Order("created_at desc").Offset(off).Limit(lim).Find(&rows)
	items := make([]Report, len(rows))
	for i, r := range rows {
		items[i] = toReport(r)
	}
	return Page[Report]{Total: total, Offset: off, Limit: lim, Items: items}
}

func (s *DBStore) GetReport(id string) (Report, error) {
	var r reportRow
	if err := s.db.First(&r, "id = ?", id).Error; err != nil {
		if isNotFound(err) {
			return Report{}, ErrNotFound
		}
		return Report{}, err
	}
	return toReport(r), nil
}

func (s *DBStore) SaveReport(rp Report) Report {
	if rp.ID == "" {
		rp.ID = GenID("rep")
	}
	row := reportRow{
		ID: rp.ID, Name: rp.Name, WorkspaceID: rp.WorkspaceID, TemplateID: rp.TemplateID,
		Format: rp.Format, TimeFrom: rp.TimeFrom, TimeTo: rp.TimeTo,
		Channels: StringList(rp.Channels), Status: rp.Status, Members: StringList(rp.Members),
		Result: JSONMap(rp.Result), DownloadURL: rp.DownloadURL,
	}
	var existing reportRow
	if s.db.First(&existing, "id = ?", rp.ID).Error == nil {
		row.CreatedAt = existing.CreatedAt
	} else {
		row.CreatedAt = time.Now()
	}
	row.UpdatedAt = time.Now()
	s.db.Save(&row)
	out, _ := s.GetReport(rp.ID)
	return out
}

func (s *DBStore) DeleteReport(id string) {
	s.db.Delete(&reportRow{}, "id = ?", id)
}

// ---------------------------------------------------------------------------
// Dashboards
// ---------------------------------------------------------------------------

func toDashboard(r dashboardRow) Dashboard {
	return Dashboard{
		ID: r.ID, Name: r.Name, WorkspaceID: r.WorkspaceID, Description: r.Description,
		Layout: r.Layout, Shareable: r.Shareable, ShareToken: r.ShareToken,
		Metadata: r.Metadata, CreatedAt: r.CreatedAt, UpdatedAt: r.UpdatedAt,
	}
}

func (s *DBStore) ListDashboards(f QueryFilter) Page[Dashboard] {
	var rows []dashboardRow
	q := s.scope(s.db.Model(&dashboardRow{}), f, "name", "description")
	var total int64
	q.Count(&total)
	off, lim := pageArgs(f)
	q.Order("created_at desc").Offset(off).Limit(lim).Find(&rows)
	items := make([]Dashboard, len(rows))
	for i, r := range rows {
		items[i] = toDashboard(r)
	}
	return Page[Dashboard]{Total: total, Offset: off, Limit: lim, Items: items}
}

func (s *DBStore) GetDashboard(id string) (Dashboard, error) {
	var r dashboardRow
	if err := s.db.First(&r, "id = ?", id).Error; err != nil {
		if isNotFound(err) {
			return Dashboard{}, ErrNotFound
		}
		return Dashboard{}, err
	}
	return toDashboard(r), nil
}

func (s *DBStore) GetDashboardByShareToken(token string) (Dashboard, error) {
	var r dashboardRow
	if err := s.db.First(&r, "share_token = ?", token).Error; err != nil {
		if isNotFound(err) {
			return Dashboard{}, ErrNotFound
		}
		return Dashboard{}, err
	}
	return toDashboard(r), nil
}

func (s *DBStore) SaveDashboard(d Dashboard) Dashboard {
	if d.ID == "" {
		d.ID = GenID("dash")
	}
	row := dashboardRow{
		ID: d.ID, Name: d.Name, WorkspaceID: d.WorkspaceID, Description: d.Description,
		Layout: JSONMap(d.Layout), Shareable: d.Shareable, ShareToken: d.ShareToken,
		Metadata: JSONMap(d.Metadata),
	}
	var existing dashboardRow
	if s.db.First(&existing, "id = ?", d.ID).Error == nil {
		row.CreatedAt = existing.CreatedAt
		row.ShareToken = firstNonEmpty(row.ShareToken, existing.ShareToken)
	} else {
		row.CreatedAt = time.Now()
	}
	if row.Shareable && row.ShareToken == "" {
		row.ShareToken = "share_" + strings.ReplaceAll(GenID(""), "-", "")
	}
	row.UpdatedAt = time.Now()
	s.db.Save(&row)
	out, _ := s.GetDashboard(d.ID)
	return out
}

func (s *DBStore) DeleteDashboard(id string) {
	s.db.Delete(&dashboardRow{}, "id = ?", id)
}

// ---------------------------------------------------------------------------
// Custom nodes
// ---------------------------------------------------------------------------

func toCustomNode(r customNodeRow) CustomNode {
	return CustomNode{
		ID: r.ID, Name: r.Name, WorkspaceID: r.WorkspaceID, Kind: r.Kind, Runtime: r.Runtime,
		Entry: r.Entry, Size: r.Size, Version: r.Version, Status: r.Status, Metadata: r.Metadata,
		CreatedAt: r.CreatedAt, UpdatedAt: r.UpdatedAt,
	}
}

func (s *DBStore) ListCustomNodes(f QueryFilter) Page[CustomNode] {
	var rows []customNodeRow
	q := s.scope(s.db.Model(&customNodeRow{}), f, "name", "runtime")
	if f.Kind != "" {
		q = q.Where("kind = ?", f.Kind)
	}
	var total int64
	q.Count(&total)
	off, lim := pageArgs(f)
	q.Order("created_at desc").Offset(off).Limit(lim).Find(&rows)
	items := make([]CustomNode, len(rows))
	for i, r := range rows {
		items[i] = toCustomNode(r)
	}
	return Page[CustomNode]{Total: total, Offset: off, Limit: lim, Items: items}
}

func (s *DBStore) GetCustomNode(id string) (CustomNode, error) {
	var r customNodeRow
	if err := s.db.First(&r, "id = ?", id).Error; err != nil {
		if isNotFound(err) {
			return CustomNode{}, ErrNotFound
		}
		return CustomNode{}, err
	}
	return toCustomNode(r), nil
}

func (s *DBStore) SaveCustomNode(n CustomNode) CustomNode {
	if n.ID == "" {
		n.ID = GenID("node")
	}
	row := customNodeRow{
		ID: n.ID, Name: n.Name, WorkspaceID: n.WorkspaceID, Kind: n.Kind, Runtime: n.Runtime,
		Entry: n.Entry, Size: n.Size, Version: n.Version, Status: n.Status,
		Metadata: JSONMap(n.Metadata),
	}
	var existing customNodeRow
	if s.db.First(&existing, "id = ?", n.ID).Error == nil {
		row.CreatedAt = existing.CreatedAt
	} else {
		row.CreatedAt = time.Now()
	}
	row.UpdatedAt = time.Now()
	s.db.Save(&row)
	out, _ := s.GetCustomNode(n.ID)
	return out
}

func (s *DBStore) DeleteCustomNode(id string) {
	s.db.Delete(&customNodeRow{}, "id = ?", id)
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

func (s *DBStore) SaveMessage(m MessageRecord) MessageRecord {
	if m.ID == "" {
		m.ID = GenID("msg")
	}
	if m.CreatedAt.IsZero() {
		m.CreatedAt = time.Now()
	}
	if m.Time == 0 {
		m.Time = m.CreatedAt.UnixMilli()
	}
	s.db.Create(&messageRow{
		ID: m.ID, ChannelID: m.ChannelID, Subtopic: m.Subtopic, Publisher: m.Publisher,
		Protocol: m.Protocol, Payload: m.Payload, Name: m.Name, Value: m.Value,
		Unit: m.Unit, Time: m.Time, CreatedAt: m.CreatedAt,
	})
	return m
}

func (s *DBStore) ListMessages(channelID string, limit int) []MessageRecord {
	if limit <= 0 {
		limit = 50
	}
	var rows []messageRow
	q := s.db.Order("created_at desc").Limit(limit)
	if channelID != "" {
		q = q.Where("channel_id = ?", channelID)
	}
	q.Find(&rows)
	items := make([]MessageRecord, len(rows))
	for i, r := range rows {
		items[i] = MessageRecord{
			ID: r.ID, ChannelID: r.ChannelID, Subtopic: r.Subtopic, Publisher: r.Publisher,
			Protocol: r.Protocol, Payload: r.Payload, Name: r.Name, Value: r.Value,
			Unit: r.Unit, Time: r.Time, CreatedAt: r.CreatedAt,
		}
	}
	return items
}

// ---------------------------------------------------------------------------
// Journals
// ---------------------------------------------------------------------------

func (s *DBStore) AddJournal(j Journal) Journal {
	if j.ID == "" {
		j.ID = GenID("jrn")
	}
	if j.CreatedAt.IsZero() {
		j.CreatedAt = time.Now()
	}
	s.db.Create(&journalRow{
		ID: j.ID, WorkspaceID: j.WorkspaceID, EntityID: j.EntityID, EntityType: j.EntityType,
		Operation: j.Operation, Attributes: JSONMap(j.Attributes), Metadata: JSONMap(j.Metadata),
		UserID: j.UserID, CreatedAt: j.CreatedAt,
	})
	return j
}

func (s *DBStore) ListJournals(entityID string, limit int) []Journal {
	if limit <= 0 {
		limit = 50
	}
	var rows []journalRow
	q := s.db.Order("created_at desc").Limit(limit)
	if entityID != "" {
		q = q.Where("entity_id = ?", entityID)
	}
	q.Find(&rows)
	items := make([]Journal, len(rows))
	for i, r := range rows {
		items[i] = Journal{
			ID: r.ID, WorkspaceID: r.WorkspaceID, EntityID: r.EntityID, EntityType: r.EntityType,
			Operation: r.Operation, Attributes: r.Attributes, Metadata: r.Metadata,
			UserID: r.UserID, CreatedAt: r.CreatedAt,
		}
	}
	return items
}

// ---------------------------------------------------------------------------
// Invitations
// ---------------------------------------------------------------------------

func toInvitation(r invitationRow) Invitation {
	return Invitation{
		ID: r.ID, WorkspaceID: r.WorkspaceID, Email: r.Email, Role: r.Role, Token: r.Token,
		Status: r.Status, InvitedBy: r.InvitedBy, ExpiresAt: r.ExpiresAt, CreatedAt: r.CreatedAt,
	}
}

func (s *DBStore) ListInvitations(wsID string) []Invitation {
	var rows []invitationRow
	q := s.db.Order("created_at desc")
	if wsID != "" {
		q = q.Where("workspace_id = ?", wsID)
	}
	q.Find(&rows)
	items := make([]Invitation, len(rows))
	for i, r := range rows {
		items[i] = toInvitation(r)
	}
	return items
}

func (s *DBStore) CreateInvitation(inv Invitation) Invitation {
	if inv.ID == "" {
		inv.ID = GenID("inv")
	}
	if inv.Token == "" {
		inv.Token = "inv_" + strings.ReplaceAll(GenID(""), "-", "")
	}
	if inv.Status == "" {
		inv.Status = "pending"
	}
	if inv.ExpiresAt.IsZero() {
		inv.ExpiresAt = time.Now().Add(7 * 24 * time.Hour)
	}
	row := invitationRow{
		ID: inv.ID, WorkspaceID: inv.WorkspaceID, Email: inv.Email, Role: inv.Role,
		Token: inv.Token, Status: inv.Status, InvitedBy: inv.InvitedBy,
		ExpiresAt: inv.ExpiresAt, CreatedAt: time.Now(),
	}
	s.db.Create(&row)
	return toInvitation(row)
}

func (s *DBStore) GetInvitationByToken(token string) (Invitation, error) {
	var r invitationRow
	if err := s.db.First(&r, "token = ?", token).Error; err != nil {
		if isNotFound(err) {
			return Invitation{}, ErrNotFound
		}
		return Invitation{}, err
	}
	return toInvitation(r), nil
}

func (s *DBStore) AcceptInvitation(token, userID string) error {
	var r invitationRow
	if err := s.db.First(&r, "token = ?", token).Error; err != nil {
		if isNotFound(err) {
			return ErrNotFound
		}
		return err
	}
	if r.Status != "pending" {
		return errors.New("invitation already used")
	}
	if time.Now().After(r.ExpiresAt) {
		s.db.Model(&r).Update("status", "expired")
		return errors.New("invitation expired")
	}
	if err := s.db.Model(&r).Update("status", "accepted").Error; err != nil {
		return err
	}
	return s.db.Model(&userRow{}).Where("id = ?", userID).
		Update("updated_at", time.Now()).Error
}

func (s *DBStore) DeleteInvitation(id string) {
	s.db.Delete(&invitationRow{}, "id = ?", id)
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

func toUser(r userRow) User {
	return User{
		ID: r.ID, Email: r.Email, Name: r.Name, Username: r.Username, Role: r.Role,
		Status: r.Status, Profile: r.Profile, Verified: r.Verified,
		CreatedAt: r.CreatedAt, UpdatedAt: r.UpdatedAt,
	}
}

func (s *DBStore) ListUsers(f QueryFilter) Page[User] {
	var rows []userRow
	q := s.db.Model(&userRow{})
	if f.Query != "" {
		like := "%" + f.Query + "%"
		q = q.Where("name "+s.likeOp()+" ? OR email "+s.likeOp()+" ? OR username "+s.likeOp()+" ?", like, like, like)
	}
	if f.Status != "" {
		q = q.Where("status = ?", f.Status)
	}
	var total int64
	q.Count(&total)
	off, lim := pageArgs(f)
	q.Order("created_at desc").Offset(off).Limit(lim).Find(&rows)
	items := make([]User, len(rows))
	for i, r := range rows {
		items[i] = toUser(r)
	}
	return Page[User]{Total: total, Offset: off, Limit: lim, Items: items}
}

func (s *DBStore) GetUser(id string) (User, error) {
	var r userRow
	if err := s.db.First(&r, "id = ?", id).Error; err != nil {
		if isNotFound(err) {
			return User{}, ErrNotFound
		}
		return User{}, err
	}
	return toUser(r), nil
}

func (s *DBStore) GetUserByEmail(email string) (User, bool) {
	var r userRow
	if err := s.db.First(&r, "email = ?", email).Error; err != nil {
		return User{}, false
	}
	return toUser(r), true
}

func (s *DBStore) SaveUser(u User) User {
	if u.ID == "" {
		u.ID = GenID("usr")
	}
	row := userRow{
		ID: u.ID, Email: u.Email, Name: u.Name, Username: u.Username, Role: u.Role,
		Status: u.Status, Profile: JSONMap(u.Profile), Verified: u.Verified,
	}
	var existing userRow
	if s.db.First(&existing, "id = ?", u.ID).Error == nil {
		row.CreatedAt = existing.CreatedAt
	} else if match, ok := s.GetUserByEmail(u.Email); ok {
		u.ID = match.ID
		row.ID = match.ID
		row.CreatedAt = match.CreatedAt
		// row.PasswordHash = existing.PasswordHash
	} else {
		row.CreatedAt = time.Now()
	}
	row.UpdatedAt = time.Now()
	s.db.Save(&row)
	out, _ := s.GetUser(u.ID)
	return out
}

func (s *DBStore) DeleteUser(id string) {
	s.db.Delete(&userRow{}, "id = ?", id)
	s.db.Where("user_id = ?", id).Delete(&patRow{})
}

// ---------------------------------------------------------------------------
// PATs
// ---------------------------------------------------------------------------

func toPAT(r patRow) PAT {
	return PAT{
		ID: r.ID, Name: r.Name, Token: r.Token, UserID: r.UserID, WorkspaceID: r.WorkspaceID,
		Operations: []string(r.Operations), Duration: r.Duration, Status: r.Status,
		Metadata: r.Metadata, LastUsedAt: r.LastUsedAt, ExpiresAt: r.ExpiresAt, CreatedAt: r.CreatedAt,
	}
}

func (s *DBStore) ListPATs(userID, wsID string) []PAT {
	var rows []patRow
	q := s.db.Order("created_at desc")
	if userID != "" {
		q = q.Where("user_id = ?", userID)
	}
	if wsID != "" {
		q = q.Where("workspace_id = ?", wsID)
	}
	q.Find(&rows)
	items := make([]PAT, len(rows))
	for i, r := range rows {
		items[i] = toPAT(r)
	}
	return items
}

func (s *DBStore) GetPAT(id string) (PAT, error) {
	var r patRow
	if err := s.db.First(&r, "id = ?", id).Error; err != nil {
		if isNotFound(err) {
			return PAT{}, ErrNotFound
		}
		return PAT{}, err
	}
	return toPAT(r), nil
}

func (s *DBStore) SavePAT(p PAT) PAT {
	if p.ID == "" {
		p.ID = GenID("pat")
	}
	if p.CreatedAt.IsZero() {
		p.CreatedAt = time.Now()
	}
	s.db.Save(&patRow{
		ID: p.ID, Name: p.Name, Token: p.Token, UserID: p.UserID, WorkspaceID: p.WorkspaceID,
		Operations: StringList(p.Operations), Duration: p.Duration, Status: p.Status,
		Metadata: JSONMap(p.Metadata), LastUsedAt: p.LastUsedAt, ExpiresAt: p.ExpiresAt,
		CreatedAt: p.CreatedAt,
	})
	out, _ := s.GetPAT(p.ID)
	return out
}

func (s *DBStore) DeletePAT(id string) {
	s.db.Delete(&patRow{}, "id = ?", id)
}

// ---------------------------------------------------------------------------
// Support tickets
// ---------------------------------------------------------------------------

func (s *DBStore) CreateSupportTicket(t SupportTicket) SupportTicket {
	if t.ID == "" {
		t.ID = GenID("tick")
	}
	if t.Status == "" {
		t.Status = "open"
	}
	row := supportTicketRow{
		ID: t.ID, UserID: t.UserID, Email: t.Email, Subject: t.Subject, Message: t.Message,
		Status: t.Status, Labels: StringList(t.Labels), Metadata: JSONMap(t.Metadata),
		CreatedAt: time.Now(),
	}
	s.db.Create(&row)
	t.CreatedAt = row.CreatedAt
	t.Status = row.Status
	t.ID = row.ID
	return t
}

func (s *DBStore) ListSupportTickets(userID string) []SupportTicket {
	var rows []supportTicketRow
	q := s.db.Order("created_at desc")
	if userID != "" {
		q = q.Where("user_id = ?", userID)
	}
	q.Find(&rows)
	items := make([]SupportTicket, len(rows))
	for i, r := range rows {
		items[i] = SupportTicket{
			ID: r.ID, UserID: r.UserID, Email: r.Email, Subject: r.Subject, Message: r.Message,
			Status: r.Status, Labels: []string(r.Labels), Metadata: r.Metadata, CreatedAt: r.CreatedAt,
		}
	}
	return items
}
