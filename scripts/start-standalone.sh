#!/bin/bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"

echo "=== 检查并编译 Magistrala 二进制 ==="
mkdir -p data logs

if [ ! -f "build/magistrala-server" ]; then
    make build_server
fi

echo "=== 启动 Magistrala 单文件后台服务 (SQLite) ==="
# 终止历史进程
pkill -f "build/magistrala-server" || true
tmux kill-session -t magistrala-backend 2>/dev/null || true
sleep 1

# 通过 tmux 在后台常驻运行
tmux new-session -d -s magistrala-backend "cd '$DIR' && ./build/magistrala-server >> logs/magistrala.log 2>&1"
sleep 1

echo "=== 启动 FluxMQ 容器 ==="
docker rm -f magistrala-fluxmq 2>/dev/null || true
docker run -d \
    --name magistrala-fluxmq \
    --restart unless-stopped \
    --net host \
    -v "$DIR/docker/fluxmq-standalone.yaml:/etc/fluxmq/config.yaml:ro" \
    ghcr.io/absmach/fluxmq:latest \
    -config /etc/fluxmq/config.yaml

sleep 2

echo "=== 检查服务健康状态 ==="
curl -s http://127.0.0.1:8080/api/health | grep "pass" && echo "Magistrala 后台健康检查: 正常 (PASS)"
docker ps --filter "name=magistrala-fluxmq" --format "FluxMQ 状态: {{.Status}}"

echo ""
echo "=========================================================="
echo "  服务部署完成！无 Nginx，直接暴露各端口供外部代理："
echo "  - 后台 Web 控制台 (HTTP): http://0.0.0.0:8080"
echo "  - MQTT TCP 端口: 0.0.0.0:1883"
echo "  - MQTT WebSocket 端口: ws://0.0.0.0:8083/mqtt"
echo "  - FluxMQ 管理端口: 0.0.0.0:8082"
echo "  - 默认管理员账号: admin@magistrala.local / 12345678"
echo "  - 本地 SQLite 数据库路径: data/magistrala.db"
echo "=========================================================="
