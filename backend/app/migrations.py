"""Alembic 版本核验。

生产启动只允许读取数据库迁移状态，不在应用进程内执行升级或 ALTER TABLE。
部署流程应先执行 ``python -m alembic upgrade head``，再启动 FastAPI。
"""

from pathlib import Path

from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy import Engine, inspect


BACKEND_ROOT = Path(__file__).resolve().parents[1]
ALEMBIC_CONFIG_PATH = BACKEND_ROOT / "alembic.ini"


class DatabaseMigrationError(RuntimeError):
    """数据库未升级到应用要求版本时抛出的启动错误。"""


def _alembic_config() -> Config:
    """使用绝对脚本路径，避免从项目根目录启动时找不到 revisions。"""
    config = Config(str(ALEMBIC_CONFIG_PATH))
    config.set_main_option("script_location", str(BACKEND_ROOT / "alembic").replace("%", "%%"))
    return config


def get_alembic_heads() -> tuple[str, ...]:
    """读取代码仓库中的迁移 head，不访问数据库。"""
    return tuple(ScriptDirectory.from_config(_alembic_config()).get_heads())


def ensure_database_is_current(engine: Engine) -> None:
    """确认数据库存在且已升级到代码仓库的全部 head。

    该函数只执行 ``SELECT`` 和 Alembic 版本读取，不会创建版本表、写入版本号或修改业务表。
    """
    expected_heads = set(get_alembic_heads())
    if not expected_heads:
        raise DatabaseMigrationError("代码仓库没有可用的 Alembic head，无法校验数据库版本")

    with engine.connect() as connection:
        if "alembic_version" not in inspect(connection).get_table_names():
            raise DatabaseMigrationError(
                "数据库缺少 alembic_version，启动已拒绝；请先执行：python -m alembic upgrade head",
            )

        current_heads = set(MigrationContext.configure(connection).get_current_heads())

    if not current_heads:
        raise DatabaseMigrationError(
            "数据库 alembic_version 没有版本记录，启动已拒绝；请先执行：python -m alembic upgrade head",
        )
    if current_heads != expected_heads:
        current_label = ", ".join(sorted(current_heads)) or "无"
        expected_label = ", ".join(sorted(expected_heads))
        raise DatabaseMigrationError(
            f"数据库迁移版本落后或不兼容：当前为 [{current_label}]，代码要求 [{expected_label}]；"
            "请先执行：python -m alembic upgrade head",
        )
