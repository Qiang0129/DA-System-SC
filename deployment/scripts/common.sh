#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
RUNTIME_FILE="${PROJECT_DIR}/.env.runtime"
COMPOSE_FILE="${PROJECT_DIR}/compose.yaml"

die() {
  echo "错误：$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "缺少命令：$1"
}

require_runtime_file() {
  [[ -f "${RUNTIME_FILE}" ]] || die "缺少 ${RUNTIME_FILE}，请先执行 deployment/scripts/init-runtime.sh"
  chmod 600 "${RUNTIME_FILE}"
}

load_runtime() {
  require_runtime_file
  set -a
  # 运行文件只允许 KEY=VALUE 格式，密钥由初始化脚本生成，不执行用户输入的 shell 片段。
  # shellcheck disable=SC1090
  source "${RUNTIME_FILE}"
  set +a
}

validate_runtime() {
  local require_tunnel="${1:-true}"
  load_runtime

  [[ "${DB_PASSWORD:-}" != replace_* && ${#DB_PASSWORD} -ge 32 ]] || die "DB_PASSWORD 未初始化"
  [[ "${MYSQL_ROOT_PASSWORD:-}" != replace_* && ${#MYSQL_ROOT_PASSWORD} -ge 32 ]] || die "MYSQL_ROOT_PASSWORD 未初始化"
  [[ "${JWT_SECRET_KEY:-}" != replace_* && ${#JWT_SECRET_KEY} -ge 43 ]] || die "JWT_SECRET_KEY 未初始化"

  if [[ "${require_tunnel}" == "true" ]]; then
    [[ -n "${CLOUDFLARE_TUNNEL_TOKEN:-}" && "${CLOUDFLARE_TUNNEL_TOKEN}" != replace_* ]] \
      || die "Cloudflare Tunnel Token 未设置，请执行 deployment/scripts/set-tunnel-token.sh"
  fi
}

compose() {
  local resolved_image_tag="${APP_IMAGE_TAG:-}"
  if [[ -z "${resolved_image_tag}" || "${resolved_image_tag}" == "local" ]]; then
    resolved_image_tag="$(git -C "${PROJECT_DIR}" rev-parse --short=12 HEAD 2>/dev/null || echo local)"
  fi
  APP_IMAGE_TAG="${resolved_image_tag}" docker compose \
    --env-file "${RUNTIME_FILE}" \
    -f "${COMPOSE_FILE}" \
    --project-directory "${PROJECT_DIR}" \
    "$@"
}

wait_for_container_health() {
  local service="$1"
  local timeout_seconds="${2:-180}"
  local container_id state

  for _ in $(seq 1 "${timeout_seconds}"); do
    container_id="$(compose ps -q "${service}")"
    if [[ -n "${container_id}" ]]; then
      state="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "${container_id}" 2>/dev/null || true)"
      case "${state}" in
        healthy|running)
          return 0
          ;;
        unhealthy|exited|dead)
          return 1
          ;;
      esac
    fi
    sleep 1
  done
  return 1
}
