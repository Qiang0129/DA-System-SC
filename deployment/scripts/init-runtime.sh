#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"

require_command openssl
[[ ! -e "${RUNTIME_FILE}" ]] || die "${RUNTIME_FILE} 已存在；为避免轮换数据库和 JWT 密钥，本脚本拒绝覆盖"

umask 077
db_password="$(openssl rand -hex 32)"
root_password="$(openssl rand -hex 32)"
jwt_secret="$(openssl rand -base64 64 | tr -d '\n')"

cat > "${RUNTIME_FILE}" <<EOF
APP_IMAGE_TAG=local
DB_NAME=soft_web
DB_USER=soft_web
DB_PASSWORD=${db_password}
MYSQL_ROOT_PASSWORD=${root_password}
JWT_SECRET_KEY=${jwt_secret}
CLOUDFLARE_TUNNEL_TOKEN=
EOF

chmod 600 "${RUNTIME_FILE}"
mkdir -p "${PROJECT_DIR}/data/storage/datasets" "${PROJECT_DIR}/data/storage/results" "${PROJECT_DIR}/backups"
chmod 700 "${PROJECT_DIR}/data" "${PROJECT_DIR}/data/storage" "${PROJECT_DIR}/backups"

echo "已创建运行配置：${RUNTIME_FILE}"
echo "下一步请执行 deployment/scripts/set-tunnel-token.sh，Token 会通过隐藏输入写入。"
