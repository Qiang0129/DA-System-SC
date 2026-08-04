import json
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect, text

from app.migrations import DatabaseMigrationError, ensure_database_is_current, get_alembic_heads


BACKEND_ROOT = Path(__file__).resolve().parents[1]


def _alembic_config(database_path: Path) -> Config:
    config = Config(str(BACKEND_ROOT / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_ROOT / "alembic").replace("%", "%%"))
    config.set_main_option(
        "sqlalchemy.url",
        f"sqlite+pysqlite:///{database_path.as_posix()}".replace("%", "%%"),
    )
    return config


def _engine(database_path: Path):
    return create_engine(f"sqlite+pysqlite:///{database_path.as_posix()}", future=True)


def _upgrade(database_path: Path, revision: str = "head") -> None:
    command.upgrade(_alembic_config(database_path), revision)


def test_upgrade_head_creates_current_schema_and_version(tmp_path):
    database_path = tmp_path / "empty.sqlite3"
    _upgrade(database_path)

    engine = _engine(database_path)
    inspector = inspect(engine)
    tables = set(inspector.get_table_names())
    assert {
        "alembic_version",
        "schema_migrations",
        "users",
        "email_verification_codes",
        "datasets",
        "analysis_tasks",
        "task_results",
        "task_exports",
        "operation_logs",
    }.issubset(tables)

    columns = {column["name"] for column in inspector.get_columns("analysis_tasks")}
    assert {
        "name",
        "failure_reason",
        "current_stage",
        "worker_id",
        "heartbeat_at",
        "retry_count",
        "queued_at",
        "finished_at",
    }.issubset(columns)

    foreign_keys = inspector.get_foreign_keys("analysis_tasks")
    dataset_fk = next(fk for fk in foreign_keys if fk["constrained_columns"] == ["dataset_id"])
    assert dataset_fk["options"]["ondelete"] == "RESTRICT"

    operation_log_fk = next(
        fk for fk in inspector.get_foreign_keys("operation_logs") if fk["constrained_columns"] == ["task_id"]
    )
    assert operation_log_fk["options"]["ondelete"] == "SET NULL"

    index_names = {index["name"] for index in inspector.get_indexes("analysis_tasks")}
    assert {
        "idx_analysis_tasks_user_dataset",
        "idx_analysis_tasks_dataset_status_finished",
        "idx_analysis_tasks_worker_id",
        "idx_analysis_tasks_heartbeat_at",
        "idx_analysis_tasks_status_queued",
        "idx_analysis_tasks_status_heartbeat",
    }.issubset(index_names)

    with engine.connect() as connection:
        version_rows = connection.execute(text("SELECT version_num FROM alembic_version")).scalars().all()
    assert set(version_rows) == set(get_alembic_heads())


def test_p001_migrates_legacy_drafts_once_and_keeps_old_table(tmp_path):
    database_path = tmp_path / "legacy.sqlite3"
    _upgrade(database_path, "20260804_0001")

    engine = _engine(database_path)
    with engine.begin() as connection:
        connection.execute(
            text(
                "INSERT INTO users (username, email, password_hash) "
                "VALUES ('legacy-owner', 'legacy@example.test', 'hash')",
            ),
        )
        user_id = connection.execute(text("SELECT id FROM users WHERE username = 'legacy-owner'")).scalar_one()
        connection.execute(
            text(
                "INSERT INTO datasets "
                "(user_id, name, original_filename, storage_path, file_hash, sample_count, base_cluster_count) "
                "VALUES (:user_id, 'Legacy dataset', 'legacy.mat', '/tmp/legacy.mat', 'hash', 4, 3)",
            ),
            {"user_id": user_id},
        )
        dataset_id = connection.execute(text("SELECT id FROM datasets")).scalar_one()
        connection.exec_driver_sql(
            """
            CREATE TABLE dataset_tasks (
              id INTEGER PRIMARY KEY,
              user_id INTEGER NOT NULL,
              dataset_id INTEGER NOT NULL,
              name VARCHAR(128) NOT NULL,
              status VARCHAR(32) NOT NULL DEFAULT 'draft',
              selected_base_count INTEGER NOT NULL DEFAULT 0,
              created_at DATETIME,
              updated_at DATETIME
            )
            """,
        )
        connection.execute(
            text(
                "INSERT INTO dataset_tasks "
                "(id, user_id, dataset_id, name, status, selected_base_count) "
                "VALUES (11, :user_id, :dataset_id, 'Old draft', 'draft', 20), "
                "(12, :user_id, :dataset_id, 'Old failed', 'failed', 1), "
                "(13, :user_id, 99999, 'Orphan draft', 'draft', 1)",
            ),
            {"user_id": user_id, "dataset_id": dataset_id},
        )

    _upgrade(database_path)

    with engine.connect() as connection:
        tasks = connection.execute(
            text("SELECT dataset_id, status, params_json FROM analysis_tasks ORDER BY id"),
        ).mappings().all()
        migration = connection.execute(
            text(
                "SELECT migrated_rows, skipped_rows FROM schema_migrations "
                "WHERE version = '20260804_p0_01_unify_task_references'",
            ),
        ).mappings().one()
        legacy_count = connection.execute(text("SELECT COUNT(*) FROM dataset_tasks")).scalar_one()

    assert len(tasks) == 1
    assert tasks[0]["dataset_id"] == dataset_id
    assert tasks[0]["status"] == "draft"
    assert json.loads(tasks[0]["params_json"])["legacyDatasetTaskId"] == 11
    assert json.loads(tasks[0]["params_json"])["nBase"] == 3
    assert migration["migrated_rows"] == 1
    assert migration["skipped_rows"] == 2
    assert legacy_count == 3

    # 把 Alembic 版本退回迁移前再执行，验证业务审计记录可以阻止重复导入。
    command.stamp(_alembic_config(database_path), "20260804_0001")
    _upgrade(database_path)
    with engine.connect() as connection:
        assert connection.execute(text("SELECT COUNT(*) FROM analysis_tasks")).scalar_one() == 1
        assert connection.execute(text("SELECT COUNT(*) FROM dataset_tasks")).scalar_one() == 3


def test_startup_migration_check_rejects_missing_and_old_versions(tmp_path):
    missing_engine = _engine(tmp_path / "missing.sqlite3")
    with pytest.raises(DatabaseMigrationError, match="缺少 alembic_version"):
        ensure_database_is_current(missing_engine)

    old_database = tmp_path / "old.sqlite3"
    _upgrade(old_database, "20260804_0001")
    with pytest.raises(DatabaseMigrationError, match="落后或不兼容"):
        ensure_database_is_current(_engine(old_database))


def test_startup_migration_check_accepts_head(tmp_path):
    database_path = tmp_path / "current.sqlite3"
    _upgrade(database_path)
    ensure_database_is_current(_engine(database_path))
