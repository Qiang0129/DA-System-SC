#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"

require_command docker
require_command tar
validate_runtime false
pin_running_image_tag

backup_dir="${BACKUP_DIR:-/mnt/e/WSL-Backups/DA-System-SC}"
timestamp="$(date +%Y%m%d-%H%M%S)"
archive="${backup_dir}/da-system-sc-${timestamp}.tar.gz"
checksum="${archive}.sha256"
staging="$(mktemp -d)"
backend_was_running=false

cleanup() {
  rm -rf "${staging}"
}

restore_backend() {
  if [[ "${backend_was_running}" == "true" ]]; then
    compose up -d backend web >/dev/null
  fi
}

trap 'restore_backend; cleanup' EXIT
mkdir -p "${backup_dir}" "${staging}/database" "${staging}/data" "${staging}/runtime"

if [[ -n "$(compose ps -q backend)" ]] && [[ "$(docker inspect --format '{{.State.Running}}' "$(compose ps -q backend)" 2>/dev/null)" == "true" ]]; then
  backend_was_running=true
  echo "短暂停止后端，保证数据库与文件引用处于一致边界..."
  compose stop backend >/dev/null
fi

echo "导出 MySQL 数据库..."
# 这里的变量由 db 容器内的 shell 展开，不应在宿主机提前展开。
# shellcheck disable=SC2016
compose exec -T db sh -c 'MYSQL_PWD="$MYSQL_PASSWORD" exec mysqldump -u"$MYSQL_USER" --single-transaction --no-tablespaces --routines --triggers "$MYSQL_DATABASE"' \
  > "${staging}/database/soft_web.sql"

echo "归档上传文件、分析结果与运行配置..."
tar -C "${PROJECT_DIR}/data" -cf - storage | tar -C "${staging}/data" -xf -
cp -a "${RUNTIME_FILE}" "${staging}/runtime/.env.runtime"
cp -a "${COMPOSE_FILE}" "${staging}/runtime/compose.yaml"
git -C "${PROJECT_DIR}" rev-parse HEAD > "${staging}/runtime/git-commit.txt"

tar -czf "${archive}" -C "${staging}" .
chmod 600 "${archive}"
sha256sum "${archive}" > "${checksum}"
chmod 600 "${checksum}"
tar -tzf "${archive}" >/dev/null

restore_backend
backend_was_running=false

echo "仅保留最近 7 份完整备份..."
mapfile -t expired < <(find "${backup_dir}" -maxdepth 1 -type f -name 'da-system-sc-*.tar.gz' -printf '%f\n' | sort -r | tail -n +8)
for name in "${expired[@]}"; do
  rm -f -- "${backup_dir}/${name}" "${backup_dir}/${name}.sha256"
done

windows_script="${PROJECT_DIR}/deployment/windows/protect-backups.ps1"
if command -v pwsh.exe >/dev/null 2>&1 && [[ -f "${windows_script}" ]]; then
  pwsh.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass \
    -File "$(wslpath -w "${windows_script}")" \
    -BackupDirectory "$(wslpath -w "${backup_dir}")" >/dev/null
elif command -v powershell.exe >/dev/null 2>&1 && [[ -f "${windows_script}" ]]; then
  powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass \
    -File "$(wslpath -w "${windows_script}")" \
    -BackupDirectory "$(wslpath -w "${backup_dir}")" >/dev/null
fi

echo "备份完成并通过归档校验：${archive}"
