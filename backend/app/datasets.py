import hashlib
import io
import json
import re
import zipfile
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import scipy.io as sio
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy import asc, desc, func, select
from sqlalchemy.orm import Session

from .auth import get_current_user
from .config import get_settings
from .database import get_session
from .models import Dataset, DatasetQuality, DatasetRevision, DatasetTask, User
from .schemas import (
    DatasetBulkRequest,
    DatasetCatalogItemResponse,
    DatasetCatalogPageResponse,
    DatasetRenameRequest,
    DatasetRevisionResponse,
    MessageResponse,
)

router = APIRouter(prefix="/api/datasets", tags=["datasets"])
LABEL_VARIABLE_NAMES = ("y", "label", "labels")
SAFE_FILENAME_PATTERN = re.compile(r"[^0-9A-Za-z._-]+")


def _variable_shape(value) -> list[int]:
    return [int(dim) for dim in getattr(value, "shape", [])]


def _format_label(value) -> str:
    if isinstance(value, np.generic):
        value = value.item()
    if isinstance(value, bytes):
        value = value.decode(errors="ignore")
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value)


def _flatten_values(value) -> np.ndarray:
    values = np.asarray(value).squeeze().reshape(-1)
    if np.issubdtype(values.dtype, np.floating):
        values = values[~np.isnan(values)]
    return values


def _find_label_variable(mat: dict):
    for key in LABEL_VARIABLE_NAMES:
        if key in mat:
            return key, mat[key]

    for name, value in mat.items():
        if name.startswith("__"):
            continue
        if name.lower() in LABEL_VARIABLE_NAMES:
            return name, value

    return None, None


def _build_label_distribution(label_values) -> list[dict]:
    labels = _flatten_values(label_values)
    if labels.size == 0:
        return []

    unique_labels, counts = np.unique(labels, return_counts=True)
    total = int(counts.sum())

    return [
        {
            "label": _format_label(label),
            "count": int(count),
            "percent": round(int(count) * 100 / total) if total else 0,
        }
        for label, count in zip(unique_labels, counts)
    ]


def _format_value_range(values: np.ndarray) -> str:
    if values.size == 0:
        return ""

    if np.issubdtype(values.dtype, np.number):
        numeric_values = values.astype(float)
        if numeric_values.size == 0:
            return ""
        return f"{_format_label(float(numeric_values.min()))} - {_format_label(float(numeric_values.max()))}"

    unique_values = np.unique(values)
    if unique_values.size == 1:
        return _format_label(unique_values[0])
    return f"{_format_label(unique_values[0])} - {_format_label(unique_values[-1])}"


def _build_cluster_stats(matrix) -> list[dict]:
    values = np.asarray(matrix)
    if values.ndim < 2:
        return []

    stats = []
    for index in range(values.shape[1]):
        column_values = _flatten_values(values[:, index])
        stats.append(
            {
                "name": f"base_{index + 1}",
                "clusterCount": int(np.unique(column_values).size),
                "range": _format_value_range(column_values),
            },
        )

    return stats


def _safe_filename(filename: str) -> str:
    source = Path(filename).name
    suffix = Path(source).suffix.lower()
    stem = Path(source).stem or "dataset"
    safe_stem = SAFE_FILENAME_PATTERN.sub("_", stem).strip("._-") or "dataset"
    return f"{safe_stem[:80]}{suffix[:16]}"


def _dataset_name(filename: str) -> str:
    return (Path(filename).stem or "未命名数据集")[:128]


def _parse_mat_content(filename: str, content: bytes) -> dict:
    if not filename.lower().endswith(".mat"):
        raise HTTPException(400, f"不支持的文件格式: {filename}，目前仅支持 .mat")

    try:
        mat = sio.loadmat(io.BytesIO(content))
    except Exception as exc:
        raise HTTPException(400, f"无法解析 .mat 文件: {exc}") from exc

    variables = {}
    for name, value in mat.items():
        if name.startswith("__"):
            continue
        variables[name] = {
            "shape": _variable_shape(value),
            "dtype": str(value.dtype),
        }

    # 主变量通常是 E；缺少 E 时，取面积最大的二维矩阵作为基础聚类矩阵。
    main_var = None
    main_shape = [0, 0]
    if "E" in mat and len(_variable_shape(mat["E"])) >= 2:
        main_var = "E"
        main_shape = _variable_shape(mat["E"])

    for name, info in variables.items():
        if main_var == "E":
            break
        shape = info["shape"]
        if len(shape) >= 2 and shape[0] * shape[1] > main_shape[0] * main_shape[1]:
            main_var = name
            main_shape = shape

    label_var, label_values = _find_label_variable(mat)
    label_distribution = _build_label_distribution(label_values) if label_values is not None else []
    has_labels = len(label_distribution) > 0
    sample_count = int(main_shape[0]) if len(main_shape) >= 1 else 0
    base_count = int(main_shape[1]) if len(main_shape) >= 2 else 0
    main_matrix = mat[main_var] if main_var else None

    return {
        "fileName": filename,
        "variables": variables,
        "mainVariable": main_var,
        "labelVariable": label_var,
        "sampleCount": sample_count,
        "baseCount": base_count,
        "classCount": len(label_distribution),
        "hasLabels": has_labels,
        "matrixShape": f"{main_var}: {sample_count} x {base_count}" if main_var else "",
        "labelShape": f"{label_var}: {sample_count}" if label_var else "",
        "labelDistribution": label_distribution,
        "clusterStats": _build_cluster_stats(main_matrix) if main_matrix is not None else [],
    }


def _build_quality_summary(parsed: dict) -> tuple[str, list[str]]:
    issues: list[str] = []
    sample_count = int(parsed.get("sampleCount") or 0)
    base_count = int(parsed.get("baseCount") or 0)
    main_variable = parsed.get("mainVariable")

    if not main_variable or sample_count <= 0 or base_count <= 0:
        return "error", ["未检测到有效的基础聚类矩阵"]

    if not parsed.get("hasLabels"):
        issues.append("未提供真实标签，部分评估指标不可用")

    label_shape = parsed.get("variables", {}).get(parsed.get("labelVariable"), {}).get("shape", [])
    if label_shape:
        label_count = int(np.prod(label_shape))
        if label_count != sample_count:
            issues.append("标签数量与样本数量不一致")

    return ("warning" if issues else "ready"), issues


def _decode_issues(value: str | None) -> list[str]:
    if not value:
        return []
    try:
        decoded = json.loads(value)
    except json.JSONDecodeError:
        return []
    return [str(item) for item in decoded] if isinstance(decoded, list) else []


def _upsert_quality(session: Session, dataset: Dataset, parsed: dict) -> DatasetQuality:
    status, issues = _build_quality_summary(parsed)
    quality = session.scalar(select(DatasetQuality).where(DatasetQuality.dataset_id == dataset.id))
    if quality is None:
        quality = DatasetQuality(dataset_id=dataset.id, status=status, issues_json=json.dumps(issues, ensure_ascii=False))
        session.add(quality)
    else:
        quality.status = status
        quality.issues_json = json.dumps(issues, ensure_ascii=False)
    return quality


def _quality_for_dataset(session: Session, dataset: Dataset, parsed: dict | None = None) -> DatasetQuality:
    quality = session.scalar(select(DatasetQuality).where(DatasetQuality.dataset_id == dataset.id))
    if quality is not None:
        return quality

    parsed = parsed or _parse_stored_dataset_file(dataset)
    quality = _upsert_quality(session, dataset, parsed)
    session.flush()
    return quality


def _next_version(session: Session, dataset_id: int) -> int:
    current = session.scalar(
        select(func.max(DatasetRevision.version)).where(DatasetRevision.dataset_id == dataset_id),
    )
    return int(current or 0) + 1


def _record_revision(
    session: Session,
    dataset: Dataset,
    parsed: dict,
    action: str,
    quality: DatasetQuality | None = None,
) -> DatasetRevision:
    quality = quality or _quality_for_dataset(session, dataset, parsed)
    revision = DatasetRevision(
        dataset_id=dataset.id,
        version=_next_version(session, dataset.id),
        action=action,
        name=dataset.name,
        original_filename=dataset.original_filename,
        storage_path=dataset.storage_path,
        file_hash=dataset.file_hash,
        sample_count=dataset.sample_count,
        base_cluster_count=dataset.base_cluster_count,
        has_ground_truth=dataset.has_ground_truth,
        cluster_count=dataset.cluster_count,
        quality_status=quality.status,
        quality_issues_json=quality.issues_json,
    )
    session.add(revision)
    return revision


def _parse_stored_dataset_file(dataset: Dataset) -> dict:
    path = Path(dataset.storage_path)
    if not path.exists():
        return {}

    try:
        return _parse_mat_content(dataset.original_filename, path.read_bytes())
    except HTTPException:
        return {}


def _stored_file_size(dataset: Dataset) -> int:
    path = Path(dataset.storage_path)
    if not path.exists():
        return 0
    return path.stat().st_size


def _task_summaries(session: Session, dataset_ids: list[int]) -> dict[int, tuple[int, datetime | None]]:
    if not dataset_ids:
        return {}

    rows = session.execute(
        select(
            DatasetTask.dataset_id,
            func.count(DatasetTask.id),
            func.max(DatasetTask.updated_at),
        )
        .where(DatasetTask.dataset_id.in_(dataset_ids))
        .group_by(DatasetTask.dataset_id),
    ).all()
    return {int(dataset_id): (int(count), last_updated) for dataset_id, count, last_updated in rows}


def _catalog_item(
    session: Session,
    dataset: Dataset,
    parsed: dict | None = None,
    quality: DatasetQuality | None = None,
    task_summary: tuple[int, datetime | None] | None = None,
) -> DatasetCatalogItemResponse:
    parsed = parsed or _parse_stored_dataset_file(dataset)
    sample_count = int(parsed.get("sampleCount") or dataset.sample_count)
    base_count = int(parsed.get("baseCount") or dataset.base_cluster_count)
    has_labels = bool(parsed.get("hasLabels", dataset.has_ground_truth))
    class_count = int(parsed.get("classCount") or dataset.cluster_count or 0) if has_labels else 0
    quality = quality or _quality_for_dataset(session, dataset, parsed)
    current_version = session.scalar(
        select(func.max(DatasetRevision.version)).where(DatasetRevision.dataset_id == dataset.id),
    )
    task_count, last_analysis_at = task_summary or _task_summaries(session, [dataset.id]).get(dataset.id, (0, None))

    return DatasetCatalogItemResponse(
        id=dataset.id,
        name=dataset.name,
        createdAt=dataset.created_at.strftime("%Y-%m-%d %H:%M:%S") if dataset.created_at else "",
        fileSizeBytes=_stored_file_size(dataset),
        sampleCount=sample_count,
        baseCount=base_count,
        classCount=class_count,
        hasLabels=has_labels,
        taskCount=task_count,
        lastAnalysisAt=last_analysis_at.strftime("%Y-%m-%d %H:%M:%S") if last_analysis_at else None,
        version=int(current_version or 1),
        qualityStatus=quality.status,
        qualityIssues=_decode_issues(quality.issues_json),
        matrixShape=parsed.get("matrixShape") or f"E: {sample_count} x {base_count}",
        labelShape=parsed.get("labelShape") or (f"y: {sample_count}" if has_labels else ""),
        labelDistribution=parsed.get("labelDistribution") or [],
        clusterStats=parsed.get("clusterStats") or [],
    )


def _save_dataset_upload(user_id: int, filename: str, content: bytes) -> tuple[dict, str, Path]:
    parsed = _parse_mat_content(filename, content)
    settings = get_settings()
    storage_dir = Path(settings.dataset_storage_dir) / str(user_id)
    storage_dir.mkdir(parents=True, exist_ok=True)

    file_hash = hashlib.sha256(content).hexdigest()
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S%f")
    storage_path = storage_dir / f"{timestamp}_{file_hash[:12]}_{_safe_filename(filename)}"
    storage_path.write_bytes(content)

    return parsed, file_hash, storage_path


def _get_user_dataset(session: Session, dataset_id: int, user: User) -> Dataset:
    dataset = session.scalar(
        select(Dataset).where(Dataset.id == dataset_id, Dataset.user_id == user.id),
    )
    if dataset is None:
        raise HTTPException(404, "数据集不存在")
    return dataset


def _find_name_conflict(
    session: Session,
    user: User,
    name: str,
    exclude_dataset_id: int | None = None,
) -> Dataset | None:
    stmt = select(Dataset).where(
        Dataset.user_id == user.id,
        func.lower(Dataset.name) == name.strip().lower(),
    )
    if exclude_dataset_id is not None:
        stmt = stmt.where(Dataset.id != exclude_dataset_id)
    return session.scalar(stmt)


def _ensure_quality_records(session: Session, datasets: list[Dataset]) -> None:
    updated = False
    for dataset in datasets:
        quality = session.scalar(select(DatasetQuality.id).where(DatasetQuality.dataset_id == dataset.id))
        if quality is None:
            _quality_for_dataset(session, dataset)
            updated = True
    if updated:
        session.commit()


def _delete_datasets(session: Session, datasets: list[Dataset]) -> set[Path]:
    dataset_ids = [dataset.id for dataset in datasets]
    task_count = session.scalar(
        select(func.count(DatasetTask.id)).where(DatasetTask.dataset_id.in_(dataset_ids)),
    )
    if task_count:
        raise HTTPException(409, f"所选数据集仍被 {task_count} 个任务引用，无法删除")

    revision_paths = session.scalars(
        select(DatasetRevision.storage_path).where(DatasetRevision.dataset_id.in_(dataset_ids)),
    ).all()
    storage_paths = {Path(path) for path in revision_paths}
    storage_paths.update(Path(dataset.storage_path) for dataset in datasets)

    for dataset in datasets:
        session.delete(dataset)
    session.commit()
    return storage_paths


@router.get("", response_model=DatasetCatalogPageResponse)
def list_datasets(
    q: str = "",
    data_type: str | None = Query(default=None, alias="dataType"),
    label_status: str = Query(default="all", alias="labelStatus"),
    usage: str = "all",
    quality_status: str = Query(default="all", alias="qualityStatus"),
    sort_by: str = Query(default="createdAt", alias="sortBy"),
    sort_order: str = Query(default="desc", alias="sortOrder"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100, alias="pageSize"),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    all_user_datasets = session.scalars(select(Dataset).where(Dataset.user_id == user.id)).all()
    _ensure_quality_records(session, all_user_datasets)

    stmt = select(Dataset).where(Dataset.user_id == user.id)
    if q.strip():
        stmt = stmt.where(Dataset.name.ilike(f"%{q.strip()}%"))
    if data_type == "混合":
        stmt = stmt.where(False)
    if label_status == "labeled":
        stmt = stmt.where(Dataset.has_ground_truth.is_(True))
    elif label_status == "unlabeled":
        stmt = stmt.where(Dataset.has_ground_truth.is_(False))
    if quality_status in {"ready", "warning", "error"}:
        stmt = stmt.join(DatasetQuality).where(DatasetQuality.status == quality_status)
    if usage in {"used", "unused"}:
        referenced_dataset_ids = select(DatasetTask.dataset_id).where(DatasetTask.user_id == user.id)
        if usage == "used":
            stmt = stmt.where(Dataset.id.in_(referenced_dataset_ids))
        else:
            stmt = stmt.where(Dataset.id.not_in(referenced_dataset_ids))

    total = int(session.scalar(select(func.count()).select_from(stmt.subquery())) or 0)
    task_count_subquery = (
        select(DatasetTask.dataset_id, func.count(DatasetTask.id).label("task_count"))
        .where(DatasetTask.user_id == user.id)
        .group_by(DatasetTask.dataset_id)
        .subquery()
    )
    sort_columns = {
        "createdAt": Dataset.created_at,
        "name": Dataset.name,
        "sampleCount": Dataset.sample_count,
        "baseCount": Dataset.base_cluster_count,
        "taskCount": func.coalesce(task_count_subquery.c.task_count, 0),
    }
    sort_column = sort_columns.get(sort_by, Dataset.created_at)
    ordering = asc(sort_column) if sort_order == "asc" else desc(sort_column)
    page_stmt = (
        stmt.outerjoin(task_count_subquery, task_count_subquery.c.dataset_id == Dataset.id)
        .order_by(ordering, desc(Dataset.id))
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    datasets = session.scalars(page_stmt).all()
    qualities = {
        quality.dataset_id: quality
        for quality in session.scalars(
            select(DatasetQuality).where(DatasetQuality.dataset_id.in_([dataset.id for dataset in datasets])),
        ).all()
    }
    task_summaries = _task_summaries(session, [dataset.id for dataset in datasets])
    total_pages = max(1, (total + page_size - 1) // page_size) if total else 0

    return DatasetCatalogPageResponse(
        items=[
            _catalog_item(
                session,
                dataset,
                quality=qualities.get(dataset.id),
                task_summary=task_summaries.get(dataset.id),
            )
            for dataset in datasets
        ],
        total=total,
        page=page,
        pageSize=page_size,
        totalPages=total_pages,
    )


@router.post("", response_model=DatasetCatalogItemResponse)
async def upload_dataset(
    file: UploadFile = File(...),
    allow_duplicate: bool = Form(default=False, alias="allowDuplicate"),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if not file.filename:
        raise HTTPException(400, "未选择文件")

    content = await file.read()
    if not content:
        raise HTTPException(400, "上传文件为空")

    dataset_name = _dataset_name(file.filename)
    if not allow_duplicate and _find_name_conflict(session, user, dataset_name):
        raise HTTPException(409, f"已存在同名数据集“{dataset_name}”，请作为新版本更新或确认保留独立副本")

    parsed, file_hash, storage_path = _save_dataset_upload(user.id, file.filename, content)

    dataset = Dataset(
        user_id=user.id,
        name=dataset_name,
        original_filename=file.filename,
        storage_path=str(storage_path),
        file_hash=file_hash,
        sample_count=parsed["sampleCount"],
        base_cluster_count=parsed["baseCount"],
        has_ground_truth=parsed["hasLabels"],
        cluster_count=parsed["classCount"] if parsed["hasLabels"] else None,
        status="ready",
    )
    session.add(dataset)

    try:
        session.flush()
        quality = _upsert_quality(session, dataset, parsed)
        _record_revision(session, dataset, parsed, "uploaded", quality)
        session.commit()
        session.refresh(dataset)
    except Exception:
        session.rollback()
        if storage_path.exists():
            storage_path.unlink()
        raise

    return _catalog_item(session, dataset, parsed, quality)


@router.put("/{dataset_id}", response_model=DatasetCatalogItemResponse)
async def replace_dataset_file(
    dataset_id: int,
    file: UploadFile = File(...),
    allow_duplicate: bool = Form(default=False, alias="allowDuplicate"),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    dataset = _get_user_dataset(session, dataset_id, user)
    if not file.filename:
        raise HTTPException(400, "未选择文件")

    content = await file.read()
    if not content:
        raise HTTPException(400, "上传文件为空")

    next_name = _dataset_name(file.filename)
    if not allow_duplicate and _find_name_conflict(session, user, next_name, exclude_dataset_id=dataset.id):
        raise HTTPException(409, f"已存在同名数据集“{next_name}”，请确认是否保留独立副本")

    current_parsed = _parse_stored_dataset_file(dataset)
    current_quality = _quality_for_dataset(session, dataset, current_parsed)
    if _next_version(session, dataset.id) == 1:
        _record_revision(session, dataset, current_parsed, "uploaded", current_quality)

    parsed, file_hash, storage_path = _save_dataset_upload(user.id, file.filename, content)

    dataset.name = next_name
    dataset.original_filename = file.filename
    dataset.storage_path = str(storage_path)
    dataset.file_hash = file_hash
    dataset.sample_count = parsed["sampleCount"]
    dataset.base_cluster_count = parsed["baseCount"]
    dataset.has_ground_truth = parsed["hasLabels"]
    dataset.cluster_count = parsed["classCount"] if parsed["hasLabels"] else None
    dataset.status = "ready"
    dataset.created_at = datetime.now().replace(microsecond=0)

    try:
        session.flush()
        quality = _upsert_quality(session, dataset, parsed)
        _record_revision(session, dataset, parsed, "replaced", quality)
        session.commit()
        session.refresh(dataset)
    except Exception:
        session.rollback()
        if storage_path.exists():
            storage_path.unlink()
        raise

    return _catalog_item(session, dataset, parsed, quality)


@router.patch("/{dataset_id}", response_model=DatasetCatalogItemResponse)
def rename_dataset(
    dataset_id: int,
    payload: DatasetRenameRequest,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    dataset = _get_user_dataset(session, dataset_id, user)
    next_name = payload.name.strip()
    if not payload.allowDuplicate and _find_name_conflict(session, user, next_name, exclude_dataset_id=dataset.id):
        raise HTTPException(409, f"已存在同名数据集“{next_name}”，请更换名称或确认保留重名副本")

    dataset.name = next_name
    parsed = _parse_stored_dataset_file(dataset)
    quality = _quality_for_dataset(session, dataset, parsed)
    _record_revision(session, dataset, parsed, "renamed", quality)
    session.commit()
    session.refresh(dataset)
    return _catalog_item(session, dataset, parsed, quality)


@router.post("/bulk-delete", response_model=MessageResponse)
def bulk_delete_datasets(
    payload: DatasetBulkRequest,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    datasets = session.scalars(
        select(Dataset).where(Dataset.user_id == user.id, Dataset.id.in_(payload.datasetIds)),
    ).all()
    if len(datasets) != len(set(payload.datasetIds)):
        raise HTTPException(404, "部分数据集不存在或无权访问")

    storage_paths = _delete_datasets(session, datasets)
    for storage_path in storage_paths:
        try:
            if storage_path.exists():
                storage_path.unlink()
        except OSError:
            pass
    return MessageResponse(message=f"已删除 {len(datasets)} 个数据集")


@router.post("/export")
def export_datasets(
    payload: DatasetBulkRequest,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    datasets = session.scalars(
        select(Dataset).where(Dataset.user_id == user.id, Dataset.id.in_(payload.datasetIds)),
    ).all()
    if len(datasets) != len(set(payload.datasetIds)):
        raise HTTPException(404, "部分数据集不存在或无权访问")

    archive = io.BytesIO()
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as zip_file:
        for dataset in datasets:
            storage_path = Path(dataset.storage_path)
            if storage_path.exists():
                zip_file.write(storage_path, arcname=f"{dataset.name}_{dataset.id}{storage_path.suffix}")
    archive.seek(0)
    return StreamingResponse(
        archive,
        media_type="application/zip",
        headers={"Content-Disposition": "attachment; filename=datasets-export.zip"},
    )


def _revision_response(revision: DatasetRevision) -> DatasetRevisionResponse:
    return DatasetRevisionResponse(
        id=revision.id,
        version=revision.version,
        action=revision.action,
        name=revision.name,
        originalFilename=revision.original_filename,
        createdAt=revision.created_at.strftime("%Y-%m-%d %H:%M:%S") if revision.created_at else "",
        sampleCount=revision.sample_count,
        baseCount=revision.base_cluster_count,
        classCount=revision.cluster_count or 0,
        hasLabels=revision.has_ground_truth,
        qualityStatus=revision.quality_status,
        qualityIssues=_decode_issues(revision.quality_issues_json),
    )


@router.get("/{dataset_id}/versions", response_model=list[DatasetRevisionResponse])
def list_dataset_versions(
    dataset_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    _get_user_dataset(session, dataset_id, user)
    revisions = session.scalars(
        select(DatasetRevision)
        .where(DatasetRevision.dataset_id == dataset_id)
        .order_by(DatasetRevision.version.desc()),
    ).all()
    return [_revision_response(revision) for revision in revisions]


@router.post("/{dataset_id}/quality", response_model=DatasetCatalogItemResponse)
def recheck_dataset_quality(
    dataset_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    dataset = _get_user_dataset(session, dataset_id, user)
    parsed = _parse_stored_dataset_file(dataset)
    quality = _upsert_quality(session, dataset, parsed)
    session.commit()
    session.refresh(dataset)
    return _catalog_item(session, dataset, parsed, quality)


@router.delete("/{dataset_id}", response_model=MessageResponse)
def delete_dataset(
    dataset_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    dataset = _get_user_dataset(session, dataset_id, user)
    storage_paths = _delete_datasets(session, [dataset])
    for storage_path in storage_paths:
        try:
            if storage_path.exists():
                storage_path.unlink()
        except OSError:
            pass

    return MessageResponse(message="数据集已删除")


@router.get("/example-mat")
def read_example_mat():
    mat_path = (
        Path(__file__).parent.parent.parent
        / "ec_python_converted"
        / "data"
        / "ionosphere_base_clustering.mat"
    )

    if not mat_path.exists():
        raise HTTPException(404, ".mat file not found")

    mat = sio.loadmat(str(mat_path))
    variables = {}

    for name, value in mat.items():
        if name.startswith("__"):
            continue
        variables[name] = {
            "shape": _variable_shape(value),
            "dtype": str(value.dtype),
        }

    e_shape = variables.get("E", {}).get("shape", [0, 0])

    return {
        "path": str(mat_path),
        "variables": variables,
        "sampleCount": e_shape[0],
        "baseCount": e_shape[1],
        "hasLabels": "y" in variables,
    }


@router.post("/parse")
async def parse_dataset_file(file: UploadFile = File(...)):
    if not file.filename:
        raise HTTPException(400, "未选择文件")

    content = await file.read()
    return _parse_mat_content(file.filename, content)
