from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

from app.config import get_settings
from app.database import Base
from app import models  # noqa: F401 让所有 ORM 表注册到 metadata


config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)


def configured_database_url() -> str:
    """优先使用 Alembic 测试/命令行注入的 URL，否则读取应用配置。"""
    configured_url = config.get_main_option("sqlalchemy.url")
    if configured_url:
        return configured_url

    # ConfigParser 使用 % 作为插值符，密码中出现 % 时必须转义。
    return get_settings().database_url.replace("%", "%%")


target_metadata = Base.metadata


def include_object(object_, name, type_, reflected, compare_to):
    """不把历史表和 Alembic 自身的版本表纳入自动生成差异。"""
    if type_ == "table" and name in {"dataset_tasks", "schema_migrations", "alembic_version"}:
        return False
    return True


def run_migrations_offline() -> None:
    context.configure(
        url=configured_database_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
        compare_server_default=True,
        include_object=include_object,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    configuration = config.get_section(config.config_ini_section, {})
    configuration["sqlalchemy.url"] = configured_database_url()
    connectable = engine_from_config(
        configuration,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
            compare_server_default=True,
            include_object=include_object,
            render_as_batch=connection.dialect.name == "sqlite",
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
