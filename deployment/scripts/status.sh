#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"

require_command docker
require_runtime_file

echo "== Compose 状态 =="
compose ps

echo
echo "== 内部健康检查 =="
backend_code="$(compose exec -T backend python -c "import urllib.request; print(urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=5).status)" 2>/dev/null || true)"
web_body="$(compose exec -T web wget -qO- http://127.0.0.1/healthz 2>/dev/null || true)"
echo "backend /api/health：${backend_code:-失败}"
echo "web /healthz：${web_body:-失败}"

echo
echo "== 数据库迁移版本 =="
compose exec -T backend python -m alembic current 2>/dev/null || true

echo
echo "== 对外端口检查 =="
published="$(compose ps --format json | grep -o '0\.0\.0\.0:[0-9]*\|127\.0\.0\.1:[0-9]*' || true)"
if [[ -n "${published}" ]]; then
  echo "警告：发现宿主机发布端口：${published}"
else
  echo "未发布宿主机端口，符合 Tunnel-only 策略。"
fi

echo
echo "== Tunnel 日志摘要 =="
compose logs --tail 20 cloudflared 2>/dev/null \
  | sed -E 's/(token=)[^ ]+/\1<redacted>/Ig' \
  || true
