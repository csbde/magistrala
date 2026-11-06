// Copyright (c) Abstract Machines
// SPDX-License-Identifier: Apache-2.0

package store

import (
	"encoding/json"
	"sort"
	"strconv"
	"strings"
)

// preferredMetricOrder 列出常见遥测指标名，用于在载荷含多个字段时挑选主指标。
var preferredMetricOrder = []string{
	"temperature", "humidity", "voltage", "current", "power",
	"pressure", "co2", "pm25", "speed", "rpm", "level", "soil_moisture",
}

// metricNumber 尝试把任意 JSON 值解析为数值字符串。
func metricNumber(v any) (string, bool) {
	switch t := v.(type) {
	case float64:
		return strconv.FormatFloat(t, 'f', -1, 64), true
	case int:
		return strconv.Itoa(t), true
	case json.Number:
		if f, err := t.Float64(); err == nil {
			return strconv.FormatFloat(f, 'f', -1, 64), true
		}
	case string:
		s := strings.TrimSpace(t)
		if s == "" {
			return "", false
		}
		if f, err := strconv.ParseFloat(s, 64); err == nil {
			return strconv.FormatFloat(f, 'f', -1, 64), true
		}
	}
	return "", false
}

// EnrichMessage 在调用方未显式提供 Value 时，从载荷中解析出主指标名称、数值与单位。
// 同时兼容 SenML 数组载荷与普通 JSON 对象载荷，使消息数据中心与可视化大屏可直接按指标取数。
func EnrichMessage(m *MessageRecord) {
	if strings.TrimSpace(m.Value) != "" {
		return
	}
	payload := strings.TrimSpace(m.Payload)
	if payload == "" {
		return
	}

	switch payload[0] {
	case '[':
		var recs []map[string]any
		if json.Unmarshal([]byte(payload), &recs) != nil {
			return
		}
		// 优先命中与 subtopic 同名的 SenML 记录
		for _, rec := range recs {
			n, _ := rec["n"].(string)
			v, ok := metricNumber(rec["v"])
			if !ok || n == "" || m.Subtopic == "" {
				continue
			}
			if strings.Contains(m.Subtopic, n) {
				m.Name = firstNonEmpty(m.Name, n)
				m.Value = v
				m.Unit, _ = rec["u"].(string)
				return
			}
		}
		for _, rec := range recs {
			n, _ := rec["n"].(string)
			v, ok := metricNumber(rec["v"])
			if !ok {
				continue
			}
			m.Name = firstNonEmpty(m.Name, n)
			m.Value = v
			m.Unit, _ = rec["u"].(string)
			return
		}

	case '{':
		var obj map[string]any
		if json.Unmarshal([]byte(payload), &obj) != nil {
			return
		}
		keys := make([]string, 0, len(preferredMetricOrder)+len(obj))
		if st := strings.TrimSpace(m.Subtopic); st != "" {
			keys = append(keys, st)
		}
		keys = append(keys, preferredMetricOrder...)
		for _, k := range keys {
			if v, ok := metricNumber(obj[k]); ok {
				m.Name = firstNonEmpty(m.Name, k)
				m.Value = v
				if u, oku := obj[k+"_unit"].(string); oku {
					m.Unit = u
				}
				return
			}
		}
		// 回退：取字典序第一个可数值化字段，保证结果稳定
		all := make([]string, 0, len(obj))
		for k := range obj {
			all = append(all, k)
		}
		sort.Strings(all)
		for _, k := range all {
			if v, ok := metricNumber(obj[k]); ok {
				m.Name = firstNonEmpty(m.Name, k)
				m.Value = v
				return
			}
		}
	}
}
