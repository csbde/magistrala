import React, { useState } from 'react'
import { useAuthStore } from '../store/authStore'
import { Server, Radio, ShieldCheck, Copy, Check, Terminal } from 'lucide-react'

export const BrokerHubModule: React.FC = () => {
  const { currentWorkspace } = useAuthStore()
  // const t = dict[language]
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text)
    setCopiedKey(key)
    setTimeout(() => setCopiedKey(null), 2000)
  }

  const sampleChannelID = 'chan-sample-01'
  const sampleDeviceID = 'dev-sample-01'
  const sampleSecret = 'sec-example-token-9f8e'

  const subCommand = `mosquitto_sub -h localhost -p 1883 -u "${sampleDeviceID}" -P "${sampleSecret}" -t "channels/${sampleChannelID}/messages"`
  const pubCommand = `mosquitto_pub -h localhost -p 1883 -u "${sampleDeviceID}" -P "${sampleSecret}" -t "channels/${sampleChannelID}/messages" -m '{"temperature": 26.5, "humidity": 58.2}'`

  const fluxmqConfigYaml = `# FluxMQ Webhook 认证与鉴权配置示例 (fluxmq.yaml)
auth:
  http:
    # 设备登录认证 Webhook (Magistrala 单文件后台)
    auth_req:
      url: "http://127.0.0.1:8080/api/auth/mqtt"
      method: "post"
      headers:
        content-type: "application/json"
      params:
        clientid: "%c"
        username: "%u"
        password: "%p"
        ipaddress: "%a"

    # 通道发布/订阅鉴权 Webhook (基于 Magistrala 绑定关系)
    acl_req:
      url: "http://127.0.0.1:8080/api/auth/mqtt/acl"
      method: "post"
      headers:
        content-type: "application/json"
      params:
        clientid: "%c"
        username: "%u"
        topic: "%t"
        access: "%A"`

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h2 className="text-xl font-bold text-slate-800">FluxMQ / MQTT 接入与集成中心</h2>
        <p className="text-xs text-slate-500 mt-1">
          当前空间: <span className="font-mono text-blue-600 font-semibold">{currentWorkspace?.name}</span>。
          单文件后台监听 HTTP 8080 端口，FluxMQ 监听 1883/8883/8083 端口并通过 Webhook 委托 Magistrala 完成设备认证与通道鉴权。
        </p>
      </div>

      {/* Architecture Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-2">
          <div className="flex items-center gap-2 text-blue-600 font-semibold text-sm">
            <Server className="w-4 h-4" />
            <span>Magistrala 单文件后台</span>
          </div>
          <div className="text-2xl font-bold text-slate-800">8080</div>
          <p className="text-xs text-slate-500">
            HTTP 管理后台、OIDC SSO、Casbin 租户隔离、Webhook 认证中心
          </p>
          <div className="text-[11px] font-mono text-emerald-600 bg-emerald-50 px-2 py-1 rounded inline-block">
            HTTP /api/auth/mqtt (活跃)
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-2">
          <div className="flex items-center gap-2 text-indigo-600 font-semibold text-sm">
            <Radio className="w-4 h-4" />
            <span>FluxMQ MQTT Broker</span>
          </div>
          <div className="text-2xl font-bold text-slate-800">1883 / 8883</div>
          <p className="text-xs text-slate-500">
            高性能百亿级物联网消息代理，支持 MQTT 3.1.1 / 5.0 及 WebSocket (8083)
          </p>
          <div className="text-[11px] font-mono text-blue-600 bg-blue-50 px-2 py-1 rounded inline-block">
            Webhook 动态代理鉴权
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-2">
          <div className="flex items-center gap-2 text-emerald-600 font-semibold text-sm">
            <ShieldCheck className="w-4 h-4" />
            <span>PostgreSQL 外部数据库</span>
          </div>
          <div className="text-2xl font-bold text-slate-800">5432</div>
          <p className="text-xs text-slate-500">
            持久化租户数据、设备凭证、通道连接与告警，单文件自动完成迁移
          </p>
          <div className="text-[11px] font-mono text-purple-600 bg-purple-50 px-2 py-1 rounded inline-block">
            纯 Go SQLite (本地备用)
          </div>
        </div>
      </div>

      {/* Webhook Endpoints & Authentication Spec */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
        <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-emerald-600" />
          <span>FluxMQ Webhook 认证对接规范</span>
        </h3>
        <p className="text-xs text-slate-600 leading-relaxed">
          FluxMQ 收到设备连接请求时，自动向 Magistrala 发起 HTTP POST 请求验证设备身份；发布或订阅主题时，验证设备是否连接到该通道。
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700">1. 设备连接认证接口</span>
              <span className="text-[10px] bg-blue-100 text-blue-800 font-mono px-1.5 py-0.5 rounded">POST</span>
            </div>
            <div className="font-mono text-xs text-blue-600 bg-white p-2 rounded border border-slate-200">
              http://127.0.0.1:8080/api/auth/mqtt
            </div>
            <div className="text-[11px] text-slate-500">
              校验参数: <code className="text-slate-700">username = Device ID</code>, <code className="text-slate-700">password = Secret</code>
            </div>
          </div>

          <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700">2. 通道读写鉴权接口</span>
              <span className="text-[10px] bg-blue-100 text-blue-800 font-mono px-1.5 py-0.5 rounded">POST</span>
            </div>
            <div className="font-mono text-xs text-blue-600 bg-white p-2 rounded border border-slate-200">
              http://127.0.0.1:8080/api/auth/mqtt/acl
            </div>
            <div className="text-[11px] text-slate-500">
              校验主题格式: <code className="text-slate-700">channels/&lt;channel_id&gt;/messages[/&lt;subtopic&gt;]</code>
            </div>
          </div>
        </div>
      </div>

      {/* Mosquitto Client Test Commands */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
        <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
          <Terminal className="w-5 h-5 text-slate-700" />
          <span>终端设备一键连接测试命令 (CLI Snippets)</span>
        </h3>

        {/* Subscribe */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-700">订阅通道消息 (Subscriber)</span>
            <button
              onClick={() => copyToClipboard(subCommand, 'sub')}
              className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1 font-medium"
            >
              {copiedKey === 'sub' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedKey === 'sub' ? '已复制' : '复制命令'}</span>
            </button>
          </div>
          <pre className="p-3 bg-slate-900 text-emerald-400 font-mono text-xs rounded-lg overflow-x-auto whitespace-pre-wrap border border-slate-800">
            {subCommand}
          </pre>
        </div>

        {/* Publish */}
        <div className="space-y-1.5 pt-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-700">发布遥测数据 (Publisher)</span>
            <button
              onClick={() => copyToClipboard(pubCommand, 'pub')}
              className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1 font-medium"
            >
              {copiedKey === 'pub' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedKey === 'pub' ? '已复制' : '复制命令'}</span>
            </button>
          </div>
          <pre className="p-3 bg-slate-900 text-blue-300 font-mono text-xs rounded-lg overflow-x-auto whitespace-pre-wrap border border-slate-800">
            {pubCommand}
          </pre>
        </div>
      </div>

      {/* FluxMQ Configuration File Snippet */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-800">FluxMQ 配置文件示例 (fluxmq.yaml)</h3>
            <p className="text-xs text-slate-500">将以下配置写入 FluxMQ 的 plugins/http 配置文件中即可完成对接</p>
          </div>
          <button
            onClick={() => copyToClipboard(fluxmqConfigYaml, 'yaml')}
            className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-lg border border-slate-300 flex items-center gap-1.5 font-medium transition"
          >
            {copiedKey === 'yaml' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedKey === 'yaml' ? '已复制 YAML' : '复制配置'}</span>
          </button>
        </div>
        <pre className="p-4 bg-slate-950 text-slate-300 font-mono text-xs rounded-lg overflow-x-auto border border-slate-800 leading-relaxed">
          {fluxmqConfigYaml}
        </pre>
      </div>
    </div>
  )
}
