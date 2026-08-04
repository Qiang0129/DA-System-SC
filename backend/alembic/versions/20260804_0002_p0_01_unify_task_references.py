"""Formalize the P0-01 task reference migration.

Revision ID: 20260804_0002
Revises: 20260804_0001
Create Date: 2026-08-04
"""
from datetime import datetime, timezone
import json
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260804_0002"
down_revision: Union[str, None] = "20260804_0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


P001_VERSION = "20260804_p0_01_unify_task_references"


def _is_already_applied(bind) -> bool:
    if "schema_migrations" not in sa.inspect(bind).get_table_names():
        return False
    return (
        bind.execute(
            sa.text("SELECT 1 FROM schema_migrations WHERE version = :version"),
            {"version": P001_VERSION},
        ).first()
        is not None
    )


def _create_schema_migrations_if_missing(bind) -> None:
    if "schema_migrations" in sa.inspect(bind).get_table_names():
        return

    op.create_table(
        "schema_migrations",
        sa.Column("version", sa.String(length=128), nullable=False),
        sa.Column("description", sa.String(length=255), nullable=False),
        sa.Column("migrated_rows", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("skipped_rows", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("applied_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.PrimaryKeyConstraint("version"),
    )


def _ensure_restricted_dataset_fk(bind) -> None:
    inspector = sa.inspect(bind)
    foreign_keys = [
        foreign_key
        for foreign_key in inspector.get_foreign_keys("analysis_tasks")
        if foreign_key.get("constrained_columns") == ["dataset_id"]
        and foreign_key.get("referred_table") == "datasets"
    ]
    current = foreign_keys[0] if foreign_keys else None
    ondelete = str((current or {}).get("options", {}).get("ondelete", "")).upper()
    if current is not None and ondelete == "RESTRICT":
        return

    constraint_name = (current or {}).get("name")
    if bind.dialect.name == "sqlite":
        with op.batch_alter_table("analysis_tasks", recreate="always") as batch:
            if constraint_name:
                batch.drop_constraint(constraint_name, type_="foreignkey")
            batch.create_foreign_key(
                "fk_analysis_tasks_dataset_id",
                "datasets",
                ["dataset_id"],
                ["id"],
                ondelete="RESTRICT",
            )
        return

    if constraint_name:
        op.drop_constraint(constraint_name, "analysis_tasks", type_="foreignkey")
    op.create_foreign_key(
        "fk_analysis_tasks_dataset_id",
        "analysis_tasks",
        "datasets",
        ["dataset_id"],
        ["id"],
        ondelete="RESTRICT",
    )


def _ensure_no_orphan_analysis_tasks(bind) -> None:
    """改外键前先阻止正式任务的悬空数据集引用。"""
    orphan_count = bind.execute(
        sa.text(
            """
            SELECT COUNT(*)
            FROM analysis_tasks AS task
            LEFT JOIN datasets AS dataset ON dataset.id = task.dataset_id
            WHERE dataset.id IS NULL
            """,
        ),
    ).scalar_one()
    if int(orphan_count) > 0:
        raise RuntimeError(
            f"analysis_tasks 存在 {int(orphan_count)} 条无效 dataset_id，停止 P0-01 迁移；请先修复数据",
        )


def _ensure_indexes(bind) -> None:
    existing = {index["name"] for index in sa.inspect(bind).get_indexes("analysis_tasks")}
    if "idx_analysis_tasks_user_dataset" not in existing:
        op.create_index(
            "idx_analysis_tasks_user_dataset",
            "analysis_tasks",
            ["user_id", "dataset_id"],
            unique=False,
        )
    if "idx_analysis_tasks_dataset_status_finished" not in existing:
        op.create_index(
            "idx_analysis_tasks_dataset_status_finished",
            "analysis_tasks",
            ["dataset_id", "status", "finished_at"],
            unique=False,
        )


def _read_legacy_markers(bind) -> set[int]:
    markers: set[int] = set()
    rows = bind.execute(sa.text("SELECT params_json FROM analysis_tasks")).scalars()
    for raw_value in rows:
        if raw_value is None:
            continue
        try:
            payload = raw_value if isinstance(raw_value, dict) else json.loads(str(raw_value))
        except (TypeError, ValueError):
            continue
        marker = payload.get("legacyDatasetTaskId") if isinstance(payload, dict) else None
        if marker is None:
            continue
        try:
            markers.add(int(marker))
        except (TypeError, ValueError):
            continue
    return markers


def _migrate_legacy_drafts(bind) -> tuple[int, int]:
    inspector = sa.inspect(bind)
    if "dataset_tasks" not in inspector.get_table_names():
        return 0, 0

    legacy_columns = {column["name"] for column in inspector.get_columns("dataset_tasks")}
    required_columns = {
        "id",
        "user_id",
        "dataset_id",
        "name",
        "status",
        "selected_base_count",
        "created_at",
        "updated_at",
    }
    missing_columns = sorted(required_columns - legacy_columns)
    if missing_columns:
        raise RuntimeError(
            "dataset_tasks 缺少 P0-01 迁移所需字段：" + ", ".join(missing_columns),
        )

    total_rows = int(bind.execute(sa.text("SELECT COUNT(*) FROM dataset_tasks")).scalar_one())
    rows = bind.execute(
        sa.text(
            """
            SELECT
              legacy.id,
              legacy.user_id,
              legacy.dataset_id,
              legacy.name,
              legacy.selected_base_count,
              legacy.created_at,
              legacy.updated_at,
              dataset.name AS dataset_name,
              dataset.base_cluster_count
            FROM dataset_tasks AS legacy
            JOIN users AS owner ON owner.id = legacy.user_id
            JOIN datasets AS dataset
              ON dataset.id = legacy.dataset_id
             AND dataset.user_id = legacy.user_id
            WHERE legacy.status = 'draft'
              AND dataset.base_cluster_count > 0
            ORDER BY legacy.id
            """,
        ),
    ).mappings().all()

    existing_markers = _read_legacy_markers(bind)
    inserted_rows = 0
    now = datetime.now(timezone.utc)

    for row in rows:
        legacy_id = int(row["id"])
        if legacy_id in existing_markers:
            continue

        base_cluster_count = int(row["base_cluster_count"])
        selected_base_count = int(row["selected_base_count"] or 20)
        selected_base_count = min(max(selected_base_count, 1), base_cluster_count)
        created_at = row["created_at"] or now
        updated_at = row["updated_at"] or created_at
        task_name = (str(row["name"]).strip() if row["name"] is not None else "")
        task_name = (task_name or f"{row['dataset_name']} OMELET-SV 任务")[:128]
        params_json = json.dumps(
            {
                "nBase": selected_base_count,
                "sigma": 1.0,
                "lambda": 5.0,
                "gamma": 5.0,
                "anchor": 10,
                "runs": 10,
                "maxIter": 10,
                "randomSeed": 1,
                "legacyDatasetTaskId": legacy_id,
            },
            ensure_ascii=False,
            separators=(",", ":"),
        )
        bind.execute(
            sa.text(
                """
                INSERT INTO analysis_tasks (
                  user_id, dataset_id, name, mode, status, progress,
                  current_run, current_iter, max_iter, params_json,
                  error_message, failure_reason, current_stage, queued_at,
                  started_at, finished_at, created_at, updated_at
                ) VALUES (
                  :user_id, :dataset_id, :name, 'OMELET-SV', 'draft', 0,
                  0, 0, 10, :params_json,
                  NULL, NULL, NULL, NULL,
                  NULL, NULL, :created_at, :updated_at
                )
                """,
            ),
            {
                "user_id": row["user_id"],
                "dataset_id": row["dataset_id"],
                "name": task_name,
                "params_json": params_json,
                "created_at": created_at,
                "updated_at": updated_at,
            },
        )
        inserted_rows += 1

    return inserted_rows, max(total_rows - inserted_rows, 0)


def upgrade() -> None:
    bind = op.get_bind()
    if _is_already_applied(bind):
        return

    _ensure_no_orphan_analysis_tasks(bind)
    _create_schema_migrations_if_missing(bind)
    _ensure_restricted_dataset_fk(bind)
    _ensure_indexes(bind)

    migrated_rows, skipped_rows = _migrate_legacy_drafts(bind)
    bind.execute(
        sa.text(
            """
            INSERT INTO schema_migrations (version, description, migrated_rows, skipped_rows)
            VALUES (:version, :description, :migrated_rows, :skipped_rows)
            """,
        ),
        {
            "version": P001_VERSION,
            "description": "统一数据集任务引用到 analysis_tasks，并禁止级联删除正式任务",
            "migrated_rows": migrated_rows,
            "skipped_rows": skipped_rows,
        },
    )


def downgrade() -> None:
    raise RuntimeError("P0-01 含历史任务数据迁移，不支持自动 downgrade；请先制定人工回滚方案")
