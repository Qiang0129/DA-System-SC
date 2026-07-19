import io
import json
import zipfile

import numpy as np
import scipy.io as sio
from fastapi.testclient import TestClient

from app.config import get_settings
from app.database import Base, get_session, make_engine, make_session_factory
from app.models import AnalysisTask, Dataset, TaskResult, User
from main import app


def _mat_file_payload(values: dict) -> bytes:
    buffer = io.BytesIO()
    sio.savemat(buffer, values)
    return buffer.getvalue()


def _make_test_client(tmp_path, monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "dataset_storage_dir", tmp_path)
    engine = make_engine("sqlite+pysqlite:///:memory:")
    testing_session_local = make_session_factory(engine)
    Base.metadata.create_all(bind=engine)

    def override_get_session():
        with testing_session_local() as session:
            yield session

    app.dependency_overrides[get_session] = override_get_session
    return TestClient(app)


def _register_and_headers(client: TestClient, username: str = "alice") -> dict[str, str]:
    response = client.post(
        "/api/auth/register",
        json={
            "username": username,
            "password": "secret123",
            "confirm_password": "secret123",
        },
    )
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def _upload_dataset(client: TestClient, headers: dict[str, str]) -> dict:
    payload = _mat_file_payload(
        {
            "E": np.array([[1, 1, 2], [1, 2, 2], [2, 2, 3], [2, 3, 3]]),
            "y": np.array([[1], [1], [2], [3]]),
        },
    )
    response = client.post(
        "/api/datasets",
        headers=headers,
        files={"file": ("task_dataset.mat", payload, "application/octet-stream")},
    )
    assert response.status_code == 200
    return response.json()


def test_create_list_start_and_get_task(tmp_path, monkeypatch):
    client = _make_test_client(tmp_path, monkeypatch)
    headers = _register_and_headers(client)
    dataset = _upload_dataset(client, headers)

    create_response = client.post(
        "/api/tasks",
        headers=headers,
        json={
            "datasetId": dataset["id"],
            "name": "demo task",
            "mode": "OMELET-SV",
            "params": {
                "nBase": 2,
                "sigma": 1,
                "lambda": 5,
                "gamma": 5,
                "anchor": 8,
                "runs": 3,
                "maxIter": 5,
            },
            "startImmediately": False,
        },
    )
    assert create_response.status_code == 200
    task = create_response.json()
    assert task["status"] == "draft"
    assert task["datasetName"] == dataset["name"]
    assert task["params"]["nBase"] == 2
    assert task["params"]["lambda"] == 5

    list_response = client.get("/api/tasks", headers=headers)
    assert list_response.status_code == 200
    body = list_response.json()
    assert body["total"] == 1
    assert body["items"][0]["id"] == task["id"]

    start_response = client.post(f"/api/tasks/{task['id']}/start", headers=headers)
    assert start_response.status_code == 200
    started = start_response.json()
    assert started["status"] == "queued"
    assert started["currentStage"] is not None

    detail_response = client.get(f"/api/tasks/{task['id']}", headers=headers)
    assert detail_response.status_code == 200
    assert detail_response.json()["id"] == task["id"]

    stats_response = client.get("/api/tasks/stats", headers=headers)
    assert stats_response.status_code == 200
    stats = stats_response.json()
    assert stats["total"] == 1
    assert stats["queued"] + stats["running"] + stats["succeeded"] + stats["failed"] >= 1


def test_export_archive_persists_metadata_and_manifest(tmp_path, monkeypatch):
    client = _make_test_client(tmp_path, monkeypatch)
    headers = _register_and_headers(client, "export-user")
    dataset = _upload_dataset(client, headers)
    create_response = client.post(
        "/api/tasks",
        headers=headers,
        json={
            "datasetId": dataset["id"],
            "name": "archive task",
            "mode": "OMELET-SV",
            "params": {"nBase": 2, "runs": 1, "maxIter": 2},
            "startImmediately": False,
        },
    )
    task_id = create_response.json()["id"]

    result_dir = tmp_path / "results" / str(task_id)
    result_dir.mkdir(parents=True)
    labels_path = result_dir / "labels.npz"
    labels_path.write_bytes(b"labels")
    (result_dir / "labels.csv").write_text("sample,label\n1,1\n", encoding="utf-8")

    session_override = app.dependency_overrides[get_session]
    session_generator = session_override()
    session = next(session_generator)
    try:
        task = session.get(AnalysisTask, task_id)
        task.status = "succeeded"
        session.add(
            TaskResult(
                schema_version=1,
                task_id=task_id,
                metrics_json=json.dumps({"aggregate": {"acc": {"mean": 0.8, "std": 0.01, "min": 0.8, "max": 0.8}}}),
                kernel_weights_json="{}",
                convergence_json="{}",
                preview_json=json.dumps({"schemaVersion": 1}),
                labels_path=str(labels_path),
                runtime_seconds=1.2,
            ),
        )
        session.commit()
    finally:
        session_generator.close()

    monkeypatch.setattr(get_settings(), "result_storage_dir", tmp_path)
    response = client.post(
        f"/api/tasks/{task_id}/exports",
        headers=headers,
        json={"name": "论文复现实验交付包", "items": ["metrics", "parameters", "labels"]},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "论文复现实验交付包"
    assert body["items"] == ["metrics", "parameters", "labels"]
    assert body["itemCount"] == 3
    assert body["status"] == "ready"

    export_path = result_dir / "exports" / body["filename"]
    with zipfile.ZipFile(export_path) as archive:
        assert "manifest.json" in archive.namelist()
        manifest = json.loads(archive.read("manifest.json"))
        assert manifest["archiveName"] == "论文复现实验交付包"
        assert manifest["items"] == ["metrics", "parameters", "labels"]

    listed = client.get(f"/api/tasks/{task_id}/exports", headers=headers).json()["items"]
    assert listed[0]["name"] == "论文复现实验交付包"
    assert listed[0]["itemCount"] == 3


def test_progress_event_advances_run_and_resets_iteration(monkeypatch):
    from app import task_executor as task_executor_module

    engine = make_engine("sqlite+pysqlite:///:memory:")
    testing_session_local = make_session_factory(engine)
    Base.metadata.create_all(bind=engine)
    monkeypatch.setattr(task_executor_module, "SessionLocal", testing_session_local)

    with testing_session_local() as session:
        user = User(username="progress-user", password_hash="unused")
        session.add(user)
        session.flush()
        dataset = Dataset(
            user_id=user.id,
            name="progress-data",
            original_filename="progress.mat",
            storage_path="progress.mat",
            file_hash="progress-hash",
            sample_count=4,
            base_cluster_count=3,
            has_ground_truth=True,
            cluster_count=2,
            status="ready",
        )
        session.add(dataset)
        session.flush()
        task = AnalysisTask(
            user_id=user.id,
            dataset_id=dataset.id,
            name="progress-task",
            status="running",
            current_run=1,
            current_iter=10,
            max_iter=10,
            params_json='{"runs": 10}',
        )
        session.add(task)
        session.commit()
        task_id = task.id

    manager = task_executor_module.TaskExecutionManager()
    manager._persist_progress(task_id, {"type": "stage", "stage": "build_ca", "run": 2, "progress": 30})

    with testing_session_local() as session:
        updated = session.get(AnalysisTask, task_id)
        assert updated is not None
        assert updated.current_run == 2
        assert updated.current_iter == 0

    manager._persist_progress(
        task_id,
        {"type": "iteration", "stage": "multi_kernel", "run": 2, "iteration": 3, "progress": 35},
    )

    with testing_session_local() as session:
        updated = session.get(AnalysisTask, task_id)
        assert updated is not None
        assert updated.current_run == 2
        assert updated.current_iter == 3


def test_task_permission_and_quality_gate(tmp_path, monkeypatch):
    client = _make_test_client(tmp_path, monkeypatch)
    alice = _register_and_headers(client, "alice2")
    bob = _register_and_headers(client, "bob2")
    dataset = _upload_dataset(client, alice)

    create_response = client.post(
        "/api/tasks",
        headers=alice,
        json={"datasetId": dataset["id"], "name": "private task", "mode": "OMELET"},
    )
    assert create_response.status_code == 200
    task_id = create_response.json()["id"]

    forbidden = client.get(f"/api/tasks/{task_id}", headers=bob)
    assert forbidden.status_code == 404

    # n_base ???????????
    overflow = client.post(
        "/api/tasks",
        headers=alice,
        json={
            "datasetId": dataset["id"],
            "mode": "OMELET",
            "params": {"nBase": 999, "maxIter": 5},
        },
    )
    assert overflow.status_code == 422


def test_clone_retry_cancel_delete_and_template(tmp_path, monkeypatch):
    client = _make_test_client(tmp_path, monkeypatch)
    headers = _register_and_headers(client, "carol")
    dataset = _upload_dataset(client, headers)

    create_response = client.post(
        "/api/tasks",
        headers=headers,
        json={
            "datasetId": dataset["id"],
            "name": "flow task",
            "mode": "OMELET",
            "params": {"nBase": 2, "maxIter": 4},
        },
    )
    task_id = create_response.json()["id"]

    clone_response = client.post(f"/api/tasks/{task_id}/clone", headers=headers)
    assert clone_response.status_code == 200
    assert clone_response.json()["status"] == "draft"

    start_response = client.post(f"/api/tasks/{task_id}/start", headers=headers)
    assert start_response.status_code == 200
    assert start_response.json()["status"] == "queued"

    cancel_response = client.post(f"/api/tasks/{task_id}/cancel", headers=headers)
    assert cancel_response.status_code == 200
    assert cancel_response.json()["status"] == "cancelled"

    retry_response = client.post(f"/api/tasks/{task_id}/retry", headers=headers)
    assert retry_response.status_code == 200
    assert retry_response.json()["status"] == "queued"

    # ??????
    client.post(f"/api/tasks/{task_id}/cancel", headers=headers)
    delete_response = client.delete(f"/api/tasks/{task_id}", headers=headers)
    assert delete_response.status_code == 200

    template_response = client.post(
        "/api/tasks/templates",
        headers=headers,
        json={
            "name": "default sv",
            "mode": "OMELET-SV",
            "params": {"nBase": 2, "anchor": 6, "maxIter": 6},
        },
    )
    assert template_response.status_code == 200
    template_id = template_response.json()["id"]

    list_templates = client.get("/api/tasks/templates", headers=headers)
    assert list_templates.status_code == 200
    assert list_templates.json()["items"][0]["id"] == template_id

    from_template = client.post(
        "/api/tasks",
        headers=headers,
        json={"datasetId": dataset["id"], "templateId": template_id},
    )
    assert from_template.status_code == 200
    assert from_template.json()["mode"] == "OMELET-SV"
    assert from_template.json()["params"]["anchor"] == 6
