from app.database import Base
from app.models import AnalysisTask


def test_analysis_task_is_the_only_runtime_dataset_task_model():
    assert "dataset_tasks" not in Base.metadata.tables
    assert AnalysisTask.__tablename__ == "analysis_tasks"


def test_analysis_task_dataset_reference_is_restricted_and_indexed():
    table = AnalysisTask.__table__
    dataset_foreign_key = next(
        foreign_key
        for foreign_key in table.c.dataset_id.foreign_keys
        if foreign_key.target_fullname == "datasets.id"
    )
    assert dataset_foreign_key.ondelete == "RESTRICT"

    indexes = {index.name: tuple(column.name for column in index.columns) for index in table.indexes}
    assert indexes["idx_analysis_tasks_user_dataset"] == ("user_id", "dataset_id")
    assert indexes["idx_analysis_tasks_dataset_status_finished"] == (
        "dataset_id",
        "status",
        "finished_at",
    )
