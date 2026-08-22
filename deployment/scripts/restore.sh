#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"

archive="${1:-}"
confirmation="${2:-}"
[[ -f "${archive}" ]] || die "请提供可读取的备份归档路径"
[[ "${confirmation}" == "--confirm-restore" ]] || die "恢复会覆盖数据库和 storage，请追加 --confirm-restore"
validate_runtime false
pin_running_image_tag

if [[ -f "${archive}.sha256" ]]; then
  (cd "$(dirname "${archive}")" && sha256sum -c "$(basename "${archive}.sha256")")
fi
tar -tzf "${archive}" >/dev/null

staging="$(mktemp -d)"
rollback_dir="${PROJECT_DIR}/backups/pre-restore-$(date +%Y%m%d-%H%M%S)"
trap 'rm -rf "${staging}"' EXIT
tar -xzf "${archive}" -C "${staging}"
[[ -s "${staging}/database/soft_web.sql" ]] || die "备份缺少数据库导出"
[[ -d "${staging}/data/storage" ]] || die "备份缺少 storage"

echo "停止应用容器并保留当前 storage 回滚副本..."
compose stop cloudflared web backend >/dev/null 2>&1 || true
mkdir -p "${rollback_dir}"
if [[ -d "${PROJECT_DIR}/data/storage" ]]; then
  mv "${PROJECT_DIR}/data/storage" "${rollback_dir}/storage"
fi
mkdir -p "${PROJECT_DIR}/data"
cp -a "${staging}/data/storage" "${PROJECT_DIR}/data/storage"

echo "重建并恢复数据库..."
compose up -d db
wait_for_container_health db 240 || die "MySQL 未通过健康检查"
# 下面的变量由 db 容器内的 shell 展开，避免将数据库密码拼进宿主机命令行。
# shellcheck disable=SC2016
compose exec -T db sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot -e "DROP DATABASE IF EXISTS \`$MYSQL_DATABASE\`; CREATE DATABASE \`$MYSQL_DATABASE\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; GRANT ALL PRIVILEGES ON \`$MYSQL_DATABASE\`.* TO \"$MYSQL_USER\"@\"%\"; FLUSH PRIVILEGES;"'
# shellcheck disable=SC2016
compose exec -T db sh -c 'MYSQL_PWD="$MYSQL_PASSWORD" exec mysql -u"$MYSQL_USER" "$MYSQL_DATABASE"' \
  < "${staging}/database/soft_web.sql"

compose run --rm migrate
compose up -d backend web cloudflared
echo "恢复完成；原 storage 保留在 ${rollback_dir}，运行密钥未被备份覆盖。"
"${SCRIPT_DIR}/status.sh"
