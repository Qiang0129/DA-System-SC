"""Add P1-04 constraints, indexes and transactional storage cleanup queue.

Revision ID: 20260804_0005
Revises: 20260804_0004
Create Date: 2026-08-04
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql


revision: str = "20260804_0005"
down_revision: Union[str, None] = "20260804_0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def identifier_type():
    return (
        sa.BigInteger()
        .with_variant(mysql.BIGINT(unsigned=True), "mysql")
        .with_variant(sa.Integer(), "sqlite")
    )


def _has_unique(bind, table_name: str, columns: list[str]) -> bool:
    inspector = sa.inspect(bind)
    target = list(columns)
    for constraint in inspector.get_unique_constraints(table_name):
        if list(constraint.get("column_names") or []) == target:
            return True
    for index in inspector.get_indexes(table_name):
        if index.get("unique") and list(index.get("column_names") or []) == target:
            return True
    return False


def _duplicate_values(bind, table_name: str, columns: list[str]) -> list[tuple]:
    column_sql = ", ".join(f"`{column}`" for column in columns)
    rows = bind.execute(
        sa.text(
            f"SELECT {column_sql}, COUNT(*) AS duplicate_count "
            f"FROM `{table_name}` GROUP BY {column_sql} HAVING COUNT(*) > 1",
        ),
    ).fetchall()
    return [tuple(row) for row in rows]


def _ensure_unique(bind, table_name: str, columns: list[str], constraint_name: str) -> None:
    if _has_unique(bind, table_name, columns):
        return

    duplicates = _duplicate_values(bind, table_name, columns)
    if duplicates:
        formatted = ", ".join(str(row[:-1]) for row in duplicates[:20])
        raise RuntimeError(
            f"{table_name} 存在重复唯一键 {columns}，请先人工处理：{formatted}",
        )

    if bind.dialect.name == "sqlite":
        with op.batch_alter_table(table_name, recreate="always") as batch:
            batch.create_unique_constraint(constraint_name, columns)
    else:
        op.create_unique_constraint(constraint_name, table_name, columns)


def _operation_log_orphans(bind) -> int:
    return int(
        bind.execute(
            sa.text(
                "SELECT COUNT(*) FROM operation_logs AS log "
                "LEFT JOIN analysis_tasks AS task ON task.id = log.task_id "
                "WHERE log.task_id IS NOT NULL AND task.id IS NULL",
            ),
        ).scalar_one(),
    )


def _ensure_operation_log_fk(bind) -> None:
    inspector = sa.inspect(bind)
    orphan_count = _operation_log_orphans(bind)
    if orphan_count:
        raise RuntimeError(
            f"operation_logs 存在 {orphan_count} 条无效 task_id，无法建立 SET NULL 外键；请先人工处理",
        )

    foreign_keys = [
        foreign_key
        for foreign_key in inspector.get_foreign_keys("operation_logs")
        if foreign_key.get("constrained_columns") == ["task_id"]
        and foreign_key.get("referred_table") == "analysis_tasks"
    ]
    current = foreign_keys[0] if foreign_keys else None
    ondelete = str((current or {}).get("options", {}).get("ondelete", "")).upper()
    if current is not None and ondelete == "SET NULL":
        return

    constraint_name = (current or {}).get("name")
    if bind.dialect.name == "sqlite":
        with op.batch_alter_table("operation_logs", recreate="always") as batch:
            if constraint_name:
                batch.drop_constraint(constraint_name, type_="foreignkey")
            batch.create_foreign_key(
                "fk_operation_logs_task_id",
                "analysis_tasks",
                ["task_id"],
                ["id"],
                ondelete="SET NULL",
            )
        return

    if constraint_name:
        op.drop_constraint(constraint_name, "operation_logs", type_="foreignkey")
    op.create_foreign_key(
        "fk_operation_logs_task_id",
        "operation_logs",
        "analysis_tasks",
        ["task_id"],
        ["id"],
        ondelete="SET NULL",
    )


def _ensure_index(bind, name: str, table_name: str, columns: list[str]) -> None:
    existing = {index["name"] for index in sa.inspect(bind).get_indexes(table_name)}
    if name not in existing:
        op.create_index(name, table_name, columns, unique=False)


def _create_cleanup_jobs_table(bind) -> None:
    if "storage_cleanup_jobs" in sa.inspect(bind).get_table_names():
        return

    op.create_table(
        "storage_cleanup_jobs",
        sa.Column("id", identifier_type(), autoincrement=True, nullable=False),
        sa.Column("storage_path", sa.String(length=500), nullable=False),
        sa.Column("storage_kind", sa.String(length=32), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False, server_default=sa.text("'pending'")),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("next_attempt_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("storage_path", name="uk_storage_cleanup_jobs_storage_path"),
    )
    op.create_index(
        "idx_storage_cleanup_jobs_status_retry",
        "storage_cleanup_jobs",
        ["status", "next_attempt_at", "id"],
        unique=False,
    )
    op.create_index(
        "idx_storage_cleanup_jobs_created_at",
        "storage_cleanup_jobs",
        ["created_at"],
        unique=False,
    )
    op.create_index(
        "idx_storage_cleanup_jobs_status",
        "storage_cleanup_jobs",
        ["status"],
        unique=False,
    )
    op.create_index(
        "idx_storage_cleanup_jobs_next_attempt_at",
        "storage_cleanup_jobs",
        ["next_attempt_at"],
        unique=False,
    )


def upgrade() -> None:
    bind = op.get_bind()

    # 所有数据校验先完成，避免 DDL 执行一半后才发现历史脏数据。
    _ensure_unique(bind, "dataset_revisions", ["dataset_id", "version"], "uk_dataset_revisions_dataset_version")
    _ensure_unique(bind, "task_results", ["task_id"], "uk_task_results_task_id")
    _ensure_operation_log_fk(bind)

    _ensure_index(
        bind,
        "idx_task_exports_task_id_id",
        "task_exports",
        ["task_id", "id"],
    )
    _ensure_index(
        bind,
        "idx_analysis_tasks_user_status_queued",
        "analysis_tasks",
        ["user_id", "status", "queued_at"],
    )
    _ensure_index(
        bind,
        "idx_datasets_user_created_at",
        "datasets",
        ["user_id", "created_at"],
    )
    _create_cleanup_jobs_table(bind)


def downgrade() -> None:
    raise RuntimeError("P1-04 包含约束和文件清理队列，不支持自动 downgrade；请从备份恢复")
