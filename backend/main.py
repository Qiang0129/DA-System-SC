import sys

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect, text

from app.auth import router as auth_router
from app.datasets import router as datasets_router
from app.config import get_settings
from app.database import Base, engine
from app.task_executor import task_execution_manager
from app.tasks import router as tasks_router


settings = get_settings()

app = FastAPI(title="OMELET Lab API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(datasets_router)
app.include_router(tasks_router)


def ensure_analysis_task_columns() -> None:
    """兼容旧库：为 analysis_tasks 补齐任务中心新增字段。"""
    inspector = inspect(engine)
    if "analysis_tasks" not in inspector.get_table_names():
        return

    existing = {column["name"] for column in inspector.get_columns("analysis_tasks")}
    dialect = engine.dialect.name
    patches: list[tuple[str, str]] = []

    if "name" not in existing:
        patches.append(("name", "VARCHAR(128) NOT NULL DEFAULT ''" if dialect != "sqlite" else "TEXT DEFAULT ''"))
    if "failure_reason" not in existing:
        patches.append(("failure_reason", "VARCHAR(64) NULL" if dialect != "sqlite" else "TEXT"))
    if "current_stage" not in existing:
        patches.append(("current_stage", "VARCHAR(64) NULL" if dialect != "sqlite" else "TEXT"))
    if "current_run" not in existing:
        patches.append(("current_run", "INT NOT NULL DEFAULT 0" if dialect != "sqlite" else "INTEGER DEFAULT 0"))
    if "queued_at" not in existing:
        patches.append(("queued_at", "DATETIME NULL" if dialect != "sqlite" else "DATETIME"))
    if "updated_at" not in existing:
        patches.append(("updated_at", "DATETIME NULL" if dialect == "sqlite" else "DATETIME NULL DEFAULT CURRENT_TIMESTAMP"))

    if patches:
        with engine.begin() as conn:
            for column_name, column_type in patches:
                conn.execute(text(f"ALTER TABLE analysis_tasks ADD COLUMN {column_name} {column_type}"))

    inspector = inspect(engine)
    if "task_results" not in inspector.get_table_names():
        return
    result_columns = {column["name"] for column in inspector.get_columns("task_results")}
    if "schema_version" not in result_columns:
        column_type = "INT NULL" if dialect != "sqlite" else "INTEGER"
        with engine.begin() as conn:
            conn.execute(text(f"ALTER TABLE task_results ADD COLUMN schema_version {column_type}"))

    inspector = inspect(engine)
    if "task_exports" not in inspector.get_table_names():
        return
    export_columns = {column["name"] for column in inspector.get_columns("task_exports")}
    export_patches: list[tuple[str, str]] = []
    if "name" not in export_columns:
        export_patches.append(("name", "VARCHAR(128) NULL" if dialect != "sqlite" else "TEXT"))
    if "items_json" not in export_columns:
        export_patches.append(("items_json", "TEXT NULL" if dialect != "sqlite" else "TEXT"))
    if "status" not in export_columns:
        export_patches.append(("status", "VARCHAR(32) NOT NULL DEFAULT 'ready'" if dialect != "sqlite" else "TEXT DEFAULT 'ready'"))
    if export_patches:
        with engine.begin() as conn:
            for column_name, column_type in export_patches:
                conn.execute(text(f"ALTER TABLE task_exports ADD COLUMN {column_name} {column_type}"))


@app.on_event("startup")
def create_extension_tables():
    # 新增的数据集版本、质量和任务表通过 SQLAlchemy 元数据创建，既有数据集表不会被改写。
    Base.metadata.create_all(bind=engine)
    ensure_analysis_task_columns()
    # pytest 使用独立内存库和依赖覆盖，不启动后台线程以免触碰本地开发数据库。
    if "pytest" not in sys.modules:
        task_execution_manager.start()


@app.on_event("shutdown")
def stop_task_executor():
    if "pytest" not in sys.modules:
        task_execution_manager.stop()


@app.get("/api/health")
def health():
    return {"status": "ok", "service": "soft_web_backend"}
