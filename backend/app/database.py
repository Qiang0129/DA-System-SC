from collections.abc import Generator

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from sqlalchemy.pool import StaticPool

from .config import get_settings


class Base(DeclarativeBase):
    pass


def make_engine(database_url: str | None = None):
    settings = get_settings()
    url = database_url or settings.database_url
    kwargs = {"future": True, "echo": settings.db_echo_sql}

    if url.startswith("sqlite"):
        kwargs.update(
            {
                "connect_args": {"check_same_thread": False},
                "poolclass": StaticPool,
            },
        )
    else:
        kwargs.update(
            {
                "pool_pre_ping": True,
                "pool_size": settings.db_pool_size,
                "max_overflow": settings.db_max_overflow,
                "pool_recycle": settings.db_pool_recycle,
            },
        )

    created_engine = create_engine(url, **kwargs)

    if created_engine.dialect.name == "mysql":
        @event.listens_for(created_engine, "connect")
        def _set_mysql_utc(dbapi_connection, connection_record) -> None:
            """让数据库默认时间函数和直接 SQL 写入都使用 UTC。"""
            cursor = dbapi_connection.cursor()
            try:
                cursor.execute("SET time_zone = '+00:00'")
            finally:
                cursor.close()

    return created_engine


def make_session_factory(engine):
    return sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


engine = make_engine()
SessionLocal = make_session_factory(engine)


def get_session() -> Generator[Session, None, None]:
    with SessionLocal() as session:
        yield session
