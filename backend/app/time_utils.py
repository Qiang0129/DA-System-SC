"""应用统一使用的 UTC 时间工具。

MySQL 的 DATETIME 本身不携带时区信息，因此这里在 ORM 边界明确约定：
数据库中的所有时间值都代表 UTC。写入时去掉时区标记，读取时重新附加
UTC，避免业务层出现一部分 aware、一部分 naive 的混合状态。
"""

from datetime import datetime, timezone

from sqlalchemy import DateTime
from sqlalchemy.types import TypeDecorator


UTC = timezone.utc


def utc_now() -> datetime:
    """返回当前带 UTC 时区的时间。"""
    return datetime.now(UTC)


def ensure_aware_utc(value: datetime) -> datetime:
    """校验并转换为 UTC aware datetime，拒绝没有时区语义的值。"""
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError("时间值必须包含明确的时区信息")
    return value.astimezone(UTC)


def format_utc_iso(value: datetime | None) -> str | None:
    """把时间序列化为 API 统一使用的 ISO 8601 UTC 格式。"""
    if value is None:
        return None
    return ensure_aware_utc(value).isoformat(timespec="seconds").replace("+00:00", "Z")


class UTCDateTime(TypeDecorator[datetime]):
    """将 Python aware UTC datetime 适配到无时区的数据库 DATETIME。"""

    impl = DateTime
    cache_ok = True

    def process_bind_param(self, value: datetime | None, dialect) -> datetime | None:
        if value is None:
            return None
        return ensure_aware_utc(value).replace(tzinfo=None)

    def process_result_value(self, value: datetime | None, dialect) -> datetime | None:
        if value is None:
            return None
        if value.tzinfo is None or value.utcoffset() is None:
            return value.replace(tzinfo=UTC)
        return value.astimezone(UTC)
