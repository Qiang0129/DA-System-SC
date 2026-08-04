import asyncio
import hashlib
import io
import json
import logging
import multiprocessing
import os
import pickle
import re
import shutil
import tempfile
import zipfile
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import scipy.io as sio
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy import asc, case, desc, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .auth import get_current_user
from .config import get_settings
from .database import get_session
from .models import AnalysisTask, Dataset, DatasetQuality, DatasetRevision, OperationLog, User
from .schemas import (
    DatasetBulkRequest,
    DatasetCatalogItemResponse,
    DatasetCatalogPageResponse,
    DatasetParseResponse,
    DatasetRenameRequest,
    DatasetRevisionResponse,
    MessageResponse,
)

router = APIRouter(prefix="/api/datasets", tags=["datasets"])
LABEL_VARIABLE_NAMES = ("y", "label", "labels")
SAFE_FILENAME_PATTERN = re.compile(r"[^0-9A-Za-z._-]+")
UPLOAD_CHUNK_SIZE = 1024 * 1024
logger = logging.getLogger(__name__)


class MatValidationError(ValueError):
    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.status_code = status_code


@dataclass(frozen=True)
class MatLimits:
    max_file_size_bytes: int
    max_matrix_rows: int
    max_matrix_columns: int
    max_variables: int
    timeout_seconds: float


@dataclass
class StagedUpload:
    path: Path
    filename: str
    size: int
    file_hash: str

    def cleanup(self) -> None:
        try:
            self.path.unlink(missing_ok=True)
        except OSError:
            logger.warning("清理临时数据集文件失败：%s", self.path.name)


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


def _mat_limits() -> MatLimits:
    settings = get_settings()
    return MatLimits(
        max_file_size_bytes=int(settings.max_dataset_file_size_mb) * 1024 * 1024,
        max_matrix_rows=int(settings.max_matrix_rows),
        max_matrix_columns=int(settings.max_matrix_columns),
        max_variables=int(settings.max_mat_variables),
        timeout_seconds=float(settings.dataset_parse_timeout_seconds),
    )


def _visible_mat_variables(mat: dict) -> dict:
    return {name: value for name, value in mat.items() if not name.startswith("__")}


def _validate_loaded_mat(mat: dict, limits: MatLimits) -> None:
    variables = _visible_mat_variables(mat)
    if not variables:
        raise MatValidationError(".mat 文件不包含可用变量")
    if len(variables) > limits.max_variables:
        raise MatValidationError(
            f".mat 文件变量数量超过限制（最多 {limits.max_variables} 个）",
            status_code=413,
        )

    for name, value in variables.items():
        if not isinstance(value, np.ndarray):
            raise MatValidationError(f"变量“{name}”结构异常，仅支持 NumPy 数组")
        if value.dtype.hasobject or value.dtype.kind in {"O", "V"}:
            raise MatValidationError(f"变量“{name}”包含不支持的对象类型")
        if value.ndim not in {1, 2}:
            raise MatValidationError(f"变量“{name}”结构异常，仅支持一维或二维数组")
        if any(int(dimension) <= 0 for dimension in value.shape):
            raise MatValidationError(f"变量“{name}”包含空维度")

        if value.ndim == 1 and value.shape[0] > limits.max_matrix_rows:
            raise MatValidationError(
                f"变量“{name}”长度超过限制（最多 {limits.max_matrix_rows} 行）",
                status_code=413,
            )
        if value.ndim == 2:
            rows, columns = (int(value.shape[0]), int(value.shape[1]))
            if rows > limits.max_matrix_rows:
                raise MatValidationError(
                    f"矩阵行数超过限制（最多 {limits.max_matrix_rows} 行）",
                    status_code=413,
                )
            if columns > limits.max_matrix_columns:
                raise MatValidationError(
                    f"矩阵列数超过限制（最多 {limits.max_matrix_columns} 列）",
                    status_code=413,
                )

        if np.issubdtype(value.dtype, np.number):
            try:
                finite = np.isfinite(value)
            except TypeError as exc:
                raise MatValidationError(f"变量“{name}”数值结构异常") from exc
            if not bool(np.all(finite)):
                raise MatValidationError(f"变量“{name}”包含 NaN 或 Inf")

    variable_info = {
        name: {"shape": _variable_shape(value), "dtype": str(value.dtype)}
        for name, value in variables.items()
    }
    main_variable, _ = _find_main_variable(mat, variable_info)
    if not main_variable:
        raise MatValidationError("未检测到有效的二维基础聚类矩阵")
    main_matrix = variables[main_variable]
    if main_matrix.ndim != 2 or not np.issubdtype(main_matrix.dtype, np.number):
        raise MatValidationError("基础聚类矩阵必须是二维数值数组")


def _mat_parse_worker(
    source_path: str,
    result_path: str,
    filename: str,
    max_matrix_rows: int,
    max_matrix_columns: int,
    max_variables: int,
    result_queue,
) -> None:
    limits = MatLimits(
        max_file_size_bytes=0,
        max_matrix_rows=max_matrix_rows,
        max_matrix_columns=max_matrix_columns,
        max_variables=max_variables,
        timeout_seconds=0,
    )
    try:
        mat = sio.loadmat(source_path)
        _validate_loaded_mat(mat, limits)
        parsed = _parse_loaded_mat(filename, mat)
        if result_path:
            with Path(result_path).open("wb") as output:
                pickle.dump(_visible_mat_variables(mat), output, protocol=pickle.HIGHEST_PROTOCOL)
        result_queue.put({"ok": True, "parsed": parsed})
    except MatValidationError as exc:
        result_queue.put(
            {
                "ok": False,
                "statusCode": exc.status_code,
                "message": str(exc),
            },
        )
    except Exception:
        result_queue.put(
            {
                "ok": False,
                "statusCode": 400,
                "message": "无法解析 .mat 文件",
            },
        )


def _controlled_parse_mat_file(
    source_path: Path,
    filename: str,
    *,
    include_mat: bool = False,
    limits: MatLimits | None = None,
) -> tuple[dict, dict | None]:
    limits = limits or _mat_limits()
    try:
        file_size = source_path.stat().st_size
    except OSError as exc:
        raise HTTPException(400, "上传文件临时副本不可用") from exc
    if file_size <= 0:
        raise HTTPException(400, "上传文件为空")
    if file_size > limits.max_file_size_bytes:
        raise HTTPException(
            413,
            f"文件大小超过限制（最大 {limits.max_file_size_bytes // (1024 * 1024)} MB）",
        )

    result_path: Path | None = None
    if include_mat:
        result_file = tempfile.NamedTemporaryFile(prefix="soft-web-mat-", suffix=".pickle", delete=False)
        result_path = Path(result_file.name)
        result_file.close()

    context = multiprocessing.get_context("spawn")
    result_queue = context.Queue(maxsize=1)
    process = context.Process(
        target=_mat_parse_worker,
        args=(
            str(source_path),
            str(result_path) if result_path else "",
            _safe_filename(filename),
            limits.max_matrix_rows,
            limits.max_matrix_columns,
            limits.max_variables,
            result_queue,
        ),
    )

    try:
        process.start()
        process.join(limits.timeout_seconds)
        if process.is_alive():
            process.terminate()
            process.join(2)
            if process.is_alive():
                process.kill()
                process.join()
            raise HTTPException(408, "数据集解析超时，请检查文件复杂度")

        try:
            result = result_queue.get(timeout=2)
        except Exception as exc:
            raise HTTPException(400, "无法解析 .mat 文件") from exc

        if not result.get("ok"):
            status_code = int(result.get("statusCode") or 400)
            message = str(result.get("message") or "无法解析 .mat 文件")
            raise HTTPException(status_code, message)

        parsed = result["parsed"]
        parsed_mat = None
        if result_path is not None:
            with result_path.open("rb") as source:
                parsed_mat = pickle.load(source)
        return parsed, parsed_mat
    finally:
        if result_path is not None:
            try:
                result_path.unlink(missing_ok=True)
            except OSError:
                logger.warning("清理矩阵临时交换文件失败：%s", result_path.name)
        result_queue.close()
        result_queue.join_thread()
        if process.pid is not None:
            process.close()


def _find_main_variable(mat: dict, variables: dict) -> tuple[str | None, list[int]]:
    # 默认优先使用 E；没有 E 时，使用面积最大的二维矩阵作为基础聚类矩阵。
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

    return main_var, main_shape


def _parse_loaded_mat(filename: str, mat: dict) -> dict:
    variables = {}
    for name, value in _visible_mat_variables(mat).items():
        variables[name] = {
            "shape": _variable_shape(value),
            "dtype": str(value.dtype),
        }

    main_var, main_shape = _find_main_variable(mat, variables)
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


def _parse_mat_content(filename: str, content: bytes) -> dict:
    if not filename.lower().endswith(".mat"):
        raise HTTPException(400, f"不支持的文件格式: {filename}，目前仅支持 .mat")
    limits = _mat_limits()
    if len(content) > limits.max_file_size_bytes:
        raise HTTPException(
            413,
            f"文件大小超过限制（最大 {limits.max_file_size_bytes // (1024 * 1024)} MB）",
        )
    staged_file = tempfile.NamedTemporaryFile(prefix="soft-web-mat-", suffix=".mat", delete=False)
    staged_path = Path(staged_file.name)
    try:
        staged_file.write(content)
        staged_file.close()
        parsed, _ = _controlled_parse_mat_file(staged_path, filename, limits=limits)
        return parsed
    finally:
        try:
            staged_file.close()
        except OSError:
            pass
        try:
            staged_path.unlink(missing_ok=True)
        except OSError:
            logger.warning("清理矩阵临时文件失败：%s", staged_path.name)


def _persist_parse_log(
    session: Session,
    user: User,
    *,
    filename: str,
    success: bool,
    detail: dict,
) -> None:
    """解析接口单独提交审计日志，避免日志事务影响文件解析结果。"""
    session.add(
        OperationLog(
            user_id=user.id,
            action="dataset_parse" if success else "dataset_parse_failed",
            level="info" if success else "error",
            message=("数据集文件解析成功：" if success else "数据集文件解析失败：") + filename,
            detail_json=json.dumps(detail, ensure_ascii=False),
        ),
    )
    try:
        session.commit()
    except Exception:
        session.rollback()
        logger.exception("写入数据集解析操作日志失败")


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
        parsed, _ = _controlled_parse_mat_file(path, dataset.original_filename)
        return parsed
    except HTTPException:
        return {}


def _stored_file_size(dataset: Dataset) -> int:
    path = Path(dataset.storage_path)
    if not path.exists():
        return 0
    return path.stat().st_size


def _task_summaries(
    session: Session,
    user_id: int,
    dataset_ids: list[int],
) -> dict[int, tuple[int, datetime | None]]:
    if not dataset_ids:
        return {}

    rows = session.execute(
        select(
            AnalysisTask.dataset_id,
            func.count(AnalysisTask.id),
            func.max(
                case(
                    (AnalysisTask.status == "succeeded", AnalysisTask.finished_at),
                    else_=None,
                ),
            ),
        )
        .where(
            AnalysisTask.user_id == user_id,
            AnalysisTask.dataset_id.in_(dataset_ids),
        )
        .group_by(AnalysisTask.dataset_id),
    ).all()
    return {int(dataset_id): (int(count), last_finished_at) for dataset_id, count, last_finished_at in rows}


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
    task_count, last_analysis_at = task_summary or _task_summaries(
        session,
        dataset.user_id,
        [dataset.id],
    ).get(dataset.id, (0, None))

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


async def _stage_upload(file: UploadFile) -> StagedUpload:
    filename = file.filename or ""
    if not filename:
        raise HTTPException(400, "未选择文件")
    if Path(filename).suffix.lower() != ".mat":
        raise HTTPException(400, f"不支持的文件格式: {filename}，目前仅支持 .mat")

    limits = _mat_limits()
    staged_file = tempfile.NamedTemporaryFile(prefix="soft-web-upload-", suffix=".mat", delete=False)
    staged_path = Path(staged_file.name)
    digest = hashlib.sha256()
    size = 0
    try:
        while True:
            chunk = await file.read(UPLOAD_CHUNK_SIZE)
            if not chunk:
                break
            size += len(chunk)
            if size > limits.max_file_size_bytes:
                raise HTTPException(
                    413,
                    f"文件大小超过限制（最大 {limits.max_file_size_bytes // (1024 * 1024)} MB）",
                )
            staged_file.write(chunk)
            digest.update(chunk)
        staged_file.close()
        if size == 0:
            raise HTTPException(400, "上传文件为空")
        return StagedUpload(
            path=staged_path,
            filename=filename,
            size=size,
            file_hash=digest.hexdigest(),
        )
    except Exception:
        try:
            staged_file.close()
        except OSError:
            pass
        try:
            staged_path.unlink(missing_ok=True)
        except OSError:
            logger.warning("清理上传临时文件失败：%s", staged_path.name)
        raise


def _storage_directory(user_id: int) -> Path:
    settings = get_settings()
    return Path(settings.dataset_storage_dir) / str(user_id)


def _storage_usage_bytes(user_id: int) -> int:
    storage_dir = _storage_directory(user_id)
    if not storage_dir.exists():
        return 0
    total = 0
    for path in storage_dir.rglob("*"):
        try:
            if path.is_file():
                total += path.stat().st_size
        except OSError:
            continue
    return total


def _ensure_user_storage_quota(user_id: int, additional_bytes: int) -> None:
    settings = get_settings()
    quota_bytes = int(settings.user_storage_quota_mb) * 1024 * 1024
    used_bytes = _storage_usage_bytes(user_id)
    if used_bytes + additional_bytes > quota_bytes:
        used_mb = round(used_bytes / (1024 * 1024), 2)
        quota_mb = int(settings.user_storage_quota_mb)
        raise HTTPException(
            413,
            f"用户存储空间不足：已使用 {used_mb} MB，配额为 {quota_mb} MB",
        )


def _file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        while True:
            chunk = source.read(UPLOAD_CHUNK_SIZE)
            if not chunk:
                break
            digest.update(chunk)
    return digest.hexdigest()


def _save_staged_upload(user_id: int, staged: StagedUpload, filename: str | None = None) -> tuple[str, Path]:
    filename = filename or staged.filename
    storage_dir = _storage_directory(user_id)
    storage_dir.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S%f")
    storage_path = storage_dir / f"{timestamp}_{staged.file_hash[:12]}_{_safe_filename(filename)}"
    temporary_storage = tempfile.NamedTemporaryFile(
        prefix=".soft-web-storage-",
        suffix=".tmp",
        dir=storage_dir,
        delete=False,
    )
    temporary_path = Path(temporary_storage.name)
    try:
        temporary_storage.close()
        with staged.path.open("rb") as source, temporary_path.open("wb") as destination:
            shutil.copyfileobj(source, destination, length=UPLOAD_CHUNK_SIZE)
        os.replace(temporary_path, storage_path)
    except Exception:
        try:
            temporary_path.unlink(missing_ok=True)
        except OSError:
            logger.warning("清理存储临时文件失败：%s", temporary_path.name)
        raise

    return staged.file_hash, storage_path


def _raw_label_values(value) -> np.ndarray:
    return np.asarray(value).squeeze().reshape(-1)


def _merge_label_values(current_value, incoming_value) -> np.ndarray:
    current_labels = _raw_label_values(current_value)
    incoming_labels = _raw_label_values(incoming_value)
    combined_labels = np.concatenate([current_labels, incoming_labels], axis=0)

    current_array = np.asarray(current_value)
    if current_array.ndim == 2 and current_array.shape[1] == 1:
        return combined_labels.reshape(-1, 1)
    if current_array.ndim == 2 and current_array.shape[0] == 1:
        return combined_labels.reshape(1, -1)
    return combined_labels


def _build_appended_mat_file(
    current_path: Path,
    current_filename: str,
    incoming_path: Path,
    incoming_filename: str,
    output_path: Path,
    limits: MatLimits,
) -> dict:
    current_parsed, current_mat = _controlled_parse_mat_file(
        current_path,
        current_filename,
        include_mat=True,
        limits=limits,
    )
    incoming_parsed, incoming_mat = _controlled_parse_mat_file(
        incoming_path,
        incoming_filename,
        include_mat=True,
        limits=limits,
    )
    if current_mat is None or incoming_mat is None:
        raise HTTPException(400, "无法读取追加数据的矩阵内容")

    current_main_var = current_parsed.get("mainVariable")
    incoming_main_var = incoming_parsed.get("mainVariable")
    if not current_main_var:
        raise HTTPException(400, "当前数据集缺少有效的基础聚类矩阵，无法追加")
    if not incoming_main_var:
        raise HTTPException(400, "追加文件缺少有效的基础聚类矩阵")

    current_matrix = np.asarray(current_mat[current_main_var])
    incoming_matrix = np.asarray(incoming_mat[incoming_main_var])
    if current_matrix.ndim < 2 or incoming_matrix.ndim < 2:
        raise HTTPException(400, "基础聚类矩阵必须是二维结构，无法追加")
    if current_matrix.shape[1:] != incoming_matrix.shape[1:]:
        raise HTTPException(400, "追加文件的基础聚类矩阵列数必须与当前数据集一致")

    current_has_labels = bool(current_parsed.get("hasLabels"))
    incoming_has_labels = bool(incoming_parsed.get("hasLabels"))
    if current_has_labels != incoming_has_labels:
        raise HTTPException(400, "追加文件的标签状态必须与当前数据集一致")

    combined_mat = _visible_mat_variables(current_mat)
    combined_mat[current_main_var] = np.concatenate([current_matrix, incoming_matrix], axis=0)

    if current_has_labels:
        current_label_var = current_parsed.get("labelVariable")
        incoming_label_var = incoming_parsed.get("labelVariable")
        if not current_label_var or not incoming_label_var:
            raise HTTPException(400, "追加文件的标签变量无法识别")

        current_labels = _raw_label_values(current_mat[current_label_var])
        incoming_labels = _raw_label_values(incoming_mat[incoming_label_var])
        if current_labels.size != int(current_parsed.get("sampleCount") or 0):
            raise HTTPException(400, "当前数据集的标签数量与样本数量不一致，无法追加")
        if incoming_labels.size != int(incoming_parsed.get("sampleCount") or 0):
            raise HTTPException(400, "追加文件的标签数量与样本数量不一致")

        combined_mat[current_label_var] = _merge_label_values(
            current_mat[current_label_var],
            incoming_mat[incoming_label_var],
        )

    _validate_loaded_mat(combined_mat, limits)
    sio.savemat(str(output_path), combined_mat)
    output_size = output_path.stat().st_size
    if output_size > limits.max_file_size_bytes:
        raise HTTPException(
            413,
            f"追加后的文件大小超过限制（最大 {limits.max_file_size_bytes // (1024 * 1024)} MB）",
        )
    parsed, _ = _controlled_parse_mat_file(output_path, current_filename, limits=limits)
    return parsed


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
        select(func.count(AnalysisTask.id)).where(AnalysisTask.dataset_id.in_(dataset_ids)),
    )
    if task_count:
        raise HTTPException(409, f"数据集仍被 {task_count} 个分析任务引用，请先删除关联任务后再删除数据集")

    revision_paths = session.scalars(
        select(DatasetRevision.storage_path).where(DatasetRevision.dataset_id.in_(dataset_ids)),
    ).all()
    storage_paths = {Path(path) for path in revision_paths}
    storage_paths.update(Path(dataset.storage_path) for dataset in datasets)

    for dataset in datasets:
        session.delete(dataset)
    try:
        session.commit()
    except IntegrityError as exc:
        session.rollback()
        raise HTTPException(409, "数据集已被分析任务引用，请先删除关联任务后再删除数据集") from exc
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
        referenced_dataset_ids = select(AnalysisTask.dataset_id).where(AnalysisTask.user_id == user.id)
        if usage == "used":
            stmt = stmt.where(Dataset.id.in_(referenced_dataset_ids))
        else:
            stmt = stmt.where(Dataset.id.not_in(referenced_dataset_ids))

    total = int(session.scalar(select(func.count()).select_from(stmt.subquery())) or 0)
    task_count_subquery = (
        select(AnalysisTask.dataset_id, func.count(AnalysisTask.id).label("task_count"))
        .where(AnalysisTask.user_id == user.id)
        .group_by(AnalysisTask.dataset_id)
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
    task_summaries = _task_summaries(session, user.id, [dataset.id for dataset in datasets])
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
    staged: StagedUpload | None = None
    storage_path: Path | None = None
    try:
        staged = await _stage_upload(file)
        dataset_name = _dataset_name(staged.filename)
        if not allow_duplicate and _find_name_conflict(session, user, dataset_name):
            raise HTTPException(409, f"已存在同名数据集“{dataset_name}”，请使用追加数据或确认保留独立副本")

        _ensure_user_storage_quota(user.id, staged.size)
        parsed, _ = await asyncio.to_thread(_controlled_parse_mat_file, staged.path, staged.filename)
        file_hash, storage_path = await asyncio.to_thread(_save_staged_upload, user.id, staged)

        dataset = Dataset(
            user_id=user.id,
            name=dataset_name,
            original_filename=staged.filename,
            storage_path=str(storage_path),
            file_hash=file_hash,
            sample_count=parsed["sampleCount"],
            base_cluster_count=parsed["baseCount"],
            has_ground_truth=parsed["hasLabels"],
            cluster_count=parsed["classCount"] if parsed["hasLabels"] else None,
            status="ready",
        )
        session.add(dataset)
        session.flush()
        quality = _upsert_quality(session, dataset, parsed)
        _record_revision(session, dataset, parsed, "uploaded", quality)
        session.flush()
        session.refresh(dataset)
        response = _catalog_item(session, dataset, parsed, quality)
        session.commit()
    except Exception:
        session.rollback()
        if storage_path is not None:
            storage_path.unlink(missing_ok=True)
        raise
    finally:
        if staged is not None:
            staged.cleanup()

    return response


@router.put("/{dataset_id}", response_model=DatasetCatalogItemResponse)
async def replace_dataset_file(
    dataset_id: int,
    file: UploadFile = File(...),
    allow_duplicate: bool = Form(default=False, alias="allowDuplicate"),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    dataset = _get_user_dataset(session, dataset_id, user)
    staged: StagedUpload | None = None
    storage_path: Path | None = None
    try:
        staged = await _stage_upload(file)
        next_name = _dataset_name(staged.filename)
        if not allow_duplicate and _find_name_conflict(session, user, next_name, exclude_dataset_id=dataset.id):
            raise HTTPException(409, f"已存在同名数据集“{next_name}”，请确认是否保留独立副本")

        _ensure_user_storage_quota(user.id, staged.size)
        current_path = Path(dataset.storage_path)
        current_parsed, _ = await asyncio.to_thread(
            _controlled_parse_mat_file,
            current_path,
            dataset.original_filename,
        )
        current_quality = _quality_for_dataset(session, dataset, current_parsed)
        if _next_version(session, dataset.id) == 1:
            _record_revision(session, dataset, current_parsed, "uploaded", current_quality)

        parsed, _ = await asyncio.to_thread(_controlled_parse_mat_file, staged.path, staged.filename)
        file_hash, storage_path = await asyncio.to_thread(_save_staged_upload, user.id, staged)

        dataset.name = next_name
        dataset.original_filename = staged.filename
        dataset.storage_path = str(storage_path)
        dataset.file_hash = file_hash
        dataset.sample_count = parsed["sampleCount"]
        dataset.base_cluster_count = parsed["baseCount"]
        dataset.has_ground_truth = parsed["hasLabels"]
        dataset.cluster_count = parsed["classCount"] if parsed["hasLabels"] else None
        dataset.status = "ready"
        dataset.created_at = datetime.now().replace(microsecond=0)

        session.flush()
        quality = _upsert_quality(session, dataset, parsed)
        _record_revision(session, dataset, parsed, "replaced", quality)
        session.flush()
        session.refresh(dataset)
        response = _catalog_item(session, dataset, parsed, quality)
        session.commit()
    except Exception:
        session.rollback()
        if storage_path is not None:
            storage_path.unlink(missing_ok=True)
        raise
    finally:
        if staged is not None:
            staged.cleanup()

    return response


@router.post("/{dataset_id}/append", response_model=DatasetCatalogItemResponse)
async def append_dataset_file(
    dataset_id: int,
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    dataset = _get_user_dataset(session, dataset_id, user)
    staged: StagedUpload | None = None
    output_staged: StagedUpload | None = None
    output_path: Path | None = None
    storage_path: Path | None = None
    try:
        staged = await _stage_upload(file)
        current_path = Path(dataset.storage_path)
        if not current_path.exists():
            raise HTTPException(409, "当前数据集文件不存在，无法追加")

        current_parsed, _ = await asyncio.to_thread(
            _controlled_parse_mat_file,
            current_path,
            dataset.original_filename,
        )
        current_quality = _quality_for_dataset(session, dataset, current_parsed)
        if _next_version(session, dataset.id) == 1:
            _record_revision(session, dataset, current_parsed, "uploaded", current_quality)

        output_file = tempfile.NamedTemporaryFile(prefix="soft-web-append-", suffix=".mat", delete=False)
        output_path = Path(output_file.name)
        output_file.close()
        parsed = await asyncio.to_thread(
            _build_appended_mat_file,
            current_path,
            dataset.original_filename,
            staged.path,
            staged.filename,
            output_path,
            _mat_limits(),
        )
        output_staged = StagedUpload(
            path=output_path,
            filename=dataset.original_filename,
            size=output_path.stat().st_size,
            file_hash=await asyncio.to_thread(_file_sha256, output_path),
        )
        _ensure_user_storage_quota(user.id, output_staged.size)
        file_hash, storage_path = await asyncio.to_thread(
            _save_staged_upload,
            user.id,
            output_staged,
            dataset.original_filename,
        )

        dataset.storage_path = str(storage_path)
        dataset.file_hash = file_hash
        dataset.sample_count = parsed["sampleCount"]
        dataset.base_cluster_count = parsed["baseCount"]
        dataset.has_ground_truth = parsed["hasLabels"]
        dataset.cluster_count = parsed["classCount"] if parsed["hasLabels"] else None
        dataset.status = "ready"

        session.flush()
        quality = _upsert_quality(session, dataset, parsed)
        _record_revision(session, dataset, parsed, "appended", quality)
        session.flush()
        session.refresh(dataset)
        response = _catalog_item(session, dataset, parsed, quality)
        session.commit()
    except Exception:
        session.rollback()
        if storage_path is not None:
            storage_path.unlink(missing_ok=True)
        raise
    finally:
        if staged is not None:
            staged.cleanup()
        if output_staged is not None:
            output_staged.cleanup()
        elif output_path is not None:
            output_path.unlink(missing_ok=True)

    return response


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
def read_example_mat(user: User = Depends(get_current_user)):
    if get_settings().app_env.strip().lower() == "production":
        raise HTTPException(404, "示例数据接口仅在开发环境启用")

    mat_path = (
        Path(__file__).parent.parent.parent
        / "ec_python_converted"
        / "data"
        / "ionosphere_base_clustering.mat"
    )

    if not mat_path.exists():
        raise HTTPException(404, ".mat file not found")

    parsed, _ = _controlled_parse_mat_file(mat_path, mat_path.name)

    return {
        "variables": parsed["variables"],
        "sampleCount": parsed["sampleCount"],
        "baseCount": parsed["baseCount"],
        "hasLabels": parsed["hasLabels"],
    }


@router.post("/parse", response_model=DatasetParseResponse)
async def parse_dataset_file(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    source_filename = file.filename or ""
    safe_filename = _safe_filename(source_filename) if source_filename else "unknown"
    staged: StagedUpload | None = None

    try:
        staged = await _stage_upload(file)
        parsed, _ = await asyncio.to_thread(_controlled_parse_mat_file, staged.path, staged.filename)
    except HTTPException as exc:
        session.rollback()
        _persist_parse_log(
            session,
            user,
            filename=safe_filename,
            success=False,
            detail={"statusCode": exc.status_code, "errorType": type(exc).__name__},
        )
        logger.error("数据集文件解析失败：%s（状态码：%s）", safe_filename, exc.status_code)
        raise
    except Exception as exc:
        session.rollback()
        _persist_parse_log(
            session,
            user,
            filename=safe_filename,
            success=False,
            detail={"statusCode": 500, "errorType": type(exc).__name__},
        )
        logger.exception("数据集文件解析出现未预期异常：%s", safe_filename)
        raise HTTPException(500, "数据集解析失败") from exc
    else:
        _persist_parse_log(
            session,
            user,
            filename=safe_filename,
            success=True,
            detail={
                "sampleCount": parsed.get("sampleCount", 0),
                "baseCount": parsed.get("baseCount", 0),
                "classCount": parsed.get("classCount", 0),
                "hasLabels": bool(parsed.get("hasLabels")),
            },
        )
        return parsed
    finally:
        if staged is not None:
            staged.cleanup()
