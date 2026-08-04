from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import Column, Integer, MetaData, Table, create_engine, insert, select
from sqlalchemy.exc import StatementError

from app.time_utils import UTCDateTime


def test_utc_datetime_round_trip_uses_aware_utc_values():
    metadata = MetaData()
    timestamps = Table(
        "timestamps",
        metadata,
        Column("id", Integer, primary_key=True),
        Column("value", UTCDateTime(), nullable=False),
    )
    engine = create_engine("sqlite+pysqlite:///:memory:", future=True)
    metadata.create_all(engine)

    source = datetime(2026, 8, 4, 18, 20, 30, tzinfo=timezone(timedelta(hours=8)))
    with engine.begin() as connection:
        connection.execute(insert(timestamps).values(id=1, value=source))
        saved = connection.scalar(select(timestamps.c.value))

    assert saved == datetime(2026, 8, 4, 10, 20, 30, tzinfo=timezone.utc)
    assert saved.tzinfo == timezone.utc


def test_utc_datetime_rejects_naive_values():
    metadata = MetaData()
    timestamps = Table(
        "timestamps",
        metadata,
        Column("id", Integer, primary_key=True),
        Column("value", UTCDateTime(), nullable=False),
    )
    engine = create_engine("sqlite+pysqlite:///:memory:", future=True)
    metadata.create_all(engine)

    with pytest.raises(StatementError) as error:
        with engine.begin() as connection:
            connection.execute(
                insert(timestamps).values(id=1, value=datetime(2026, 8, 4, 10, 20, 30)),
            )
    assert isinstance(error.value.orig, ValueError)
    assert "必须包含明确的时区" in str(error.value.orig)
