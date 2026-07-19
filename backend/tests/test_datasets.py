import io
import re

import numpy as np
import scipy.io as sio
from fastapi.testclient import TestClient

from app.config import get_settings
from app.database import Base, get_session, make_engine, make_session_factory
from main import app


def _mat_file_payload(values: dict) -> bytes:
    buffer = io.BytesIO()
    sio.savemat(buffer, values)
    return buffer.getvalue()


def _make_test_client():
    engine = make_engine("sqlite+pysqlite:///:memory:")
    testing_session_local = make_session_factory(engine)
    Base.metadata.create_all(bind=engine)

    def override_get_session():
        with testing_session_local() as session:
            yield session

    app.dependency_overrides[get_session] = override_get_session
    return TestClient(app)


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


def test_dataset_list_requires_login():
    client = _make_test_client()

    response = client.get("/api/datasets")

    assert response.status_code == 401
