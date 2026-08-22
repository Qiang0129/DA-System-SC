#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"

require_runtime_file
read -r -s -p "请输入 Cloudflare Tunnel Token：" tunnel_token
echo
[[ -n "${tunnel_token}" ]] || die "Token 不能为空"
[[ "${tunnel_token}" =~ ^[A-Za-z0-9._-]+$ ]] || die "Token 包含非预期字符，请从 Cloudflare 控制台重新复制"

temporary_file="$(mktemp "${PROJECT_DIR}/.env.runtime.XXXXXX")"
trap 'rm -f "${temporary_file}"' EXIT
umask 077
replaced=false
while IFS= read -r line || [[ -n "${line}" ]]; do
  if [[ "${line}" == CLOUDFLARE_TUNNEL_TOKEN=* ]]; then
    printf 'CLOUDFLARE_TUNNEL_TOKEN=%s\n' "${tunnel_token}" >> "${temporary_file}"
    replaced=true
  else
    printf '%s\n' "${line}" >> "${temporary_file}"
  fi
done < "${RUNTIME_FILE}"

if [[ "${replaced}" != "true" ]]; then
  printf 'CLOUDFLARE_TUNNEL_TOKEN=%s\n' "${tunnel_token}" >> "${temporary_file}"
fi

mv "${temporary_file}" "${RUNTIME_FILE}"
chmod 600 "${RUNTIME_FILE}"
trap - EXIT
unset tunnel_token
echo "Tunnel Token 已安全写入 ${RUNTIME_FILE}，未输出到终端。"
