import logging
import sys

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.auth import router as auth_router
from app.datasets import router as datasets_router
from app.config import Settings, get_settings, validate_jwt_secret_key
from app.database import engine
from app.migrations import ensure_database_is_current
from app.product import SOFTWARE_NAME, SOFTWARE_VERSION
from app.task_executor import task_execution_manager
from app.tasks import router as tasks_router
from app.storage_cleanup import process_pending_cleanup_jobs


settings = get_settings()
logger = logging.getLogger(__name__)


def validate_startup_configuration(current_settings: Settings) -> None:
    """启动前再次校验安全配置，防止绕过 Settings 校验后继续提供服务。"""
    try:
        validate_jwt_secret_key(current_settings.jwt_secret_key, current_settings.app_env)
    except ValueError as exc:
        raise RuntimeError(f"启动配置无效：{exc}") from exc


validate_startup_configuration(settings)

production_mode = settings.app_env.strip().lower() == "production"
app = FastAPI(
    title=f"{SOFTWARE_NAME} API {SOFTWARE_VERSION}",
    docs_url=None if production_mode else "/docs",
    redoc_url=None if production_mode else "/redoc",
    openapi_url=None if production_mode else "/openapi.json",
)

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
@app.on_event("startup")
def validate_database_schema():
    """启动时只读核对迁移版本，数据库结构变更必须在部署步骤中完成。"""
    ensure_database_is_current(engine)
    try:
        process_pending_cleanup_jobs(limit=100)
    except Exception:
        logger.exception("启动时处理文件清理队列失败，调度 Worker 将继续重试")
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
