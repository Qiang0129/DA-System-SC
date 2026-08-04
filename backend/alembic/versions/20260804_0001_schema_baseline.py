"""Create the application schema baseline.

Revision ID: 20260804_0001
Revises:
Create Date: 2026-08-04
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql


revision: str = "20260804_0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def identifier_type():
    return (
        sa.BigInteger()
        .with_variant(mysql.BIGINT(unsigned=True), "mysql")
        .with_variant(sa.Integer(), "sqlite")
    )


def file_size_type():
    return (
        sa.BigInteger()
        .with_variant(mysql.BIGINT(unsigned=True), "mysql")
        .with_variant(sa.Integer(), "sqlite")
    )


def upgrade() -> None:
    # schema_migrations 是 P0-01 旧 SQL 迁移留下的审计表，保留以兼容已经上线的数据库。
    op.create_table(
        "schema_migrations",
        sa.Column("version", sa.String(length=128), nullable=False),
        sa.Column("description", sa.String(length=255), nullable=False),
        sa.Column("migrated_rows", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("skipped_rows", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("applied_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.PrimaryKeyConstraint("version"),
    )

    op.create_table(
        "users",
        sa.Column("id", identifier_type(), autoincrement=True, nullable=False),
        sa.Column("username", sa.String(length=64), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=True),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("role", sa.String(length=32), nullable=False, server_default=sa.text("'user'")),
        sa.Column("status", sa.String(length=32), nullable=False, server_default=sa.text("'active'")),
        sa.Column("last_login_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("username", name="uk_users_username"),
    )
    op.create_index("idx_users_status", "users", ["status"], unique=False)
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    op.create_table(
        "user_sessions",
        sa.Column("id", identifier_type(), autoincrement=True, nullable=False),
        sa.Column("user_id", identifier_type(), nullable=False),
        sa.Column("refresh_token_hash", sa.String(length=255), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("revoked_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_user_sessions_user_id", ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("refresh_token_hash", name="uk_user_sessions_refresh_token_hash"),
    )
    op.create_index("idx_user_sessions_user_id", "user_sessions", ["user_id"], unique=False)
    op.create_index("idx_user_sessions_expires_at", "user_sessions", ["expires_at"], unique=False)

    op.create_table(
        "email_verification_codes",
        sa.Column("id", identifier_type(), autoincrement=True, nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("purpose", sa.String(length=32), nullable=False, server_default=sa.text("'register'")),
        sa.Column("code_hash", sa.String(length=255), nullable=False),
        sa.Column("client_ip", sa.String(length=64), nullable=True),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("consumed_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_email_verification_codes_email", "email_verification_codes", ["email"], unique=False)
    op.create_index("idx_email_verification_codes_purpose", "email_verification_codes", ["purpose"], unique=False)
    op.create_index("idx_email_verification_codes_expires_at", "email_verification_codes", ["expires_at"], unique=False)
    op.create_index("idx_email_verification_codes_created_at", "email_verification_codes", ["created_at"], unique=False)

    op.create_table(
        "datasets",
        sa.Column("id", identifier_type(), autoincrement=True, nullable=False),
        sa.Column("user_id", identifier_type(), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("original_filename", sa.String(length=255), nullable=False),
        sa.Column("storage_path", sa.String(length=500), nullable=False),
        sa.Column("file_hash", sa.String(length=128), nullable=False),
        sa.Column("sample_count", sa.Integer(), nullable=False),
        sa.Column("base_cluster_count", sa.Integer(), nullable=False),
        sa.Column("has_ground_truth", sa.Boolean(), nullable=False, server_default=sa.text("0")),
        sa.Column("cluster_count", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default=sa.text("'ready'")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_datasets_user_id", ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_datasets_user_id", "datasets", ["user_id"], unique=False)
    op.create_index("idx_datasets_status", "datasets", ["status"], unique=False)
    op.create_index("idx_datasets_created_at", "datasets", ["created_at"], unique=False)

    op.create_table(
        "dataset_revisions",
        sa.Column("id", identifier_type(), autoincrement=True, nullable=False),
        sa.Column("dataset_id", identifier_type(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("action", sa.String(length=32), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("original_filename", sa.String(length=255), nullable=False),
        sa.Column("storage_path", sa.String(length=500), nullable=False),
        sa.Column("file_hash", sa.String(length=128), nullable=False),
        sa.Column("sample_count", sa.Integer(), nullable=False),
        sa.Column("base_cluster_count", sa.Integer(), nullable=False),
        sa.Column("has_ground_truth", sa.Boolean(), nullable=False, server_default=sa.text("0")),
        sa.Column("cluster_count", sa.Integer(), nullable=True),
        sa.Column("quality_status", sa.String(length=16), nullable=False, server_default=sa.text("'ready'")),
        sa.Column("quality_issues_json", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.ForeignKeyConstraint(["dataset_id"], ["datasets.id"], name="fk_dataset_revisions_dataset_id", ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_dataset_revisions_dataset_id", "dataset_revisions", ["dataset_id"], unique=False)
    op.create_index("idx_dataset_revisions_created_at", "dataset_revisions", ["created_at"], unique=False)

    op.create_table(
        "dataset_qualities",
        sa.Column("id", identifier_type(), autoincrement=True, nullable=False),
        sa.Column("dataset_id", identifier_type(), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False, server_default=sa.text("'ready'")),
        sa.Column("issues_json", sa.Text(), nullable=True),
        sa.Column("checked_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.ForeignKeyConstraint(["dataset_id"], ["datasets.id"], name="fk_dataset_qualities_dataset_id", ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("dataset_id", name="uk_dataset_qualities_dataset_id"),
    )
    op.create_index("idx_dataset_qualities_dataset_id", "dataset_qualities", ["dataset_id"], unique=False)
    op.create_index("idx_dataset_qualities_status", "dataset_qualities", ["status"], unique=False)

    op.create_table(
        "analysis_tasks",
        sa.Column("id", identifier_type(), autoincrement=True, nullable=False),
        sa.Column("user_id", identifier_type(), nullable=False),
        sa.Column("dataset_id", identifier_type(), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False, server_default=sa.text("''")),
        sa.Column("mode", sa.String(length=32), nullable=False, server_default=sa.text("'OMELET-SV'")),
        sa.Column("status", sa.String(length=32), nullable=False, server_default=sa.text("'draft'")),
        sa.Column("progress", sa.Numeric(5, 2), nullable=False, server_default=sa.text("0.00")),
        sa.Column("current_run", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("current_iter", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("max_iter", sa.Integer(), nullable=False, server_default=sa.text("20")),
        sa.Column("params_json", sa.JSON(), nullable=False),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("failure_reason", sa.String(length=64), nullable=True),
        sa.Column("current_stage", sa.String(length=64), nullable=True),
        sa.Column("queued_at", sa.DateTime(), nullable=True),
        sa.Column("started_at", sa.DateTime(), nullable=True),
        sa.Column("finished_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_analysis_tasks_user_id", ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["dataset_id"], ["datasets.id"], name="fk_analysis_tasks_dataset_id", ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_analysis_tasks_user_id", "analysis_tasks", ["user_id"], unique=False)
    op.create_index("idx_analysis_tasks_dataset_id", "analysis_tasks", ["dataset_id"], unique=False)
    op.create_index("idx_analysis_tasks_status", "analysis_tasks", ["status"], unique=False)
    op.create_index("idx_analysis_tasks_created_at", "analysis_tasks", ["created_at"], unique=False)

    op.create_table(
        "task_templates",
        sa.Column("id", identifier_type(), autoincrement=True, nullable=False),
        sa.Column("user_id", identifier_type(), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("mode", sa.String(length=32), nullable=False, server_default=sa.text("'OMELET-SV'")),
        sa.Column("params_json", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_task_templates_user_id", ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_task_templates_user_id", "task_templates", ["user_id"], unique=False)
    op.create_index("idx_task_templates_created_at", "task_templates", ["created_at"], unique=False)

    op.create_table(
        "task_results",
        sa.Column("id", identifier_type(), autoincrement=True, nullable=False),
        sa.Column("schema_version", sa.Integer(), nullable=True),
        sa.Column("task_id", identifier_type(), nullable=False),
        sa.Column("metrics_json", sa.JSON(), nullable=True),
        sa.Column("kernel_weights_json", sa.JSON(), nullable=True),
        sa.Column("convergence_json", sa.JSON(), nullable=True),
        sa.Column("preview_json", sa.JSON(), nullable=True),
        sa.Column("labels_path", sa.String(length=500), nullable=True),
        sa.Column("ca_matrix_path", sa.String(length=500), nullable=True),
        sa.Column("s_matrix_path", sa.String(length=500), nullable=True),
        sa.Column("z_matrix_path", sa.String(length=500), nullable=True),
        sa.Column("runtime_seconds", sa.Numeric(12, 4), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.ForeignKeyConstraint(["task_id"], ["analysis_tasks.id"], name="fk_task_results_task_id", ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("task_id", name="uk_task_results_task_id"),
    )
    op.create_index("idx_task_results_task_id", "task_results", ["task_id"], unique=False)

    op.create_table(
        "task_exports",
        sa.Column("id", identifier_type(), autoincrement=True, nullable=False),
        sa.Column("task_id", identifier_type(), nullable=False),
        sa.Column("export_type", sa.String(length=32), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=True),
        sa.Column("items_json", sa.JSON(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default=sa.text("'ready'")),
        sa.Column("filename", sa.String(length=255), nullable=False),
        sa.Column("storage_path", sa.String(length=500), nullable=False),
        sa.Column("file_size", file_size_type(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.ForeignKeyConstraint(["task_id"], ["analysis_tasks.id"], name="fk_task_exports_task_id", ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_task_exports_task_id", "task_exports", ["task_id"], unique=False)
    op.create_index("idx_task_exports_export_type", "task_exports", ["export_type"], unique=False)

    op.create_table(
        "operation_logs",
        sa.Column("id", identifier_type(), autoincrement=True, nullable=False),
        sa.Column("user_id", identifier_type(), nullable=True),
        sa.Column("task_id", identifier_type(), nullable=True),
        sa.Column("action", sa.String(length=64), nullable=False),
        sa.Column("level", sa.String(length=16), nullable=False, server_default=sa.text("'info'")),
        sa.Column("message", sa.String(length=500), nullable=False),
        sa.Column("detail_json", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_operation_logs_user_id", ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["task_id"], ["analysis_tasks.id"], name="fk_operation_logs_task_id", ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_operation_logs_user_id", "operation_logs", ["user_id"], unique=False)
    op.create_index("idx_operation_logs_task_id", "operation_logs", ["task_id"], unique=False)
    op.create_index("idx_operation_logs_action", "operation_logs", ["action"], unique=False)
    op.create_index("idx_operation_logs_created_at", "operation_logs", ["created_at"], unique=False)


def downgrade() -> None:
    for table_name in (
        "operation_logs",
        "task_exports",
        "task_results",
        "task_templates",
        "dataset_qualities",
        "dataset_revisions",
        "analysis_tasks",
        "datasets",
        "email_verification_codes",
        "user_sessions",
        "users",
        "schema_migrations",
    ):
        op.drop_table(table_name)
