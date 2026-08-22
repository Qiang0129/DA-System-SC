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
  if ! compose exec -T -e SMOKE_USERNAME="${smoke_username}" backend python -c '
from sqlalchemy import delete, select
from app.database import SessionLocal
from app.models import AnalysisTask, Dataset, DatasetQuality, DatasetRevision, OperationLog, StorageCleanupJob, TaskExport, TaskResult, TaskTemplate, User, UserSession
import os
with SessionLocal() as session:
    user = session.scalar(select(User).where(User.username == os.environ["SMOKE_USERNAME"]))
    if user is not None:
        user_id = str(user.id)
        task_ids = list(session.scalars(select(AnalysisTask.id).where(AnalysisTask.user_id == user.id)))
        dataset_ids = list(session.scalars(select(Dataset.id).where(Dataset.user_id == user.id)))
        if task_ids:
            session.execute(delete(OperationLog).where(OperationLog.task_id.in_(task_ids)))
            session.execute(delete(TaskExport).where(TaskExport.task_id.in_(task_ids)))
            session.execute(delete(TaskResult).where(TaskResult.task_id.in_(task_ids)))
        if dataset_ids:
            session.execute(delete(DatasetRevision).where(DatasetRevision.dataset_id.in_(dataset_ids)))
            session.execute(delete(DatasetQuality).where(DatasetQuality.dataset_id.in_(dataset_ids)))
        session.execute(delete(OperationLog).where(OperationLog.user_id == user.id))
        session.execute(
            delete(StorageCleanupJob).where(
                StorageCleanupJob.storage_path.like(f"/data/datasets/{user_id}/%")
                | StorageCleanupJob.storage_path.like(f"/data/results/{user_id}/%"),
            ),
        )
        session.execute(delete(AnalysisTask).where(AnalysisTask.user_id == user.id))
        session.execute(delete(Dataset).where(Dataset.user_id == user.id))
        session.execute(delete(UserSession).where(UserSession.user_id == user.id))
        session.execute(delete(TaskTemplate).where(TaskTemplate.user_id == user.id))
        session.execute(delete(User).where(User.id == user.id))
    session.commit()
    ' >/dev/null 2>&1; then
    echo "错误：冒烟测试清理失败，数据库可能残留测试数据。" >&2
    return 1
  fi
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
