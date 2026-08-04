"""Add task execution leases, heartbeats and retry counters.

Revision ID: 20260804_0003
Revises: 20260804_0002
Create Date: 2026-08-04
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260804_0003"
down_revision: Union[str, None] = "20260804_0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    columns = {column["name"] for column in inspector.get_columns("analysis_tasks")}
    if "worker_id" not in columns:
        op.add_column("analysis_tasks", sa.Column("worker_id", sa.String(length=128), nullable=True))
    if "heartbeat_at" not in columns:
        op.add_column("analysis_tasks", sa.Column("heartbeat_at", sa.DateTime(), nullable=True))
    if "retry_count" not in columns:
        op.add_column(
            "analysis_tasks",
            sa.Column("retry_count", sa.Integer(), nullable=False, server_default=sa.text("0")),
        )

    existing_indexes = {index["name"] for index in inspector.get_indexes("analysis_tasks")}
    if "idx_analysis_tasks_worker_id" not in existing_indexes:
        op.create_index("idx_analysis_tasks_worker_id", "analysis_tasks", ["worker_id"], unique=False)
    if "idx_analysis_tasks_heartbeat_at" not in existing_indexes:
        op.create_index("idx_analysis_tasks_heartbeat_at", "analysis_tasks", ["heartbeat_at"], unique=False)
    if "idx_analysis_tasks_status_queued" not in existing_indexes:
        op.create_index(
            "idx_analysis_tasks_status_queued",
            "analysis_tasks",
            ["status", "queued_at", "id"],
            unique=False,
        )
    if "idx_analysis_tasks_status_heartbeat" not in existing_indexes:
        op.create_index(
            "idx_analysis_tasks_status_heartbeat",
            "analysis_tasks",
            ["status", "heartbeat_at"],
            unique=False,
        )


def downgrade() -> None:
    op.drop_index("idx_analysis_tasks_status_heartbeat", table_name="analysis_tasks")
    op.drop_index("idx_analysis_tasks_status_queued", table_name="analysis_tasks")
    op.drop_index("idx_analysis_tasks_heartbeat_at", table_name="analysis_tasks")
    op.drop_index("idx_analysis_tasks_worker_id", table_name="analysis_tasks")
    op.drop_column("analysis_tasks", "retry_count")
    op.drop_column("analysis_tasks", "heartbeat_at")
    op.drop_column("analysis_tasks", "worker_id")
