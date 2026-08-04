import io
import re
from datetime import datetime
from pathlib import Path

import numpy as np
import scipy.io as sio
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.config import get_settings
from app.database import Base, get_session, make_engine, make_session_factory
from app.models import AnalysisTask, Dataset, TaskResult, User
from main import app


def _mat_file_payload(values: dict) -> bytes:
    buffer = io.BytesIO()
    sio.savemat(buffer, values)
    return buffer.getvalue()


def _make_test_context():
    engine = make_engine("sqlite+pysqlite:///:memory:")
    testing_session_local = make_session_factory(engine)
    Base.metadata.create_all(bind=engine)

    def override_get_session():
        with testing_session_local() as session:
            yield session

    app.dependency_overrides[get_session] = override_get_session
    return TestClient(app), testing_session_local


def _make_test_client():
    client, _testing_session_local = _make_test_context()
    return client


def _register_and_headers(client: TestClient) -> dict[str, str]:
    response = client.post(
        "/api/auth/register",
        json={
            "username": "alice",
            "password": "secret123",
            "confirm_password": "secret123",
        },
    )
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def _upload_dataset(client: TestClient, headers: dict[str, str], filename: str, payload: bytes) -> dict:
    response = client.post(
        "/api/datasets",
        headers=headers,
        files={"file": (filename, payload, "application/octet-stream")},
    )
    assert response.status_code == 200
    return response.json()


def test_parse_mat_dataset_uses_uploaded_matrix_and_labels():
    client = TestClient(app)
    payload = _mat_file_payload(
        {
            "E": np.array(
                [
                    [1, 1, 2],
                    [1, 2, 2],
                    [2, 2, 3],
                    [2, 3, 3],
                ],
            ),
            "y": np.array([[1], [1], [2], [3]]),
        },
    )

    response = client.post(
        "/api/datasets/parse",
        files={"file": ("real_upload.mat", payload, "application/octet-stream")},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["sampleCount"] == 4
    assert body["baseCount"] == 3
    assert body["hasLabels"] is True
    assert body["classCount"] == 3
    assert body["labelDistribution"] == [
        {"label": "1", "count": 2, "percent": 50},
        {"label": "2", "count": 1, "percent": 25},
        {"label": "3", "count": 1, "percent": 25},
    ]
    assert body["clusterStats"][:3] == [
        {"name": "base_1", "clusterCount": 2, "range": "1 - 2"},
        {"name": "base_2", "clusterCount": 3, "range": "1 - 3"},
        {"name": "base_3", "clusterCount": 2, "range": "2 - 3"},
    ]


def test_parse_mat_dataset_without_labels_returns_empty_label_summary():
    client = TestClient(app)
    payload = _mat_file_payload({"E": np.array([[1, 2], [2, 3], [3, 3]])})

    response = client.post(
        "/api/datasets/parse",
        files={"file": ("unlabeled_upload.mat", payload, "application/octet-stream")},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["hasLabels"] is False
    assert body["classCount"] == 0
    assert body["labelDistribution"] == []


def test_upload_dataset_persists_file_and_list_returns_saved_record(tmp_path, monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "dataset_storage_dir", tmp_path)
    client = _make_test_client()
    headers = _register_and_headers(client)
    payload = _mat_file_payload(
        {
            "E": np.array([[1, 1], [1, 2], [2, 2]]),
            "y": np.array([[0], [1], [1]]),
        },
    )

    upload_response = client.post(
        "/api/datasets",
        headers=headers,
        files={"file": ("persisted_upload.mat", payload, "application/octet-stream")},
    )

    assert upload_response.status_code == 200
    uploaded = upload_response.json()
    assert uploaded["id"] == 1
    assert uploaded["name"] == "persisted_upload"
    assert uploaded["sampleCount"] == 3
    assert uploaded["baseCount"] == 2
    assert uploaded["classCount"] == 2
    assert uploaded["hasLabels"] is True
    assert uploaded["fileSizeBytes"] == len(payload)
    assert re.match(r"\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}", uploaded["createdAt"])
    assert len(list(tmp_path.rglob("*.mat"))) == 1

    list_response = client.get("/api/datasets", headers=headers)

    assert list_response.status_code == 200
    catalog = list_response.json()
    assert catalog["total"] == 1
    assert catalog["page"] == 1
    assert catalog["pageSize"] == 20
    assert catalog["totalPages"] == 1
    assert len(catalog["items"]) == 1
    listed = catalog["items"][0]
    assert listed["id"] == uploaded["id"]
    assert listed["name"] == "persisted_upload"
    assert listed["fileSizeBytes"] == len(payload)
    assert re.match(r"\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}", listed["createdAt"])
    assert listed["sampleCount"] == 3
    assert listed["baseCount"] == 2
    assert listed["clusterStats"] == [
        {"name": "base_1", "clusterCount": 2, "range": "1 - 2"},
        {"name": "base_2", "clusterCount": 2, "range": "1 - 2"},
    ]


def test_update_dataset_replaces_file_and_metadata(tmp_path, monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "dataset_storage_dir", tmp_path)
    client = _make_test_client()
    headers = _register_and_headers(client)
    first_payload = _mat_file_payload(
        {
            "E": np.array([[1, 1], [1, 2], [2, 2]]),
            "y": np.array([[0], [1], [1]]),
        },
    )
    updated_payload = _mat_file_payload(
        {
            "E": np.array(
                [
                    [1, 2, 3],
                    [2, 2, 3],
                    [3, 3, 4],
                    [4, 4, 4],
                ],
            ),
        },
    )

    upload_response = client.post(
        "/api/datasets",
        headers=headers,
        files={"file": ("first_upload.mat", first_payload, "application/octet-stream")},
    )
    assert upload_response.status_code == 200
    dataset_id = upload_response.json()["id"]
    old_files = list(tmp_path.rglob("*.mat"))
    assert len(old_files) == 1

    update_response = client.put(
        f"/api/datasets/{dataset_id}",
        headers=headers,
        files={"file": ("replacement_upload.mat", updated_payload, "application/octet-stream")},
    )

    assert update_response.status_code == 200
    updated = update_response.json()
    assert updated["id"] == dataset_id
    assert updated["name"] == "replacement_upload"
    assert updated["sampleCount"] == 4
    assert updated["baseCount"] == 3
    assert updated["classCount"] == 0
    assert updated["hasLabels"] is False
    assert updated["fileSizeBytes"] == len(updated_payload)
    assert re.match(r"\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}", updated["createdAt"])

    saved_files = list(tmp_path.rglob("*.mat"))
    assert len(saved_files) == 2
    assert old_files[0] in saved_files
    assert any(path != old_files[0] for path in saved_files)

    versions_response = client.get(f"/api/datasets/{dataset_id}/versions", headers=headers)
    assert versions_response.status_code == 200
    versions = versions_response.json()
    assert [version["action"] for version in versions] == ["replaced", "uploaded"]
    assert [version["version"] for version in versions] == [2, 1]

    list_response = client.get("/api/datasets", headers=headers)

    assert list_response.status_code == 200
    catalog = list_response.json()
    assert catalog["total"] == 1
    assert len(catalog["items"]) == 1
    listed = catalog["items"][0]
    assert listed["id"] == dataset_id
    assert listed["name"] == "replacement_upload"
    assert listed["sampleCount"] == 4
    assert listed["baseCount"] == 3
    assert listed["hasLabels"] is False


def test_append_dataset_adds_samples_and_keeps_identity(tmp_path, monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "dataset_storage_dir", tmp_path)
    client = _make_test_client()
    headers = _register_and_headers(client)
    first_payload = _mat_file_payload(
        {
            "E": np.array([[1, 1], [1, 2]]),
            "y": np.array([[0], [1]]),
        },
    )
    appended_payload = _mat_file_payload(
        {
            "E": np.array([[2, 2], [2, 3], [3, 3]]),
            "y": np.array([[1], [2], [2]]),
        },
    )

    uploaded = _upload_dataset(client, headers, "first_upload.mat", first_payload)
    dataset_id = uploaded["id"]
    old_files = list(tmp_path.rglob("*.mat"))
    assert len(old_files) == 1

    append_response = client.post(
        f"/api/datasets/{dataset_id}/append",
        headers=headers,
        files={"file": ("new_samples.mat", appended_payload, "application/octet-stream")},
    )

    assert append_response.status_code == 200
    appended = append_response.json()
    assert appended["id"] == dataset_id
    assert appended["name"] == "first_upload"
    assert appended["sampleCount"] == 5
    assert appended["baseCount"] == 2
    assert appended["classCount"] == 3
    assert appended["hasLabels"] is True
    assert appended["version"] == 2

    saved_files = list(tmp_path.rglob("*.mat"))
    assert len(saved_files) == 2
    appended_files = [path for path in saved_files if path not in old_files]
    assert len(appended_files) == 1
    merged_mat = sio.loadmat(appended_files[0])
    assert merged_mat["E"].shape == (5, 2)
    assert merged_mat["E"].tolist() == [[1, 1], [1, 2], [2, 2], [2, 3], [3, 3]]
    assert merged_mat["y"].reshape(-1).tolist() == [0, 1, 1, 2, 2]

    versions_response = client.get(f"/api/datasets/{dataset_id}/versions", headers=headers)
    assert versions_response.status_code == 200
    versions = versions_response.json()
    assert [version["action"] for version in versions] == ["appended", "uploaded"]
    assert [version["version"] for version in versions] == [2, 1]


def test_append_dataset_rejects_incompatible_base_count(tmp_path, monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "dataset_storage_dir", tmp_path)
    client = _make_test_client()
    headers = _register_and_headers(client)
    uploaded = _upload_dataset(
        client,
        headers,
        "base_dataset.mat",
        _mat_file_payload({"E": np.array([[1, 1], [1, 2]])}),
    )
    mismatched_payload = _mat_file_payload({"E": np.array([[1, 2, 3]])})

    response = client.post(
        f"/api/datasets/{uploaded['id']}/append",
        headers=headers,
        files={"file": ("mismatched.mat", mismatched_payload, "application/octet-stream")},
    )

    assert response.status_code == 400
    assert "列数必须与当前数据集一致" in response.json()["detail"]


def test_append_dataset_rejects_label_state_mismatch(tmp_path, monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "dataset_storage_dir", tmp_path)
    client = _make_test_client()
    headers = _register_and_headers(client)
    uploaded = _upload_dataset(
        client,
        headers,
        "labeled_dataset.mat",
        _mat_file_payload({"E": np.array([[1, 1], [1, 2]]), "y": np.array([[0], [1]])}),
    )
    unlabeled_payload = _mat_file_payload({"E": np.array([[2, 2], [2, 3]])})

    response = client.post(
        f"/api/datasets/{uploaded['id']}/append",
        headers=headers,
        files={"file": ("unlabeled.mat", unlabeled_payload, "application/octet-stream")},
    )

    assert response.status_code == 400
    assert "标签状态必须与当前数据集一致" in response.json()["detail"]


def test_append_dataset_rejects_label_count_mismatch(tmp_path, monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "dataset_storage_dir", tmp_path)
    client = _make_test_client()
    headers = _register_and_headers(client)
    uploaded = _upload_dataset(
        client,
        headers,
        "labeled_dataset.mat",
        _mat_file_payload({"E": np.array([[1, 1], [1, 2]]), "y": np.array([[0], [1]])}),
    )
    bad_label_payload = _mat_file_payload({"E": np.array([[2, 2], [2, 3]]), "y": np.array([[2]])})

    response = client.post(
        f"/api/datasets/{uploaded['id']}/append",
        headers=headers,
        files={"file": ("bad_label.mat", bad_label_payload, "application/octet-stream")},
    )

    assert response.status_code == 400
    assert "标签数量与样本数量不一致" in response.json()["detail"]


def test_dataset_list_requires_login():
    client = _make_test_client()

    response = client.get("/api/datasets")

    assert response.status_code == 401


def test_dataset_usage_uses_all_analysis_tasks_and_latest_success(tmp_path, monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "dataset_storage_dir", tmp_path)
    client, testing_session_local = _make_test_context()
    headers = _register_and_headers(client)
    payload = _mat_file_payload(
        {
            "E": np.array([[1, 1], [1, 2], [2, 2]]),
            "y": np.array([[0], [1], [1]]),
        },
    )
    completed_dataset = _upload_dataset(client, headers, "completed.mat", payload)
    draft_dataset = _upload_dataset(client, headers, "draft_only.mat", payload)
    unused_dataset = _upload_dataset(client, headers, "unused.mat", payload)

    first_finished_at = datetime(2026, 8, 1, 10, 0, 0)
    latest_finished_at = datetime(2026, 8, 3, 15, 30, 0)
    failed_finished_at = datetime(2026, 8, 4, 9, 0, 0)
    with testing_session_local() as session:
        user_id = session.scalar(select(User.id).where(User.username == "alice"))
        tasks = [
            AnalysisTask(
                user_id=user_id,
                dataset_id=completed_dataset["id"],
                name="草稿任务",
                mode="OMELET-SV",
                status="draft",
                params_json="{}",
            ),
            AnalysisTask(
                user_id=user_id,
                dataset_id=completed_dataset["id"],
                name="失败任务",
                mode="OMELET-SV",
                status="failed",
                params_json="{}",
                finished_at=failed_finished_at,
            ),
            AnalysisTask(
                user_id=user_id,
                dataset_id=completed_dataset["id"],
                name="第一次成功",
                mode="OMELET-SV",
                status="succeeded",
                params_json="{}",
                finished_at=first_finished_at,
            ),
            AnalysisTask(
                user_id=user_id,
                dataset_id=completed_dataset["id"],
                name="最近成功",
                mode="OMELET-SV",
                status="succeeded",
                params_json="{}",
                finished_at=latest_finished_at,
            ),
            AnalysisTask(
                user_id=user_id,
                dataset_id=draft_dataset["id"],
                name="仅有草稿",
                mode="OMELET-SV",
                status="draft",
                params_json="{}",
            ),
        ]
        session.add_all(tasks)
        session.commit()

    response = client.get("/api/datasets?pageSize=100", headers=headers)
    assert response.status_code == 200
    items = {item["id"]: item for item in response.json()["items"]}
    assert items[completed_dataset["id"]]["taskCount"] == 4
    assert items[completed_dataset["id"]]["lastAnalysisAt"] == "2026-08-03 15:30:00"
    assert items[draft_dataset["id"]]["taskCount"] == 1
    assert items[draft_dataset["id"]]["lastAnalysisAt"] is None
    assert items[unused_dataset["id"]]["taskCount"] == 0
    assert items[unused_dataset["id"]]["lastAnalysisAt"] is None

    used_response = client.get("/api/datasets?usage=used&pageSize=100", headers=headers)
    assert used_response.status_code == 200
    assert {item["id"] for item in used_response.json()["items"]} == {
        completed_dataset["id"],
        draft_dataset["id"],
    }

    unused_response = client.get("/api/datasets?usage=unused&pageSize=100", headers=headers)
    assert unused_response.status_code == 200
    assert [item["id"] for item in unused_response.json()["items"]] == [unused_dataset["id"]]

    sorted_response = client.get(
        "/api/datasets?sortBy=taskCount&sortOrder=desc&pageSize=100",
        headers=headers,
    )
    assert sorted_response.status_code == 200
    assert [item["taskCount"] for item in sorted_response.json()["items"]] == [4, 1, 0]


def test_dataset_delete_is_blocked_by_analysis_tasks(tmp_path, monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "dataset_storage_dir", tmp_path)
    client, testing_session_local = _make_test_context()
    headers = _register_and_headers(client)
    payload = _mat_file_payload(
        {
            "E": np.array([[1, 1], [1, 2], [2, 2]]),
            "y": np.array([[0], [1], [1]]),
        },
    )
    used_dataset = _upload_dataset(client, headers, "used.mat", payload)
    draft_dataset = _upload_dataset(client, headers, "draft.mat", payload)
    unused_dataset = _upload_dataset(client, headers, "deletable.mat", payload)

    with testing_session_local() as session:
        user_id = session.scalar(select(User.id).where(User.username == "alice"))
        succeeded_task = AnalysisTask(
            user_id=user_id,
            dataset_id=used_dataset["id"],
            name="有结果的任务",
            mode="OMELET-SV",
            status="succeeded",
            params_json="{}",
            finished_at=datetime(2026, 8, 4, 10, 0, 0),
        )
        draft_task = AnalysisTask(
            user_id=user_id,
            dataset_id=draft_dataset["id"],
            name="关联草稿",
            mode="OMELET-SV",
            status="draft",
            params_json="{}",
        )
        session.add_all([succeeded_task, draft_task])
        session.flush()
        session.add(TaskResult(task_id=succeeded_task.id, metrics_json="{}"))
        session.commit()

        used_storage_path = Path(session.get(Dataset, used_dataset["id"]).storage_path)
        draft_storage_path = Path(session.get(Dataset, draft_dataset["id"]).storage_path)
        unused_storage_path = Path(session.get(Dataset, unused_dataset["id"]).storage_path)

    delete_response = client.delete(f"/api/datasets/{used_dataset['id']}", headers=headers)
    assert delete_response.status_code == 409
    assert delete_response.json()["detail"] == (
        "数据集仍被 1 个分析任务引用，请先删除关联任务后再删除数据集"
    )

    bulk_response = client.post(
        "/api/datasets/bulk-delete",
        headers=headers,
        json={"datasetIds": [draft_dataset["id"], unused_dataset["id"]]},
    )
    assert bulk_response.status_code == 409
    assert bulk_response.json()["detail"] == (
        "数据集仍被 1 个分析任务引用，请先删除关联任务后再删除数据集"
    )

    with testing_session_local() as session:
        assert session.get(Dataset, used_dataset["id"]) is not None
        assert session.get(Dataset, draft_dataset["id"]) is not None
        assert session.get(Dataset, unused_dataset["id"]) is not None
        assert session.scalar(select(func.count(AnalysisTask.id))) == 2
        assert session.scalar(select(func.count(TaskResult.id))) == 1
    assert used_storage_path.exists()
    assert draft_storage_path.exists()
    assert unused_storage_path.exists()

    successful_delete = client.delete(f"/api/datasets/{unused_dataset['id']}", headers=headers)
    assert successful_delete.status_code == 200
    assert not unused_storage_path.exists()
