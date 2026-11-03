#!/bin/bash
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "停止 Magistrala 后台..."
pkill -f "build/magistrala-server" || true

echo "停止 FluxMQ 容器..."
docker stop magistrala-fluxmq 2>/dev/null || true
docker rm -f magistrala-fluxmq 2>/dev/null || true

echo "服务已停止。"
