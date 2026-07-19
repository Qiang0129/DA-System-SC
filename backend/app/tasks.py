from __future__ import annotations

import json
import io
import math
import shutil
import zipfile
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy import and_, desc, func, or_, select
from sqlalchemy.orm import Session

from .auth import get_current_user
from .config import get_settings
from .database import get_session
from .models import (
    AnalysisTask,
    Dataset,
    DatasetQuality,
    OperationLog,
    TaskExport,
    TaskResult,
    TaskTemplate,
    User,
)
from .schemas import (
    AnalysisTaskBulkRequest,
    AnalysisTaskCreateRequest,
    AnalysisTaskLogItem,
    AnalysisTaskLogPageResponse,
    AnalysisTaskMetricsSummary,
    AnalysisTaskPageResponse,
    AnalysisTaskParams,
    AnalysisTaskResponse,
    AnalysisTaskStatsResponse,
    AnalysisTaskUpdateRequest,
    MessageResponse,
    TaskExportCreateRequest,
    TaskExportListResponse,
    TaskExportResponse,
    TaskResultEnvelope,
    TaskTemplateCreateRequest,
    TaskTemplateListResponse,
    TaskTemplateResponse,
)
from .task_executor import task_execution_manager

router = APIRouter(prefix="/api/tasks", tags=["tasks"])

TASK_STATUSES = ("draft", "queued", "running", "succeeded", "failed", "cancelled")
DELETABLE_STATUSES = {"draft", "failed", "cancelled", "succeeded"}
STARTABLE_STATUSES = {"draft", "failed", "cancelled"}
CANCELABLE_STATUSES = {"queued", "running"}
MODES = {"OMELET", "OMELET-SV"}

# 五个固定分析阶段，前端流水线与进度映射共用。
PIPELINE_STAGES = [
    ("select_base", "选择基础聚类结果"),
    ("build_ca", "GBE 编码与 CA 构建"),
    ("multi_kernel", "多核相似性学习"),
    ("evaluate", "谱聚类与指标评估"),
    ("persist", "结果落盘"),
]


def _now() -> datetime:
    return datetime.now().replace(microsecond=0)


def _format_dt(value: datetime | None) -> str | None:
    if value is None:
        return None
    return value.strftime("%Y-%m-%d %H:%M:%S")


def _load_json(value: str | None, default: Any) -> Any:
    if not value:
        return default
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return default


def _dump_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False)


def _default_params(mode: str = "OMELET-SV") -> dict[str, Any]:
    params = AnalysisTaskParams().model_dump(by_alias=True)
    if mode != "OMELET-SV":
        params["anchor"] = 0
    return params


def _normalize_params(mode: str, params: AnalysisTaskParams | dict | None) -> dict[str, Any]:
    if params is None:
        data = _default_params(mode)
    elif isinstance(params, AnalysisTaskParams):
        data = params.model_dump(by_alias=True)
    else:
        data = {**_default_params(mode), **params}

    if "lambdaValue" in data and "lambda" not in data:
        data["lambda"] = data.pop("lambdaValue")
    data.setdefault("nBase", 20)
    data.setdefault("sigma", 1.0)
    data.setdefault("lambda", 5.0)
    data.setdefault("gamma", 5.0)
    data.setdefault("anchor", 10 if mode == "OMELET-SV" else 0)
    data.setdefault("runs", 10)
    data.setdefault("maxIter", 10)
    data.setdefault("randomSeed", 1)

    data["nBase"] = max(1, int(data["nBase"]))
    data["sigma"] = float(data["sigma"])
    data["lambda"] = float(data["lambda"])
    data["gamma"] = float(data["gamma"])
    data["anchor"] = max(0, int(data["anchor"]))
    data["runs"] = max(1, int(data["runs"]))
    data["maxIter"] = max(1, int(data["maxIter"]))
    data["randomSeed"] = max(0, int(data["randomSeed"]))
    if mode != "OMELET-SV":
        data["anchor"] = 0
    return data


def _stage_from_progress(progress: float, status: str) -> str | None:
    if status == "draft":
        return None
    if status == "queued":
        return PIPELINE_STAGES[0][0]
    if status == "succeeded":
        return PIPELINE_STAGES[-1][0]
    if status == "cancelled":
        return None
    ratio = max(0.0, min(float(progress), 100.0)) / 100.0
    index = min(len(PIPELINE_STAGES) - 1, int(ratio * len(PIPELINE_STAGES)))
    if ratio >= 1:
        index = len(PIPELINE_STAGES) - 1
    return PIPELINE_STAGES[index][0]


def _get_user_dataset(session: Session, dataset_id: int, user: User) -> Dataset:
    dataset = session.scalar(select(Dataset).where(Dataset.id == dataset_id, Dataset.user_id == user.id))
    if dataset is None:
        raise HTTPException(404, "数据集不存在")
    return dataset


def _ensure_taskable(session: Session, dataset: Dataset) -> None:
    quality = session.scalar(select(DatasetQuality).where(DatasetQuality.dataset_id == dataset.id))
    if quality and quality.status == "error":
        raise HTTPException(422, "数据集质量检查未通过，无法创建或启动任务")
    if not dataset.has_ground_truth or not dataset.cluster_count or dataset.cluster_count < 2:
        raise HTTPException(422, "真实 OMELET 分析需要包含至少两个类别的 y 标签")


def _get_user_task(session: Session, task_id: int, user: User) -> AnalysisTask:
    task = session.scalar(select(AnalysisTask).where(AnalysisTask.id == task_id, AnalysisTask.user_id == user.id))
    if task is None:
        raise HTTPException(404, "任务不存在")
    return task


def _add_log(
    session: Session,
    *,
    user_id: int | None,
    task_id: int | None,
    action: str,
    message: str,
    level: str = "info",
    detail: dict | None = None,
) -> None:
    session.add(
        OperationLog(
            user_id=user_id,
            task_id=task_id,
            action=action,
            level=level,
            message=message[:500],
            detail_json=_dump_json(detail) if detail is not None else None,
        ),
    )


def _metrics_summary(session: Session, task_id: int) -> AnalysisTaskMetricsSummary | None:
    result = session.scalar(select(TaskResult).where(TaskResult.task_id == task_id))
    if result is None or result.schema_version != 1:
        return None
    metrics = _load_json(result.metrics_json, {})
    aggregate = metrics.get("aggregate") if isinstance(metrics, dict) else None
    if not isinstance(aggregate, dict):
        return None
    return AnalysisTaskMetricsSummary(
        acc=aggregate.get("acc", {}).get("mean"),
        nmi=aggregate.get("nmi", {}).get("mean"),
        ari=aggregate.get("ari", {}).get("mean"),
        f1=aggregate.get("f1", {}).get("mean"),
    )


def _runtime_seconds(task: AnalysisTask, session: Session | None = None) -> float | None:
    if session is not None:
        result = session.scalar(select(TaskResult).where(TaskResult.task_id == task.id))
        if result and result.runtime_seconds is not None:
            return float(result.runtime_seconds)
    if task.started_at and task.finished_at:
        return max(0.0, (task.finished_at - task.started_at).total_seconds())
    if task.started_at and task.status == "running":
        return max(0.0, (_now() - task.started_at).total_seconds())
    return None


def _task_response(session: Session, task: AnalysisTask, dataset_name: str) -> AnalysisTaskResponse:
    queue_position = None
    if task.status == "queued" and task.queued_at is not None:
        queue_position = int(
            session.scalar(
                select(func.count(AnalysisTask.id)).where(
                    AnalysisTask.status == "queued",
                    or_(
                        AnalysisTask.queued_at < task.queued_at,
                        and_(AnalysisTask.queued_at == task.queued_at, AnalysisTask.id <= task.id),
                    ),
                ),
            )
            or 1,
        )
    params = _load_json(task.params_json, {})
    return AnalysisTaskResponse(
        id=task.id,
        name=task.name,
        mode=task.mode,
        status=task.status,
        progress=float(task.progress or 0),
        currentRun=int(task.current_run or 0),
        totalRuns=max(1, int(params.get("runs") or 1)),
        queuePosition=queue_position,
        currentIter=int(task.current_iter or 0),
        maxIter=int(task.max_iter or 0),
        currentStage=task.current_stage,
        datasetId=task.dataset_id,
        datasetName=dataset_name,
        params=params,
        errorMessage=task.error_message,
        failureReason=task.failure_reason,
        metricsSummary=_metrics_summary(session, task.id),
        runtimeSeconds=_runtime_seconds(task, session),
        createdAt=_format_dt(task.created_at) or "",
        startedAt=_format_dt(task.started_at),
        finishedAt=_format_dt(task.finished_at),
        updatedAt=_format_dt(task.updated_at) or "",
    )


def _refresh_user_running_tasks(session: Session, user_id: int, task_ids: list[int] | None = None) -> None:
    """真实执行器独立写入进度，保留旧调用点以兼容任务列表与统计接口。"""
    return None


def _queue_task(session: Session, task: AnalysisTask, user: User) -> None:
    if task.status not in STARTABLE_STATUSES and task.status != "queued":
        raise HTTPException(422, f"当前状态不可启动: {task.status}")

    dataset = _get_user_dataset(session, task.dataset_id, user)
    _ensure_taskable(session, dataset)

    params = _load_json(task.params_json, {})
    n_base = int(params.get("nBase") or 0)
    if n_base > dataset.base_cluster_count:
        raise HTTPException(422, f"n_base 不能超过数据集基础聚类数 {dataset.base_cluster_count}")

    task.status = "queued"
    task.progress = 0
    task.current_run = 0
    task.current_iter = 0
    task.error_message = None
    task.failure_reason = None
    task.queued_at = _now()
    task.started_at = None
    task.finished_at = None
    task.current_stage = PIPELINE_STAGES[0][0]
    _add_log(
        session,
        user_id=user.id,
        task_id=task.id,
        action="task_queued",
        message="任务已进入真实执行队列",
        detail={"mode": task.mode, "datasetId": task.dataset_id},
    )


def _remove_result_directory(result: TaskResult | None) -> None:
    if result is None or not result.labels_path:
        return
    root = Path(get_settings().result_storage_dir).resolve()
    directory = Path(result.labels_path).resolve().parent
    try:
        directory.relative_to(root)
    except ValueError:
        return
    shutil.rmtree(directory, ignore_errors=True)


def _template_response(template: TaskTemplate) -> TaskTemplateResponse:
    return TaskTemplateResponse(
        id=template.id,
        name=template.name,
        mode=template.mode,
        params=_load_json(template.params_json, {}),
        createdAt=_format_dt(template.created_at) or "",
    )


@router.get("/stats", response_model=AnalysisTaskStatsResponse)
def get_task_stats(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    _refresh_user_running_tasks(session, user.id)

    rows = session.execute(
        select(AnalysisTask.status, func.count(AnalysisTask.id))
        .where(AnalysisTask.user_id == user.id)
        .group_by(AnalysisTask.status),
    ).all()
    counts = {status: 0 for status in TASK_STATUSES}
    total = 0
    for status, count in rows:
        counts[status] = int(count)
        total += int(count)

    today = _now().date()
    today_completed = int(
        session.scalar(
            select(func.count(AnalysisTask.id)).where(
                AnalysisTask.user_id == user.id,
                AnalysisTask.status == "succeeded",
                AnalysisTask.finished_at.is_not(None),
                func.date(AnalysisTask.finished_at) == today,
            ),
        )
        or 0,
    )

    runtime_values = session.scalars(
        select(TaskResult.runtime_seconds)
        .join(AnalysisTask, AnalysisTask.id == TaskResult.task_id)
        .where(AnalysisTask.user_id == user.id, TaskResult.runtime_seconds.is_not(None)),
    ).all()
    average_runtime = round(sum(float(v) for v in runtime_values) / len(runtime_values), 2) if runtime_values else None

    finished = counts["succeeded"] + counts["failed"]
    failure_rate = round(counts["failed"] / finished, 4) if finished else 0.0

    return AnalysisTaskStatsResponse(
        total=total,
        draft=counts["draft"],
        queued=counts["queued"],
        running=counts["running"],
        succeeded=counts["succeeded"],
        failed=counts["failed"],
        cancelled=counts["cancelled"],
        todayCompleted=today_completed,
        averageRuntimeSeconds=average_runtime,
        failureRate=failure_rate,
    )


@router.get("/templates", response_model=TaskTemplateListResponse)
def list_templates(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    rows = session.scalars(
        select(TaskTemplate).where(TaskTemplate.user_id == user.id).order_by(desc(TaskTemplate.created_at)),
    ).all()
    return TaskTemplateListResponse(items=[_template_response(item) for item in rows])


@router.post("/templates", response_model=TaskTemplateResponse)
def create_template(
    payload: TaskTemplateCreateRequest,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    mode = payload.mode if payload.mode in MODES else "OMELET-SV"
    template = TaskTemplate(
        user_id=user.id,
        name=payload.name.strip()[:128],
        mode=mode,
        params_json=_dump_json(_normalize_params(mode, payload.params)),
    )
    session.add(template)
    session.commit()
    session.refresh(template)
    return _template_response(template)


@router.delete("/templates/{template_id}", response_model=MessageResponse)
def delete_template(
    template_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    template = session.scalar(
        select(TaskTemplate).where(TaskTemplate.id == template_id, TaskTemplate.user_id == user.id),
    )
    if template is None:
        raise HTTPException(404, "模板不存在")
    session.delete(template)
    session.commit()
    return MessageResponse(message="模板已删除")


@router.get("", response_model=AnalysisTaskPageResponse)
def list_tasks(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100, alias="pageSize"),
    status: str | None = Query(default=None),
    mode: str | None = Query(default=None),
    dataset_id: int | None = Query(default=None, alias="datasetId"),
    keyword: str | None = Query(default=None),
    created_from: str | None = Query(default=None, alias="createdFrom"),
    created_to: str | None = Query(default=None, alias="createdTo"),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    _refresh_user_running_tasks(session, user.id)

    stmt = (
        select(AnalysisTask, Dataset.name)
        .join(Dataset, Dataset.id == AnalysisTask.dataset_id)
        .where(AnalysisTask.user_id == user.id)
    )

    if status:
        statuses = [item.strip() for item in status.split(",") if item.strip()]
        if statuses:
            stmt = stmt.where(AnalysisTask.status.in_(statuses))
    if mode:
        stmt = stmt.where(AnalysisTask.mode == mode)
    if dataset_id is not None:
        stmt = stmt.where(AnalysisTask.dataset_id == dataset_id)
    if keyword:
        like = f"%{keyword.strip()}%"
        stmt = stmt.where(
            or_(
                AnalysisTask.name.like(like),
                Dataset.name.like(like),
                AnalysisTask.mode.like(like),
            ),
        )
    if created_from:
        try:
            start = datetime.strptime(created_from, "%Y-%m-%d")
            stmt = stmt.where(AnalysisTask.created_at >= start)
        except ValueError as exc:
            raise HTTPException(422, "createdFrom 格式应为 YYYY-MM-DD") from exc
    if created_to:
        try:
            end = datetime.strptime(created_to, "%Y-%m-%d") + timedelta(days=1)
            stmt = stmt.where(AnalysisTask.created_at < end)
        except ValueError as exc:
            raise HTTPException(422, "createdTo 格式应为 YYYY-MM-DD") from exc

    total = int(session.scalar(select(func.count()).select_from(stmt.order_by(None).subquery())) or 0)
    rows = session.execute(
        stmt.order_by(desc(AnalysisTask.updated_at), desc(AnalysisTask.id))
        .offset((page - 1) * page_size)
        .limit(page_size),
    ).all()

    total_pages = max(1, math.ceil(total / page_size)) if total else 0
    return AnalysisTaskPageResponse(
        items=[_task_response(session, task, dataset_name) for task, dataset_name in rows],
        total=total,
        page=page,
        pageSize=page_size,
        totalPages=total_pages,
    )


@router.post("", response_model=AnalysisTaskResponse)
def create_task(
    payload: AnalysisTaskCreateRequest,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    dataset = _get_user_dataset(session, payload.datasetId, user)
    _ensure_taskable(session, dataset)

    mode = payload.mode if payload.mode in MODES else "OMELET-SV"
    params = _normalize_params(mode, payload.params)

    if payload.templateId is not None:
        template = session.scalar(
            select(TaskTemplate).where(TaskTemplate.id == payload.templateId, TaskTemplate.user_id == user.id),
        )
        if template is None:
            raise HTTPException(404, "模板不存在")
        mode = template.mode if template.mode in MODES else mode
        params = _normalize_params(mode, _load_json(template.params_json, {}))

    # 未显式给出过大 nBase 时，自动裁到数据集可用上限；显式超限仍返回 422。
    explicit_n_base = None
    if payload.params is not None:
        explicit_n_base = payload.params.nBase
    if explicit_n_base is not None and int(explicit_n_base) > dataset.base_cluster_count:
        raise HTTPException(422, f"n_base 不能超过数据集基础聚类数 {dataset.base_cluster_count}")
    params["nBase"] = min(int(params["nBase"]), int(dataset.base_cluster_count))

    task_name = (payload.name or f"{dataset.name} {mode} 任务").strip()[:128]
    task = AnalysisTask(
        user_id=user.id,
        dataset_id=dataset.id,
        name=task_name,
        mode=mode,
        status="draft",
        progress=0,
        current_iter=0,
        max_iter=int(params["maxIter"]),
        params_json=_dump_json(params),
        current_stage=None,
    )
    session.add(task)
    session.flush()
    _add_log(
        session,
        user_id=user.id,
        task_id=task.id,
        action="task_created",
        message=f"创建任务：{task.name}",
        detail={"mode": mode, "datasetId": dataset.id, "params": params},
    )

    should_notify_executor = bool(payload.startImmediately)
    if should_notify_executor:
        _queue_task(session, task, user)

    session.commit()
    session.refresh(task)
    if should_notify_executor:
        task_execution_manager.notify()
    return _task_response(session, task, dataset.name)


def _result_artifact_paths(result: TaskResult) -> dict[str, Path]:
    paths = {
        "labels": result.labels_path,
        "ca": result.ca_matrix_path,
        "s": result.s_matrix_path,
        "z": result.z_matrix_path,
    }
    resolved = {key: Path(value).resolve() for key, value in paths.items() if value}
    labels_path = resolved.get("labels")
    if labels_path is not None:
        csv_path = labels_path.parent / "labels.csv"
        if csv_path.is_file():
            resolved["labels-csv"] = csv_path
    return resolved


def _safe_artifact_path(result: TaskResult, artifact_key: str) -> Path:
    path = _result_artifact_paths(result).get(artifact_key)
    if path is None or not path.is_file():
        raise HTTPException(404, "请求的结果产物不存在")
    root = Path(get_settings().result_storage_dir).resolve()
    try:
        path.relative_to(root)
    except ValueError as exc:
        raise HTTPException(404, "请求的结果产物不可访问") from exc
    return path


def _artifact_metadata(task_id: int, result: TaskResult) -> list[dict[str, Any]]:
    labels = {
        "labels": ("全部轮次标签", "NPZ"),
        "labels-csv": ("代表轮次标签", "CSV"),
        "ca": ("CA 协关联矩阵", "NPZ"),
        "s": ("S 共识矩阵", "NPZ"),
        "z": ("Z 拓扑矩阵", "NPZ"),
    }
    return [
        {
            "key": key,
            "name": labels[key][0],
            "format": labels[key][1],
            "size": path.stat().st_size,
            "downloadUrl": f"/api/tasks/{task_id}/artifacts/{key}",
        }
        for key, path in _result_artifact_paths(result).items()
        if key in labels and path.is_file()
    ]


def _result_envelope(session: Session, task: AnalysisTask, dataset_name: str) -> TaskResultEnvelope:
    response_task = _task_response(session, task, dataset_name)
    if task.status != "succeeded":
        return TaskResultEnvelope(state=task.status, task=response_task)
    result = session.scalar(select(TaskResult).where(TaskResult.task_id == task.id))
    if result is None or result.schema_version != 1:
        return TaskResultEnvelope(state="legacy", task=response_task)
    metrics = _load_json(result.metrics_json, {})
    kernels = _load_json(result.kernel_weights_json, {})
    convergence = _load_json(result.convergence_json, {})
    preview = _load_json(result.preview_json, {})
    if not isinstance(preview, dict) or preview.get("schemaVersion") != 1:
        return TaskResultEnvelope(state="legacy", task=response_task)
    return TaskResultEnvelope(
        state="ready",
        task=response_task,
        result={
            "schemaVersion": 1,
            "parameters": _load_json(task.params_json, {}),
            "runtimeSeconds": result.runtime_seconds,
            "metrics": metrics,
            "kernelWeights": kernels,
            "convergence": convergence,
            "preview": preview,
            "artifacts": _artifact_metadata(task.id, result),
        },
    )


@router.get("/results/latest", response_model=TaskResultEnvelope)
def get_latest_result(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    task = session.scalar(
        select(AnalysisTask)
        .join(TaskResult, TaskResult.task_id == AnalysisTask.id)
        .where(
            AnalysisTask.user_id == user.id,
            AnalysisTask.status == "succeeded",
            TaskResult.schema_version == 1,
        )
        .order_by(desc(AnalysisTask.finished_at), desc(AnalysisTask.id))
        .limit(1),
    )
    if task is None:
        return TaskResultEnvelope(state="empty")
    dataset = _get_user_dataset(session, task.dataset_id, user)
    return _result_envelope(session, task, dataset.name)


@router.get("/{task_id}/result", response_model=TaskResultEnvelope)
def get_task_result(
    task_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    task = _get_user_task(session, task_id, user)
    dataset = _get_user_dataset(session, task.dataset_id, user)
    return _result_envelope(session, task, dataset.name)


@router.get("/{task_id}/artifacts/{artifact_key}")
def download_task_artifact(
    task_id: int,
    artifact_key: str,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    _get_user_task(session, task_id, user)
    result = session.scalar(select(TaskResult).where(TaskResult.task_id == task_id, TaskResult.schema_version == 1))
    if result is None:
        raise HTTPException(404, "真实任务结果不存在")
    path = _safe_artifact_path(result, artifact_key)
    media_type = "text/csv; charset=utf-8" if path.suffix == ".csv" else "application/octet-stream"
    return FileResponse(path, media_type=media_type, filename=path.name)


def _export_response(item: TaskExport) -> TaskExportResponse:
    selected = _load_json(item.items_json, [])
    if not isinstance(selected, list):
        selected = []
    return TaskExportResponse(
        id=item.id,
        name=(item.name or item.filename).strip(),
        items=[str(value) for value in selected],
        itemCount=len(selected),
        status=item.status or "ready",
        filename=item.filename,
        fileSize=int(item.file_size or 0),
        createdAt=_format_dt(item.created_at) or "",
        downloadUrl=f"/api/tasks/{item.task_id}/exports/{item.id}/download",
    )


@router.get("/{task_id}/exports", response_model=TaskExportListResponse)
def list_task_exports(
    task_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    _get_user_task(session, task_id, user)
    rows = session.scalars(
        select(TaskExport)
        .where(TaskExport.task_id == task_id)
        .order_by(desc(TaskExport.created_at), desc(TaskExport.id)),
    ).all()
    return TaskExportListResponse(items=[_export_response(item) for item in rows])


@router.post("/{task_id}/exports", response_model=TaskExportResponse)
def create_task_export(
    task_id: int,
    payload: TaskExportCreateRequest,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    task = _get_user_task(session, task_id, user)
    result = session.scalar(select(TaskResult).where(TaskResult.task_id == task_id, TaskResult.schema_version == 1))
    if result is None:
        raise HTTPException(409, "仅真实完成的任务可以导出")
    allowed = {"metrics", "parameters", "result", "labels", "ca", "s", "z"}
    selected = list(dict.fromkeys(item.strip().lower() for item in payload.items if item.strip()))
    if not selected or any(item not in allowed for item in selected):
        raise HTTPException(422, "导出项包含不支持的类型")

    root = Path(get_settings().result_storage_dir).resolve()
    source_dir = _safe_artifact_path(result, "labels").parent
    export_dir = source_dir / "exports"
    export_dir.mkdir(parents=True, exist_ok=True)
    created_at = datetime.now()
    archive_name = (payload.name or "").strip() or f"任务 #{task_id} 交付档案"
    filename = f"omelet-task-{task_id}-{created_at.strftime('%Y%m%d%H%M%S')}.zip"
    export_path = export_dir / filename
    metrics = _load_json(result.metrics_json, {})
    preview = _load_json(result.preview_json, {})
    with zipfile.ZipFile(export_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr(
            "manifest.json",
            _dump_json({
                "schemaVersion": 1,
                "archiveName": archive_name,
                "taskId": task_id,
                "datasetId": task.dataset_id,
                "mode": task.mode,
                "items": selected,
                "createdAt": created_at.isoformat(timespec="seconds"),
            }),
        )
        if "metrics" in selected:
            output = io.StringIO()
            output.write("metric,mean,std,min,max\n")
            for key, values in metrics.get("aggregate", {}).items():
                output.write(
                    f"{key},{values.get('mean','')},{values.get('std','')},{values.get('min','')},{values.get('max','')}\n",
                )
            archive.writestr("metrics.csv", output.getvalue().encode("utf-8-sig"))
        if "parameters" in selected:
            archive.writestr("parameters.json", _dump_json(_load_json(task.params_json, {})))
        if "result" in selected:
            archive.writestr(
                "result.json",
                _dump_json({
                    "metrics": metrics,
                    "kernelWeights": _load_json(result.kernel_weights_json, {}),
                    "convergence": _load_json(result.convergence_json, {}),
                    "preview": preview,
                }),
            )
        artifact_map = {"labels": "labels-csv", "ca": "ca", "s": "s", "z": "z"}
        for item in selected:
            key = artifact_map.get(item)
            if key:
                path = _safe_artifact_path(result, key)
                archive.write(path, arcname=path.name)
    try:
        export_path.resolve().relative_to(root)
    except ValueError as exc:
        raise HTTPException(500, "导出文件路径异常") from exc
    item = TaskExport(
        task_id=task_id,
        export_type="zip",
        name=archive_name,
        items_json=_dump_json(selected),
        status="ready",
        filename=filename,
        storage_path=str(export_path),
        file_size=export_path.stat().st_size,
    )
    session.add(item)
    session.commit()
    session.refresh(item)
    return _export_response(item)


@router.get("/{task_id}/exports/{export_id}/download")
def download_task_export(
    task_id: int,
    export_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    _get_user_task(session, task_id, user)
    item = session.scalar(select(TaskExport).where(TaskExport.id == export_id, TaskExport.task_id == task_id))
    if item is None:
        raise HTTPException(404, "导出文件不存在")
    path = Path(item.storage_path).resolve()
    root = Path(get_settings().result_storage_dir).resolve()
    try:
        path.relative_to(root)
    except ValueError as exc:
        raise HTTPException(404, "导出文件不可访问") from exc
    if not path.is_file():
        raise HTTPException(404, "导出文件已被清理")
    return FileResponse(path, media_type="application/zip", filename=item.filename)


@router.get("/{task_id}", response_model=AnalysisTaskResponse)
def get_task(
    task_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    _refresh_user_running_tasks(session, user.id, [task_id])
    task = _get_user_task(session, task_id, user)
    dataset = _get_user_dataset(session, task.dataset_id, user)
    return _task_response(session, task, dataset.name)


@router.patch("/{task_id}", response_model=AnalysisTaskResponse)
def update_task(
    task_id: int,
    payload: AnalysisTaskUpdateRequest,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    task = _get_user_task(session, task_id, user)
    if task.status not in {"draft", "failed", "cancelled"}:
        raise HTTPException(422, "仅草稿/失败/取消状态可修改参数")

    dataset = _get_user_dataset(session, task.dataset_id, user)
    if payload.name is not None:
        task.name = payload.name.strip()[:128] or task.name
    if payload.mode is not None:
        if payload.mode not in MODES:
            raise HTTPException(422, "不支持的算法模式")
        task.mode = payload.mode
    if payload.params is not None or payload.mode is not None:
        params = _normalize_params(task.mode, payload.params or _load_json(task.params_json, {}))
        if int(params["nBase"]) > dataset.base_cluster_count:
            raise HTTPException(422, f"n_base 不能超过数据集基础聚类数 {dataset.base_cluster_count}")
        task.params_json = _dump_json(params)
        task.max_iter = int(params["maxIter"])

    _add_log(
        session,
        user_id=user.id,
        task_id=task.id,
        action="task_updated",
        message="任务参数已更新",
    )
    session.commit()
    session.refresh(task)
    return _task_response(session, task, dataset.name)


@router.post("/{task_id}/start", response_model=AnalysisTaskResponse)
def start_task(
    task_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    task = _get_user_task(session, task_id, user)
    if task.status not in STARTABLE_STATUSES:
        raise HTTPException(422, f"当前状态不可启动: {task.status}")
    dataset = _get_user_dataset(session, task.dataset_id, user)
    _queue_task(session, task, user)
    session.commit()
    session.refresh(task)
    task_execution_manager.notify()
    return _task_response(session, task, dataset.name)


@router.post("/{task_id}/cancel", response_model=AnalysisTaskResponse)
def cancel_task(
    task_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    task = _get_user_task(session, task_id, user)
    if task.status not in CANCELABLE_STATUSES:
        raise HTTPException(422, f"当前状态不可取消: {task.status}")
    dataset = _get_user_dataset(session, task.dataset_id, user)
    task.status = "cancelled"
    task.finished_at = _now()
    task.current_stage = task.current_stage or PIPELINE_STAGES[0][0]
    _add_log(
        session,
        user_id=user.id,
        task_id=task.id,
        action="task_cancelled",
        level="warning",
        message="任务已取消",
    )
    session.commit()
    session.refresh(task)
    task_execution_manager.cancel_active_process(task.id)
    return _task_response(session, task, dataset.name)


@router.post("/{task_id}/retry", response_model=AnalysisTaskResponse)
def retry_task(
    task_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    task = _get_user_task(session, task_id, user)
    if task.status not in {"failed", "cancelled"}:
        raise HTTPException(422, "仅失败或取消的任务可重试")
    dataset = _get_user_dataset(session, task.dataset_id, user)
    old_result = session.scalar(select(TaskResult).where(TaskResult.task_id == task.id))
    if old_result is not None:
        _remove_result_directory(old_result)
        session.delete(old_result)
    _queue_task(session, task, user)
    _add_log(
        session,
        user_id=user.id,
        task_id=task.id,
        action="task_retried",
        message="任务已重新执行",
    )
    session.commit()
    session.refresh(task)
    task_execution_manager.notify()
    return _task_response(session, task, dataset.name)


@router.post("/{task_id}/clone", response_model=AnalysisTaskResponse)
def clone_task(
    task_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    source = _get_user_task(session, task_id, user)
    dataset = _get_user_dataset(session, source.dataset_id, user)
    _ensure_taskable(session, dataset)

    cloned = AnalysisTask(
        user_id=user.id,
        dataset_id=source.dataset_id,
        name=f"{source.name} 副本"[:128],
        mode=source.mode,
        status="draft",
        progress=0,
        current_iter=0,
        max_iter=source.max_iter,
        params_json=source.params_json,
        current_stage=None,
    )
    session.add(cloned)
    session.flush()
    _add_log(
        session,
        user_id=user.id,
        task_id=cloned.id,
        action="task_cloned",
        message=f"从任务 #{source.id} 克隆",
        detail={"sourceTaskId": source.id},
    )
    session.commit()
    session.refresh(cloned)
    return _task_response(session, cloned, dataset.name)


@router.delete("/{task_id}", response_model=MessageResponse)
def delete_task(
    task_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    task = _get_user_task(session, task_id, user)
    if task.status not in DELETABLE_STATUSES:
        raise HTTPException(422, "运行中或排队中的任务不可删除，请先取消")
    old_result = session.scalar(select(TaskResult).where(TaskResult.task_id == task.id))
    _remove_result_directory(old_result)
    session.delete(task)
    _add_log(
        session,
        user_id=user.id,
        task_id=task_id,
        action="task_deleted",
        level="warning",
        message=f"删除任务 #{task_id}",
    )
    session.commit()
    return MessageResponse(message="任务已删除")


@router.get("/{task_id}/logs", response_model=AnalysisTaskLogPageResponse)
def list_task_logs(
    task_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    _get_user_task(session, task_id, user)
    rows = session.scalars(
        select(OperationLog)
        .where(OperationLog.task_id == task_id, or_(OperationLog.user_id == user.id, OperationLog.user_id.is_(None)))
        .order_by(desc(OperationLog.created_at), desc(OperationLog.id))
        .limit(200),
    ).all()
    items = [
        AnalysisTaskLogItem(
            id=row.id,
            action=row.action,
            level=row.level,
            message=row.message,
            createdAt=_format_dt(row.created_at) or "",
            detail=_load_json(row.detail_json, None),
        )
        for row in rows
    ]
    return AnalysisTaskLogPageResponse(items=items, total=len(items))


@router.post("/bulk", response_model=MessageResponse)
def bulk_tasks(
    payload: AnalysisTaskBulkRequest,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    action = payload.action.strip().lower()
    if action not in {"retry", "cancel", "delete"}:
        raise HTTPException(422, "不支持的批量操作")

    tasks = session.scalars(
        select(AnalysisTask).where(AnalysisTask.user_id == user.id, AnalysisTask.id.in_(payload.taskIds)),
    ).all()
    if not tasks:
        raise HTTPException(404, "未找到可操作的任务")

    affected = 0
    notify_executor = False
    active_cancellations: list[int] = []
    for task in tasks:
        try:
            if action == "retry" and task.status in {"failed", "cancelled"}:
                old_result = session.scalar(select(TaskResult).where(TaskResult.task_id == task.id))
                if old_result is not None:
                    _remove_result_directory(old_result)
                    session.delete(old_result)
                _queue_task(session, task, user)
                affected += 1
                notify_executor = True
            elif action == "cancel" and task.status in CANCELABLE_STATUSES:
                task.status = "cancelled"
                task.finished_at = _now()
                affected += 1
                active_cancellations.append(task.id)
            elif action == "delete" and task.status in DELETABLE_STATUSES:
                old_result = session.scalar(select(TaskResult).where(TaskResult.task_id == task.id))
                _remove_result_directory(old_result)
                session.delete(task)
                affected += 1
        except HTTPException:
            # 批量场景跳过单条失败，尽量处理其余任务。
            continue

    session.commit()
    if notify_executor:
        task_execution_manager.notify()
    for task_id in active_cancellations:
        task_execution_manager.cancel_active_process(task_id)
    return MessageResponse(message=f"已处理 {affected} 个任务")
