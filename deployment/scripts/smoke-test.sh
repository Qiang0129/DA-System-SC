#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"

require_runtime_file
compose ps --status running backend web db >/dev/null

smoke_username="smoke-$(openssl rand -hex 6)"
smoke_password="$(openssl rand -base64 32 | tr -d '\n')"
backend_id="$(compose ps -q backend)"
backend_image="$(docker inspect --format '{{.Config.Image}}' "${backend_id}")"

cleanup_smoke_user() {
  compose exec -T -e SMOKE_USERNAME="${smoke_username}" backend python -c '
from sqlalchemy import delete
from app.database import SessionLocal
from app.models import User
import os
with SessionLocal() as session:
    session.execute(delete(User).where(User.username == os.environ["SMOKE_USERNAME"]))
    session.commit()
' >/dev/null 2>&1 || true
  unset smoke_password
}
trap cleanup_smoke_user EXIT

docker run --rm \
  --network da-system-sc_edge \
  -e SMOKE_USERNAME="${smoke_username}" \
  -e SMOKE_PASSWORD="${smoke_password}" \
  -v "${SCRIPT_DIR}/smoke-test.py:/tmp/smoke-test.py:ro" \
  "${backend_image}" \
  python /tmp/smoke-test.py
