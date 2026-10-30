# FluxMQ 部署、配置与设备连接接入完整指南

FluxMQ 是 Magistrala 物联网平台默认的高性能、多协议消息代理（Message Broker）与事件总线（Event Store），支持标准 **MQTT (v3.1.1 / v5.0)、WebSocket、CoAP、HTTP 及 AMQP 0.9.1** 等多种物联网协议。

---

## 目录
1. [系统架构与通信拓扑](#1-系统架构与通信拓扑)
2. [部署方式](#2-部署方式)
   - 方式一：Docker Compose 独立/集群部署
   - 方式二：直接单机运行
3. [核心配置文件说明 (node.yaml)](#3-核心配置文件说明)
4. [端口分布清单](#4-端口分布清单)
5. [安全与认证机制 (mTLS & HTTP Auth Webhook)](#5-安全与认证机制)
6. [设备端连接与通信实操指南](#6-设备端连接与通信实操指南)
   - MQTT (TCP 1883) 接入
   - MQTT over WebSocket (8883 / 80) 接入
   - HTTP 协议直接发送消息
   - CoAP (UDP 5683) 接入
7. [常见问题排查 (Troubleshooting)](#7-常见问题排查)

---

## 1. 系统架构与通信拓扑

```
[ 物联网硬件设备 / 客户端 ]
   │
   ├─► MQTT (1883) ────────┐
   ├─► MQTTS / TLS (8883) ─┼──► [ Nginx 反向代理 / FluxMQ Broker 节点 ]
   ├─► WebSocket (/mqtt) ──┤                 │
   └─► HTTP / CoAP ────────┘                 │ 认证鉴权请求 (Webhook)
                                             ▼
                                  [ fluxmq-auth / 控制台服务 ]
                                  (查询设备 Secret & 通道 ACL)
                                             │
                                             ▼
                                  [ TimescaleDB / 事件持久化 ]
```

- **设备身份与通道控制**：每个设备在 Magistrala 中拥有 `device_id` 和专属 `secret`。
- **发布/订阅主题规划**：
  - 设备上报数据：`channels/<channel_id>/messages` 或 `channels/<channel_id>/messages/<subtopic>`
  - 平台下发控制：`channels/<channel_id>/messages`

---

## 2. 部署方式

### 方式一：使用 Docker 部署独立 FluxMQ

FluxMQ 官方镜像为 `ghcr.io/absmach/fluxmq:latest`。

在宿主机上准备如下 `docker-compose.fluxmq.yml`：

```yaml
version: '3.8'

services:
  fluxmq:
    image: ghcr.io/absmach/fluxmq:latest
    container_name: magistrala-fluxmq
    user: "0:0"
    command: ["-config", "/etc/fluxmq/config.yaml"]
    ports:
      - "1883:1883"      # MQTT v3.1.1
      - "1884:1884"      # MQTT v5.0
      - "8883:8883"      # WebSocket v3.1.1 (/mqtt)
      - "8090:8090"      # HTTP Messaging
      - "5683:5683/udp"  # CoAP
      - "8082:8082"      # FluxMQ HTTP API / Dashboard
    volumes:
      - ./fluxmq.yaml:/etc/fluxmq/config.yaml:ro
      - ./data:/tmp/fluxmq
    restart: unless-stopped
```

启动命令：
```bash
docker compose -f docker-compose.fluxmq.yml up -d
```

---

## 3. 核心配置文件说明

下面是一份单机运行或与 Magistrala 管理后台配合时的典型 `fluxmq.yaml` 配置示例：

```yaml
server:
  mqtt:
    tcp:
      v3:
        addr: "0.0.0.0:1883"
        protocol: "v3"
        max_connections: 50000
        read_timeout: 60s
        write_timeout: 60s
      v5:
        addr: "0.0.0.0:1884"
        protocol: "v5"
        max_connections: 50000
        read_timeout: 60s
        write_timeout: 60s
    websocket:
      v3:
        addr: "0.0.0.0:8883"
        path: "/mqtt"
        protocol: "v3"
      v5:
        addr: "0.0.0.0:8884"
        path: "/mqtt"
        protocol: "v5"
  http:
    plain:
      addr: "0.0.0.0:8090"
  coap:
    plain:
      addr: "0.0.0.0:5683"
  amqp:
    plain:
      addr: "0.0.0.0:5672"
      max_connections: 10000
  health_addr: "0.0.0.0:8081"
  health_enabled: true
  shutdown_timeout: 30s

broker:
  max_message_size: 1048576  # 1MB
  cluster_name: "magistrala-cluster"
  node_name: "node1"
  persistence:
    enabled: true
    dir: "/tmp/fluxmq"

auth:
  # 认证后端：支持内置匿名或外接 Magistrala HTTP 认证鉴权
  anonymous: true   # 本地调试可开启；生产环境需设为 false
  http:
    # 当设备连接和发布订阅时，FluxMQ 会主动向此 Webhook 确认权限
    auth_url: "http://localhost:8080/api/auth/mqtt"
    acl_url: "http://localhost:8080/api/auth/mqtt/acl"
```

---

## 4. 端口分布清单

| 端口号 | 协议 | 用途说明 |
| :--- | :--- | :--- |
| **`1883`** | TCP / MQTT | 标准 MQTT 协议 (v3.1.1)，普通物联网硬件主流连接端口 |
| **`1884`** | TCP / MQTT | MQTT v5.0 协议端口 |
| **`8883`** | HTTP / WebSocket | MQTT over WebSocket（路径 `/mqtt`），用于浏览器 Web 端直接连接收发 |
| **`8090`** | HTTP | 原生 HTTP 消息发布端口（通过 POST 发送消息） |
| **`5683`** | UDP / CoAP | 受限应用协议 (CoAP)，低功耗传感器节点直连端口 |
| **`5672` / `5682`** | AMQP | 内部事件分发队列（连接 Timescale Writer / Alarms 服务） |
| **`8082`** | HTTP | FluxMQ 管理接口与健康检查 |

---

## 5. 安全与认证机制

### 1. 设备认证方式 (Credentials)
- **Username**：填入设备的识别码 `device_id`。
- **Password**：填入该设备生成的通信密钥 `secret`（可在管理后台设备详情中的【访问凭据】Tab 查看或复制）。
- **Client ID**：建议设为与 `device_id` 一致或包含随机后缀。

### 2. 通道访问控制 (ACL)
- 只有被明确绑定到通道（Channel）的设备，才允许对该通道对应的 Topic 进行 `PUBLISH`（发布）或 `SUBSCRIBE`（订阅）。

---

## 6. 设备端连接与通信实操指南

### 6.1 MQTT 客户端连接 (以 mosquitto_pub / sub 为例)

#### 1. 订阅通道消息：
```bash
mosquitto_sub -h <FLUXMQ_HOST> -p 1883 \
  -u "<DEVICE_ID>" \
  -P "<DEVICE_SECRET>" \
  -t "channels/<CHANNEL_ID>/messages" \
  -d
```

#### 2. 上报传感器数据 (发布)：
```bash
mosquitto_pub -h <FLUXMQ_HOST> -p 1883 \
  -u "<DEVICE_ID>" \
  -P "<DEVICE_SECRET>" \
  -t "channels/<CHANNEL_ID>/messages" \
  -m '[{"n":"temperature","v":26.8},{"n":"humidity","v":58.2}]'
```

#### 3. 支持带子主题（Subtopic）：
例如上传特定指标：
```bash
mosquitto_pub -h <FLUXMQ_HOST> -p 1883 \
  -u "<DEVICE_ID>" \
  -P "<DEVICE_SECRET>" \
  -t "channels/<CHANNEL_ID>/messages/env_sensor" \
  -m '{"voltage": 3.3, "status": "normal"}'
```

---

### 6.2 Python paho-mqtt 设备接入代码示例

```python
import time
import json
import paho.mqtt.client as mqtt

DEVICE_ID = "dev-sensor-01"
DEVICE_SECRET = "sec_meter_9921"
CHANNEL_ID = "chan-telemetry-01"
BROKER_HOST = "127.0.0.1"
BROKER_PORT = 1883

def on_connect(client, userdata, flags, rc):
    if rc == 0:
        print("[MQTT] 连接成功！")
        # 订阅指令通道
        topic = f"channels/{CHANNEL_ID}/messages"
        client.subscribe(topic)
        print(f"[MQTT] 已订阅: {topic}")
    else:
        print(f"[MQTT] 连接失败，错误码: {rc}")

def on_message(client, userdata, msg):
    print(f"[MQTT] 收到控制指令 [{msg.topic}]: {msg.payload.decode()}")

client = mqtt.Client(client_id=DEVICE_ID)
client.username_pw_set(username=DEVICE_ID, password=DEVICE_SECRET)
client.on_connect = on_connect
client.on_message = on_message

client.connect(BROKER_HOST, BROKER_PORT, 60)
client.loop_start()

# 模拟定时上报传感器遥测数据
try:
    while True:
        payload = [
            {"n": "temp", "v": 25.4, "u": "Cel"},
            {"n": "humidity", "v": 62.0, "u": "%RH"}
        ]
        topic = f"channels/{CHANNEL_ID}/messages"
        client.publish(topic, json.dumps(payload))
        print(f"[MQTT] 已上报数据: {payload}")
        time.sleep(5)
except KeyboardInterrupt:
    client.loop_stop()
    client.disconnect()
```

---

### 6.3 HTTP 协议直发消息 (轻量设备)

如果设备计算资源受限无法维持长连接，可直接通过 HTTP POST 写入 FluxMQ 端口（默认 `8090`）或 Magistrala 控制台代理端口（`8080`）：

```bash
curl -X POST "http://<FLUXMQ_HOST>:8090/http/channels/<CHANNEL_ID>/messages" \
  -H "Authorization: Bearer <DEVICE_SECRET>" \
  -H "Content-Type: application/senml+json" \
  -d '[{"n":"current","v":1.25}]'
```

---

### 6.4 网页端 WebSocket 连接

浏览器端可直接使用 MQTT.js 连入 FluxMQ WebSocket 接口：
```javascript
import mqtt from 'mqtt';

const client = mqtt.connect('ws://localhost:8883/mqtt', {
  clientId: 'web_client_' + Math.random().toString(16).substr(2, 8),
  username: '<DEVICE_ID>',
  password: '<DEVICE_SECRET>',
});

client.on('connect', () => {
  console.log('WebSocket MQTT 已连接');
  client.subscribe('channels/<CHANNEL_ID>/messages');
});

client.on('message', (topic, message) => {
  console.log('收到实时遥测数据:', message.toString());
});
```

---

## 7. 常见问题排查 (Troubleshooting)

1. **连接报 `Connection Refused: Not Authorized (rc=5)`**：
   - 检查设备的 `device_id` 和 `secret` 是否与管理后台或数据库 `mg_devices` 表中一致；
   - 检查设备是否已被管理员在后台置为“禁用”状态（Status 需为 `enabled`）。

2. **发布消息成功，但订阅者收不到**：
   - 检查发布者与订阅者是否绑定了**同一个 Channel**；
   - 确认双方操作的主题格式是否严格为：`channels/<channel_id>/messages[/subtopic]`。

3. **消息未落库到 TimescaleDB**：
   - 检查 `timescale-writer` 是否正常连入 FluxMQ 内部 AMQP 监听端口（`5682` / `5685`）；
   - 查看 FluxMQ 日志中是否存在 `client_auth` 认证错误。
