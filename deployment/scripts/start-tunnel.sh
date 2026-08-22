#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"

require_command docker
validate_runtime true
pin_running_image_tag

echo "启动 Cloudflare Tunnel 连接器..."
compose up -d cloudflared
sleep 5

container_id="$(compose ps -q cloudflared)"
if [[ -z "${container_id}" ]] || [[ "$(docker inspect --format '{{.State.Status}}' "${container_id}")" != "running" ]]; then
  echo "错误：Cloudflare Tunnel 连接器未保持运行。" >&2
  compose logs --tail 80 cloudflared | sed -E 's/(token[=:][[:space:]]*)[^[:space:]]+/\1<redacted>/Ig' >&2 || true
  exit 1
fi

echo "Cloudflare Tunnel 连接器已运行；请在 Cloudflare 控制台确认 da.scu-gpt.me 的健康状态。"
