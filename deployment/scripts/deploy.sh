#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"

without_tunnel=false
if [[ "${1:-}" == "--without-tunnel" ]]; then
  without_tunnel=true
fi

require_command docker
docker info >/dev/null 2>&1 || die "Docker Engine 当前不可用"
validate_runtime "$([[ "${without_tunnel}" == "true" ]] && echo false || echo true)"

cd "${PROJECT_DIR}"
APP_IMAGE_TAG="$(git rev-parse --short=12 HEAD 2>/dev/null || echo local)"
export APP_IMAGE_TAG

echo "构建固定提交对应的生产镜像：${APP_IMAGE_TAG}"
compose build backend web migrate

echo "启动 MySQL 并等待健康检查..."
compose up -d db
wait_for_container_health db 240 || die "MySQL 未通过健康检查"

echo "执行 Alembic 数据库迁移..."
compose run --rm migrate

echo "启动后端与 Web 入口..."
compose up -d backend web
wait_for_container_health backend 180 || die "后端未通过健康检查"
wait_for_container_health web 120 || die "Web 入口未通过健康检查"

if [[ "${without_tunnel}" == "true" ]]; then
  compose stop cloudflared >/dev/null 2>&1 || true
  echo "本地栈已启动，按要求未启动 Cloudflare Tunnel。"
else
  echo "启动 Cloudflare Tunnel 连接器..."
  compose up -d cloudflared
  sleep 8
  cloudflared_id="$(compose ps -q cloudflared)"
  [[ -n "${cloudflared_id}" && "$(docker inspect --format '{{.State.Status}}' "${cloudflared_id}")" == "running" ]] \
    || die "cloudflared 未保持运行，请查看 deployment/scripts/status.sh"
fi

"${SCRIPT_DIR}/status.sh"
