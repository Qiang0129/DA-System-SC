#!/usr/bin/env python3
"""通过内部 Web 入口执行一次可清理的生产冒烟测试。"""

from __future__ import annotations

import io
import json
import os
import secrets
import sys
import time
import urllib.error
import urllib.request
import uuid

import numpy as np
import scipy.io as sio


BASE_URL = os.environ.get("SMOKE_BASE_URL", "http://web").rstrip("/")
USERNAME = os.environ.get("SMOKE_USERNAME", f"smoke-{uuid.uuid4().hex[:12]}")
PASSWORD = os.environ.get("SMOKE_PASSWORD", secrets.token_urlsafe(24))
EMAIL = f"{USERNAME}@example.invalid"


def request_json(path: str, *, method: str = "GET", token: str | None = None, body=None):
    headers = {"Accept": "application/json"}
    payload = None
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if body is not None:
        headers["Content-Type"] = "application/json"
        payload = json.dumps(body).encode("utf-8")
    request = urllib.request.Request(f"{BASE_URL}{path}", data=payload, method=method, headers=headers)
    with urllib.request.urlopen(request, timeout=30) as response:
        content = response.read()
        return response.status, json.loads(content) if content else None


def upload_dataset(token: str, mat_payload: bytes):
    boundary = f"----da-smoke-{uuid.uuid4().hex}"
    body = b"".join(
        [
            f"--{boundary}\r\n".encode(),
            b'Content-Disposition: form-data; name="file"; filename="smoke.mat"\r\n',
            b"Content-Type: application/octet-stream\r\n\r\n",
            mat_payload,
            f"\r\n--{boundary}--\r\n".encode(),
        ],
    )
    request = urllib.request.Request(
        f"{BASE_URL}/api/datasets",
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": f"multipart/form-data; boundary={boundary}",
        },
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        return response.status, json.loads(response.read())


def main() -> int:
    token = None
    dataset_id = None
    task_id = None
    try:
        status, registration = request_json(
            "/api/auth/register",
            method="POST",
            body={
                "username": USERNAME,
                "email": EMAIL,
                "password": PASSWORD,
                "confirm_password": PASSWORD,
                "email_code": None,
            },
        )
        assert status == 200
        token = registration["access_token"]
        print("注册：通过")

        buffer = io.BytesIO()
        sio.savemat(
            buffer,
            {
                "E": np.array([[1, 1, 2], [1, 2, 2], [2, 2, 3], [2, 3, 3]]),
                "y": np.array([[1], [1], [2], [3]]),
            },
        )
        status, dataset = upload_dataset(token, buffer.getvalue())
        assert status == 200
        dataset_id = int(dataset["id"])
        print("MAT 上传与解析：通过")

        status, task = request_json(
            "/api/tasks",
            method="POST",
            token=token,
            body={
                "datasetId": dataset_id,
                "name": "自动冒烟任务",
                "mode": "OMELET-SV",
                "params": {
                    "nBase": 2,
                    "sigma": 1,
                    "lambda": 2,
                    "gamma": 2,
                    "anchor": 3,
                    "runs": 1,
                    "maxIter": 2,
                },
                "startImmediately": True,
            },
        )
        assert status == 200
        task_id = int(task["id"])

        final_state = None
        for _ in range(120):
            _, detail = request_json(f"/api/tasks/{task_id}", token=token)
            final_state = detail["status"]
            if final_state in {"succeeded", "failed", "cancelled"}:
                break
            time.sleep(1)
        assert final_state == "succeeded", f"任务最终状态为 {final_state}"
        _, result = request_json(f"/api/tasks/{task_id}/result", token=token)
        assert result["state"] == "ready"
        print("OMELET-SV 任务与结果：通过")

        _, login = request_json(
            "/api/auth/login",
            method="POST",
            body={"username": USERNAME, "password": PASSWORD},
        )
        assert login["access_token"]
        print("登录：通过")
        return 0
    except (AssertionError, KeyError, urllib.error.HTTPError, urllib.error.URLError) as exc:
        print(f"冒烟测试失败：{exc}", file=sys.stderr)
        return 1
    finally:
        if token and task_id:
            try:
                request_json(f"/api/tasks/{task_id}", method="DELETE", token=token)
            except Exception:
                pass
        if token and dataset_id:
            try:
                request_json(f"/api/datasets/{dataset_id}", method="DELETE", token=token)
            except Exception:
                pass


if __name__ == "__main__":
    raise SystemExit(main())
