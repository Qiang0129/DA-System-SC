"""Unify persisted timestamps under UTC semantics.

Revision ID: 20260804_0004
Revises: 20260804_0003
Create Date: 2026-08-04
"""

from __future__ import annotations

import json
import os
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260804_0004"
down_revision: Union[str, None] = "20260804_0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


MIGRATION_VERSION = "20260804_p1_01_unify_utc_timestamps"

# 这些字段过去由数据库默认值或任务执行器的本地 naive datetime 产生，
# 需要按数据库当时的偏移转换为 UTC。认证字段使用 utc_now() 写入，不能重复转换。
LOCAL_TIMESTAMP_COLUMNS: dict[str, tuple[str, ...]] = {
    "users": ("created_at", "updated_at"),
    "user_sessions": ("created_at",),
    "datasets": ("created_at",),
    "dataset_revisions": ("created_at",),
    "dataset_qualities": ("checked_at",),
    "analysis_tasks": (
        "created_at",
        "updated_at",
        "queued_at",
        "started_at",
        "finished_at",
        "heartbeat_at",
    ),
    "dataset_tasks": ("created_at", "updated_at"),
    "task_results": ("created_at",),
    "task_exports": ("created_at",),
    "task_templates": ("created_at",),
    "operation_logs": ("created_at",),
    "schema_migrations": ("applied_at",),
}


def _marker_exists(bind) -> bool:
    if "schema_migrations" not in sa.inspect(bind).get_table_names():
        return False
    return (
        bind.execute(
            sa.text("SELECT 1 FROM schema_migrations WHERE version = :version"),
            {"version": MIGRATION_VERSION},
        ).first()
        is not None
    )


def _ensure_metadata_column(bind) -> None:
    if "schema_migrations" not in sa.inspect(bind).get_table_names():
        raise RuntimeError("缺少 schema_migrations，无法记录 UTC 时间迁移审计")

    columns = {column["name"] for column in sa.inspect(bind).get_columns("schema_migrations")}
    if "metadata_json" not in columns:
        op.add_column("schema_migrations", sa.Column("metadata_json", sa.Text(), nullable=True))


def _source_offset_seconds(bind) -> int:
    """读取迁移连接当前偏移；测试可用环境变量提供 SQLite 的固定偏移。"""
    override = os.getenv("P1_01_SOURCE_OFFSET_SECONDS")
    if override is not None:
        try:
            return int(override)
        except ValueError as exc:
            raise RuntimeError("P1_01_SOURCE_OFFSET_SECONDS 必须是整数秒") from exc

    if bind.dialect.name == "mysql":
        value = bind.execute(
            sa.text("SELECT TIMESTAMPDIFF(SECOND, UTC_TIMESTAMP(), CURRENT_TIMESTAMP)"),
        ).scalar()
        return int(value or 0)

    # SQLite 没有数据库时区概念，测试数据默认已经按 UTC 语义写入。
    return 0


def _convert_column(bind, table_name: str, column_name: str, offset_seconds: int) -> int:
    if offset_seconds == 0:
        return 0

    columns = {column["name"] for column in sa.inspect(bind).get_columns(table_name)}
    if column_name not in columns:
        return 0

    if bind.dialect.name == "mysql":
        function = "DATE_SUB" if offset_seconds > 0 else "DATE_ADD"
        seconds = abs(offset_seconds)
        statement = sa.text(
            f"UPDATE `{table_name}` "
            f"SET `{column_name}` = {function}(`{column_name}`, INTERVAL {seconds} SECOND) "
            f"WHERE `{column_name}` IS NOT NULL",
        )
    elif bind.dialect.name == "sqlite":
        sign = "-" if offset_seconds > 0 else "+"
        modifier = f"{sign}{abs(offset_seconds)} seconds"
        statement = sa.text(
            f'UPDATE "{table_name}" '
            f'SET "{column_name}" = datetime("{column_name}", :modifier) '
            f'WHERE "{column_name}" IS NOT NULL',
        ).bindparams(modifier=modifier)
    else:
        raise RuntimeError(f"不支持的数据库方言：{bind.dialect.name}")

    result = bind.execute(statement)
    return max(int(result.rowcount or 0), 0)


def _convert_local_timestamps(bind, offset_seconds: int) -> dict[str, int]:
    table_names = set(sa.inspect(bind).get_table_names())
    converted: dict[str, int] = {}
    for table_name, columns in LOCAL_TIMESTAMP_COLUMNS.items():
        if table_name not in table_names:
            continue
        for column_name in columns:
            count = _convert_column(bind, table_name, column_name, offset_seconds)
            if count:
                converted[f"{table_name}.{column_name}"] = count
    return converted


def _set_connection_utc(bind) -> None:
    if bind.dialect.name == "mysql":
        bind.exec_driver_sql("SET time_zone = '+00:00'")


def upgrade() -> None:
    bind = op.get_bind()
    if _marker_exists(bind):
        return

    _ensure_metadata_column(bind)
    offset_seconds = _source_offset_seconds(bind)
    converted = _convert_local_timestamps(bind, offset_seconds)
    _set_connection_utc(bind)

    metadata = {
        "sourceOffsetSeconds": offset_seconds,
        "convertedColumns": converted,
        "preservedUtcColumns": [
            "users.last_login_at",
            "email_verification_codes.created_at",
            "email_verification_codes.expires_at",
            "email_verification_codes.consumed_at",
            "user_sessions.expires_at",
            "user_sessions.revoked_at",
        ],
    }
    bind.execute(
        sa.text(
            """
            INSERT INTO schema_migrations (
              version, description, migrated_rows, skipped_rows, metadata_json
            ) VALUES (
              :version, :description, :migrated_rows, :skipped_rows, :metadata_json
            )
            """,
        ),
        {
            "version": MIGRATION_VERSION,
            "description": "统一数据库时间为 UTC；认证模块已有 UTC 字段保持不变",
            "migrated_rows": sum(converted.values()),
            "skipped_rows": 0,
            "metadata_json": json.dumps(metadata, ensure_ascii=False, separators=(",", ":")),
        },
    )


def downgrade() -> None:
    raise RuntimeError("P1-01 会改变历史时间语义，不支持自动 downgrade；请从备份恢复")
