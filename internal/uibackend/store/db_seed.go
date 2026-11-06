// Copyright (c) Abstract Machines
// SPDX-License-Identifier: Apache-2.0

package store

import "time"

func (s *DBStore) seedDemoData() error {
	now := time.Now()
	wsID := "ws-default-01"

	adminUser := userRow{
		ID:        "usr-admin",
		Email:     "admin@magistrala.local",
		Name:      "系统超级管理员 (Super Admin)",
		Username:  "admin",
		Role:      "admin",
		Status:    "enabled",
		Verified:  true,
		Profile:   JSONMap{"title": "物联网架构师", "company": "Magistrala Team"},
		CreatedAt: now.Add(-48 * time.Hour),
		UpdatedAt: now,
	}
	s.db.Create(&adminUser)

	regularUser := userRow{
		ID:        "usr-operator",
		Email:     "operator@magistrala.local",
		Name:      "车间操作员 (Operator)",
		Username:  "operator",
		Role:      "user",
		Status:    "enabled",
		Verified:  true,
		Profile:   JSONMap{"title": "设备运维工程师"},
		CreatedAt: now.Add(-24 * time.Hour),
		UpdatedAt: now,
	}
	s.db.Create(&regularUser)

	defaultWs := workspaceRow{
		ID:          wsID,
		Name:        "智能制造生产示范区 (Workspace Demo)",
		Alias:       "smart-factory",
		Description: "Magistrala 物联网管理控制台演示工作空间，包含设备连接、通信通道、规则引擎与告警全链路配置",
		Status:      "enabled",
		OwnerID:     adminUser.ID,
		Metadata:    JSONMap{"industry": "industrial-iot", "location": "Building A"},
		CreatedAt:   now.Add(-48 * time.Hour),
		UpdatedAt:   now,
	}
	s.db.Create(&defaultWs)

	// Gateway
	gw := deviceRow{
		ID:          "gw-edge-01",
		Name:        "边缘智能网关 (Edge Gateway 01)",
		WorkspaceID: wsID,
		Status:      "enabled",
		Credentials: JSONMap{"secret": "sec_gw_edge_001", "type": "token"},
		Tags:        StringList{"gateway", "industrial", "modbus"},
		Metadata:    JSONMap{"ip": "192.168.1.100", "firmware": "v2.4.1", "location": "配电间 A"},
		IsGateway:   true,
		CreatedAt:   now.Add(-36 * time.Hour),
		UpdatedAt:   now,
	}
	s.db.Create(&gw)

	// Devices (one attached to gateway, one standalone)
	d1 := deviceRow{
		ID:          "dev-sensor-01",
		Name:        "工业温湿度传感器 (Temp & Humidity)",
		WorkspaceID: wsID,
		Status:      "enabled",
		Credentials: JSONMap{"secret": "sec_dev_sens_001", "type": "token"},
		Tags:        StringList{"sensor", "temperature", "lora"},
		Metadata:    JSONMap{"protocol": "MQTT", "unit": "Celsius", "range": "-40~85C"},
		ParentID:    gw.ID,
		DeviceType:  "dt-sens-env",
		IsGateway:   false,
		CreatedAt:   now.Add(-24 * time.Hour),
		UpdatedAt:   now,
	}
	s.db.Create(&d1)

	d2 := deviceRow{
		ID:          "dev-power-meter-01",
		Name:        "三相多功能智能电表 (Power Meter)",
		WorkspaceID: wsID,
		Status:      "enabled",
		Credentials: JSONMap{"secret": "sec_meter_9921", "type": "token"},
		Tags:        StringList{"meter", "power", "grid"},
		Metadata:    JSONMap{"protocol": "MQTT", "voltage": 380, "frequency": 50},
		DeviceType:  "dt-meter-power",
		IsGateway:   false,
		CreatedAt:   now.Add(-20 * time.Hour),
		UpdatedAt:   now,
	}
	s.db.Create(&d2)

	// Channels
	cTelemetry := channelRow{
		ID:          "chan-telemetry-01",
		Name:        "传感器遥测上报通道 (Telemetry Channel)",
		WorkspaceID: wsID,
		Status:      "enabled",
		Metadata:    JSONMap{"format": "senml+json", "retention": "30d", "protocol": "mqtt"},
		CreatedAt:   now.Add(-36 * time.Hour),
		UpdatedAt:   now,
	}
	s.db.Create(&cTelemetry)

	cControl := channelRow{
		ID:          "chan-control-01",
		Name:        "设备下行控制指令通道 (Control Channel)",
		WorkspaceID: wsID,
		Status:      "enabled",
		Metadata:    JSONMap{"format": "json", "qos": 1},
		CreatedAt:   now.Add(-36 * time.Hour),
		UpdatedAt:   now,
	}
	s.db.Create(&cControl)

	// Connections: bind sensors to telemetry channel
	s.db.Create(&connectionRow{DeviceID: d1.ID, ChannelID: cTelemetry.ID, WorkspaceID: wsID, CreatedAt: now})
	s.db.Create(&connectionRow{DeviceID: d2.ID, ChannelID: cTelemetry.ID, WorkspaceID: wsID, CreatedAt: now})
	s.db.Create(&connectionRow{DeviceID: gw.ID, ChannelID: cControl.ID, WorkspaceID: wsID, CreatedAt: now})

	// Group: object group
	grp := groupRow{
		ID:          "grp-factory-1",
		Name:        "智能车间 1 号区域 (Workshop 1)",
		WorkspaceID: wsID,
		GroupType:   "object",
		Description: "车间1号自动化装配线全量物联节点",
		Status:      "enabled",
		Metadata:    JSONMap{"zone": "zone-1", "manager": "Zhang"},
		Level:       1,
		Path:        "/grp-factory-1",
		CreatedAt:   now.Add(-30 * time.Hour),
		UpdatedAt:   now,
	}
	s.db.Create(&grp)
	s.db.Create(&groupEntityRow{GroupID: grp.ID, EntityID: d1.ID, EntityType: "device", WorkspaceID: wsID})
	s.db.Create(&groupEntityRow{GroupID: grp.ID, EntityID: d2.ID, EntityType: "device", WorkspaceID: wsID})
	s.db.Create(&groupEntityRow{GroupID: grp.ID, EntityID: cTelemetry.ID, EntityType: "channel", WorkspaceID: wsID})

	// Rule
	rule := ruleRow{
		ID:           "rule-temp-warning",
		Name:         "车间高温超限联动告警",
		WorkspaceID:  wsID,
		InputChannel: cTelemetry.ID,
		InputTopic:   "channels/+/messages",
		Logic:        JSONMap{"field": "temperature", "operator": ">", "threshold": 40},
		Outputs:      JSONMap{"action": "create_alarm", "severity": "critical", "notify": "email"},
		Status:       "enabled",
		Tags:         StringList{"safety", "temperature"},
		Metadata:     JSONMap{"cooldown_seconds": 300},
		CreatedAt:    now.Add(-18 * time.Hour),
		UpdatedAt:    now,
	}
	s.db.Create(&rule)

	// Alarms (all 3 lifecycle stages represented)
	s.db.Create(&alarmRow{
		ID:          "alm-001",
		WorkspaceID: wsID,
		DeviceID:    d1.ID,
		RuleID:      rule.ID,
		Severity:    "critical",
		Title:       "设备 dev-sensor-01 温度达到 43.5°C 严重超标",
		Summary:     "连续 3 次遥测采集超过 40°C 安全红线，请立即排查散热系统",
		Status:      "active",
		AssigneeID:  regularUser.ID,
		History:     StringList{"System triggered alarm at " + now.Add(-30*time.Minute).Format(time.RFC3339)},
		Details:     JSONMap{"temperature": 43.5, "sensor_id": d1.ID},
		CreatedAt:   now.Add(-30 * time.Minute),
		UpdatedAt:   now.Add(-30 * time.Minute),
	})
	s.db.Create(&alarmRow{
		ID:           "alm-002",
		WorkspaceID:  wsID,
		DeviceID:     d2.ID,
		RuleID:       rule.ID,
		Severity:     "high",
		Title:        "电表电压波动异常告警",
		Summary:      "智能电表瞬时电压跌落至 185V",
		Status:       "acknowledged",
		AssigneeID:   adminUser.ID,
		Acknowledger: adminUser.ID,
		History:      StringList{"Acknowledged by admin at " + now.Add(-1*time.Hour).Format(time.RFC3339)},
		Details:      JSONMap{"voltage": 185},
		CreatedAt:    now.Add(-2 * time.Hour),
		UpdatedAt:    now.Add(-1 * time.Hour),
	})
	s.db.Create(&alarmRow{
		ID:          "alm-003",
		WorkspaceID: wsID,
		DeviceID:    gw.ID,
		Severity:    "medium",
		Title:       "网关离线重连事件",
		Summary:     "网关发生心跳中断后已自动恢复通信",
		Status:      "resolved",
		Resolver:    adminUser.ID,
		History:     StringList{"Resolved automatically after re-connect"},
		CreatedAt:   now.Add(-12 * time.Hour),
		UpdatedAt:   now.Add(-11 * time.Hour),
	})

	// Bootstrap Profile & Config
	bp := bootstrapProfileRow{
		ID:            "prof-default-mqtt",
		Name:          "标准出厂 MQTT 零配置预设模版",
		WorkspaceID:   wsID,
		Channels:      StringList{cTelemetry.ID, cControl.ID},
		Content:       `{"broker":"fluxmq:1883","ssl":false,"keepalive":60,"topics":["channels/+/messages"]}`,
		EncryptionKey: "magistrala-bootstrap-key-2026",
		Encrypted:     false,
		ClientVersion: "v1.2",
		Metadata:      JSONMap{"protocol": "mqtt"},
		CreatedAt:     now.Add(-24 * time.Hour),
		UpdatedAt:     now,
	}
	s.db.Create(&bp)

	s.db.Create(&bootstrapConfigRow{
		ID:          "boot-cfg-sensor-01",
		ExternalID:  "MAC-AA-BB-CC-01",
		DeviceID:    d1.ID,
		WorkspaceID: wsID,
		ProfileID:   bp.ID,
		Channels:    StringList{cTelemetry.ID},
		Status:      "enabled",
		Name:        "温湿度传感器零配置档案",
		Secure:      true,
		MACAddr:     "AA:BB:CC:DD:EE:01",
		CreatedAt:   now.Add(-18 * time.Hour),
		UpdatedAt:   now,
	})

	// Device Type
	dt := deviceTypeRow{
		ID:            "dt-sens-env",
		Name:          "环境监测传感器型式 (Env Sensor Standard)",
		WorkspaceID:   wsID,
		Kind:          "sensor",
		Description:   "支持温度、湿度、气压三合一的高精度采集型式规格",
		Metadata:      JSONMap{"vendor": "SensorCorp", "mcu": "STM32L4"},
		Attributes:    JSONMap{"supported_protocols": []string{"mqtt", "coap", "http"}},
		LatestVersion: "v1.0.0",
		CreatedAt:     now.Add(-40 * time.Hour),
		UpdatedAt:     now,
	}
	s.db.Create(&dt)
	s.db.Create(&deviceTypeVersionRow{
		ID:           "dtv-sens-env-100",
		DeviceTypeID: dt.ID,
		Version:      "v1.0.0",
		WorkspaceID:  wsID,
		Manifest:     JSONMap{"spec_url": "https://specs.example.com/v1.0.0.json"},
		ReleaseNote:  "首发稳定版固件规范",
		Status:       "released",
		CreatedAt:    now.Add(-38 * time.Hour),
		UpdatedAt:    now,
	})

	// Dashboard（大屏看板：组件显式绑定具体设备/通道/指标）
	s.db.Create(&dashboardRow{
		ID:          "dash-overview",
		Name:        "车间主监控总览大屏",
		WorkspaceID: wsID,
		Description: "实时展示设备在线率、温度变化曲线与告警流转状态",
		Layout: JSONMap{
			"widgets": []map[string]any{
				{"id": "w-count", "kind": "count", "title": "空间资产总览", "span": 1},
				{"id": "w-temp-line", "kind": "line", "title": "温度实时趋势", "metric": "temperature", "unit": "°C",
					"deviceId": d1.ID, "deviceName": d1.Name, "channelId": cTelemetry.ID, "channelName": cTelemetry.Name, "span": 2},
				{"id": "w-volt-gauge", "kind": "gauge", "title": "电表电压区间", "metric": "voltage", "unit": "V",
					"deviceId": d2.ID, "deviceName": d2.Name, "channelId": cTelemetry.ID, "channelName": cTelemetry.Name,
					"min": 160, "max": 280, "warnAbove": 250, "span": 1},
				{"id": "w-hum-value", "kind": "value", "title": "湿度最新读数", "metric": "humidity", "unit": "%",
					"deviceId": d1.ID, "deviceName": d1.Name, "span": 1},
				{"id": "w-alarm-table", "kind": "alarms", "title": "实时告警流", "span": 2},
				{"id": "w-power-switch", "kind": "switch", "title": "车间电源远程控制", "channelId": cControl.ID,
					"channelName": cControl.Name, "commandTopic": "cmd/power", "commandValueOn": "ON", "commandValueOff": "OFF", "span": 1},
			},
		},
		Metadata:   JSONMap{"kind": "dashboard", "is_template": false},
		Shareable:  true,
		ShareToken: "share_dash_overview_public",
		CreatedAt:  now.Add(-24 * time.Hour),
		UpdatedAt:  now,
	})

	// Dashboard 抽象模板（组件按设备标签匹配，可复用到任意同构设备群）
	s.db.Create(&dashboardRow{
		ID:          "dash-tmpl-env",
		Name:        "环境监测传感器通用模板",
		WorkspaceID: wsID,
		Description: "按设备标签 temperature / meter 抽象匹配数据源，新建同类设备后自动接入渲染",
		Layout: JSONMap{
			"widgets": []map[string]any{
				{"id": "t-temp-line", "kind": "line", "title": "同标签设备温度趋势", "metric": "temperature", "unit": "°C",
					"matchTag": "temperature", "span": 2},
				{"id": "t-meter-gauge", "kind": "gauge", "title": "电表类负载率", "metric": "voltage", "unit": "V",
					"matchTag": "meter", "min": 0, "max": 300, "warnAbove": 250, "span": 1},
				{"id": "t-count", "kind": "count", "title": "空间资产概览", "span": 1},
			},
		},
		Metadata:  JSONMap{"kind": "template", "is_template": true, "tags": []string{"sensor"}},
		CreatedAt: now.Add(-6 * time.Hour),
		UpdatedAt: now,
	})

	// Custom Node (WASM logic)
	s.db.Create(&customNodeRow{
		ID:          "node-senml-filter",
		Name:        "SenML 浮点精度过滤插件",
		WorkspaceID: wsID,
		Kind:        "wasm",
		Runtime:     "wasm-edge",
		Entry:       "_start",
		Size:        184320,
		Version:     "v1.0.1",
		Status:      "enabled",
		CreatedAt:   now.Add(-10 * time.Hour),
		UpdatedAt:   now,
	})

	// Sample recent telemetry messages
	s.db.Create(&messageRow{
		ID:        GenID("msg"),
		ChannelID: cTelemetry.ID,
		Subtopic:  "temperature",
		Publisher: d1.ID,
		Protocol:  "mqtt",
		Payload:   `[{"bn":"dev-sensor-01","n":"temperature","v":26.8,"u":"Cel","t":` + timeNowMilliStr() + `},{"n":"humidity","v":58.2,"u":"%RH"}]`,
		Name:      "temperature",
		Value:     "26.8",
		Unit:      "Cel",
		Time:      now.UnixMilli(),
		CreatedAt: now.Add(-1 * time.Minute),
	})
	s.db.Create(&messageRow{
		ID:        GenID("msg"),
		ChannelID: cTelemetry.ID,
		Subtopic:  "power",
		Publisher: d2.ID,
		Protocol:  "mqtt",
		Payload:   `{"voltage_a":220.5,"voltage_b":221.0,"voltage_c":219.8,"current":4.82,"active_power":3.18}`,
		Name:      "voltage",
		Value:     "220.5",
		Unit:      "V",
		Time:      now.UnixMilli() - 60000,
		CreatedAt: now.Add(-3 * time.Minute),
	})

	// Activity Journals
	s.db.Create(&journalRow{
		ID:          GenID("jrn"),
		WorkspaceID: wsID,
		EntityID:    d1.ID,
		EntityType:  "device",
		Operation:   "device.create",
		Attributes:  JSONMap{"name": d1.Name, "status": d1.Status},
		UserID:      adminUser.ID,
		CreatedAt:   now.Add(-24 * time.Hour),
	})
	s.db.Create(&journalRow{
		ID:          GenID("jrn"),
		WorkspaceID: wsID,
		EntityID:    cTelemetry.ID,
		EntityType:  "channel",
		Operation:   "channel.connect",
		Attributes:  JSONMap{"device_id": d1.ID, "channel_id": cTelemetry.ID},
		UserID:      adminUser.ID,
		CreatedAt:   now.Add(-20 * time.Hour),
	})

	// Report
	s.db.Create(&reportRow{
		ID:          "rep-daily-01",
		Name:        "智能制造生产区每日数据采集报告",
		WorkspaceID: wsID,
		Format:      "pdf",
		TimeFrom:    now.Add(-24 * time.Hour).Format(time.RFC3339),
		TimeTo:      now.Format(time.RFC3339),
		Channels:    StringList{cTelemetry.ID},
		Status:      "generated",
		Members:     StringList{adminUser.Email},
		Result:      JSONMap{"messages_count": 8640, "average_temp": 25.8, "alarm_count": 3},
		DownloadURL: "/api/reports/rep-daily-01/download",
		CreatedAt:   now.Add(-1 * time.Hour),
		UpdatedAt:   now,
	})

	// PAT
	s.db.Create(&patRow{
		ID:          "pat-demo-01",
		Name:        "CI/CD 自动化设备上报凭据",
		Token:       "pat_" + GenID("token"),
		UserID:      adminUser.ID,
		WorkspaceID: wsID,
		Operations:  StringList{"messages.publish", "devices.read"},
		Duration:    90,
		Status:      "enabled",
		ExpiresAt:   now.Add(90 * 24 * time.Hour),
		CreatedAt:   now.Add(-5 * 24 * time.Hour),
	})

	return nil
}

func timeNowMilliStr() string {
	return "0"
}
