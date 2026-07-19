from __future__ import annotations

from collections.abc import Callable
from pathlib import Path
from time import perf_counter
from typing import Any

import numpy as np

from ._threading import limit_threads
from .clustering import ncut_compute
from .data_loader import load_ensemble_data
from .ensemble import gbe
from .kernel import get_kernel_fast_mat, get_similarity_kernel1
from .metrics import my_nmi_acc
from .solver import solver_aktec1, solver_aktec_large


ProgressCallback = Callable[[dict[str, Any]], None]


def _emit(callback: ProgressCallback | None, **event: Any) -> None:
    if callback is not None:
        callback(event)


def _two_dimensional_projection(features: np.ndarray) -> np.ndarray:
    """使用确定性的 SVD 得到二维坐标，避免可视化结果随浏览器或运行环境漂移。"""
    values = np.asarray(features, dtype=float)
    if values.ndim != 2:
        raise ValueError("用于降维的特征必须是二维矩阵")
    centered = values - np.mean(values, axis=0, keepdims=True)
    if centered.shape[0] == 1:
        return np.zeros((1, 2), dtype=float)
    u, singular_values, _ = np.linalg.svd(centered, full_matrices=False)
    dimensions = min(2, u.shape[1], singular_values.shape[0])
    projected = u[:, :dimensions] * singular_values[:dimensions]
    if dimensions < 2:
        projected = np.pad(projected, ((0, 0), (0, 2 - dimensions)))
    return projected[:, :2]


def _omelet_features(consensus: np.ndarray) -> np.ndarray:
    symmetric = 0.5 * (np.asarray(consensus, dtype=float) + np.asarray(consensus, dtype=float).T)
    eigenvalues, eigenvectors = np.linalg.eigh(symmetric)
    order = np.argsort(eigenvalues)[::-1]
    dimensions = min(max(2, min(8, symmetric.shape[0])), symmetric.shape[0])
    return eigenvectors[:, order[:dimensions]]


def run_analysis(
    data_path: str | Path,
    *,
    mode: str,
    n_base: int,
    sigma: float,
    lam: float,
    gamma: float,
    anchor: int,
    runs: int,
    max_iter: int,
    random_seed: int = 1,
    progress_callback: ProgressCallback | None = None,
) -> dict[str, Any]:
    """执行真实 OMELET 分析并返回每轮结果和代表轮次的完整矩阵。"""
    limit_threads(1)
    ensemble, ground_truth = load_ensemble_data(data_path)
    ensemble = np.asarray(ensemble)
    ground_truth = np.asarray(ground_truth).reshape(-1)

    if ensemble.ndim != 2 or ensemble.shape[0] != ground_truth.shape[0]:
        raise ValueError("基础聚类矩阵 E 与真实标签 y 的样本数不一致")
    if not np.issubdtype(ensemble.dtype, np.number) or not np.all(np.isfinite(ensemble)):
        raise ValueError("基础聚类矩阵 E 必须是有限数值矩阵")
    if len(np.unique(ground_truth)) < 2:
        raise ValueError("真实标签 y 至少需要包含两个类别")
    if n_base < 1 or n_base > ensemble.shape[1]:
        raise ValueError(f"n_base 必须位于 1 到 {ensemble.shape[1]} 之间")
    if sigma <= 0 or lam <= 0 or gamma <= 0 or runs < 1 or max_iter < 1:
        raise ValueError("sigma、lambda、gamma、runs 与 max_iter 必须大于 0")

    mode = mode.upper()
    if mode not in {"OMELET", "OMELET-SV"}:
        raise ValueError(f"不支持的算法模式: {mode}")

    cluster_count = len(np.unique(ground_truth))
    sample_count = ensemble.shape[0]
    run_results: list[dict[str, Any]] = []
    _emit(progress_callback, type="stage", stage="select_base", progress=1.0)

    for run_index in range(1, runs + 1):
        run_started = perf_counter()
        seed = int(random_seed) + run_index - 1
        rng = np.random.default_rng(seed)
        selected_columns = rng.permutation(ensemble.shape[1])[:n_base]
        selected_ensemble = ensemble[:, selected_columns]
        membership = gbe(selected_ensemble)
        ca_matrix = (membership @ membership.T) / float(n_base)
        _emit(
            progress_callback,
            type="stage",
            stage="build_ca",
            run=run_index,
            totalRuns=runs,
            progress=5.0 + 15.0 * ((run_index - 1) / runs),
        )

        def report_iteration(iteration: int, objective: float) -> None:
            completed = (run_index - 1) + iteration / max_iter
            _emit(
                progress_callback,
                type="iteration",
                stage="multi_kernel",
                run=run_index,
                totalRuns=runs,
                iteration=iteration,
                maxIterations=max_iter,
                objective=float(objective),
                progress=20.0 + 65.0 * completed / runs,
            )

        if mode == "OMELET":
            kernels = get_kernel_fast_mat(ca_matrix, sigma)
            s_matrix, z_matrix, _, alpha, objective = solver_aktec1(
                kernels,
                lam,
                gamma,
                cluster_count,
                max_iter=max_iter,
                return_obj=True,
                progress_callback=report_iteration,
            )
            metric_values, predicted_labels = ncut_compute(
                s_matrix,
                ground_truth,
                cluster_count,
                random_state=seed,
            )
            metrics = {
                "acc": float(metric_values[0]),
                "nmi": float(metric_values[1]),
                "ari": float(metric_values[2]),
                "f1": float(metric_values[3]),
            }
            visual_features = _omelet_features(s_matrix)
        else:
            landmark_count = min(max(1, anchor) * int(np.ceil(np.sqrt(sample_count))), sample_count)
            landmark_indices = np.sort(rng.choice(sample_count, size=landmark_count, replace=False))
            landmark_rows = ca_matrix[landmark_indices, :]
            kernels = get_kernel_fast_mat(landmark_rows.T, sigma)
            projection_kernels = get_similarity_kernel1(ca_matrix, landmark_rows.T, sigma)
            s_matrix, z_matrix, alpha, objective = solver_aktec_large(
                kernels,
                lam,
                gamma,
                cluster_count,
                max_iter=max_iter,
                return_obj=True,
                progress_callback=report_iteration,
            )
            u, singular_values, _ = np.linalg.svd(s_matrix, full_matrices=False)
            inverse_sqrt = np.diag(1.0 / np.sqrt(np.maximum(singular_values, 1e-12)))
            weighted_projection = sum(weight * matrix for weight, matrix in zip(alpha, projection_kernels))
            visual_features = weighted_projection @ u @ inverse_sqrt
            metric_values, predicted_labels = my_nmi_acc(
                visual_features,
                ground_truth,
                cluster_count,
                random_state=seed,
            )
            metrics = {
                "acc": float(metric_values[3]),
                "nmi": float(metric_values[0]),
                "ari": float(metric_values[1]),
                "f1": float(metric_values[2]),
            }

        coordinates = _two_dimensional_projection(visual_features)
        run_results.append(
            {
                "run": run_index,
                "seed": seed,
                "metrics": metrics,
                "runtimeSeconds": float(perf_counter() - run_started),
                "kernelWeights": np.asarray(alpha, dtype=float),
                "objective": np.asarray(objective, dtype=float),
                "labels": np.asarray(predicted_labels).reshape(-1),
                "coordinates": coordinates,
                "ca": np.asarray(ca_matrix, dtype=float),
                "s": np.asarray(s_matrix, dtype=float),
                "z": np.asarray(z_matrix, dtype=float),
            },
        )
        _emit(
            progress_callback,
            type="run_completed",
            stage="evaluate",
            run=run_index,
            totalRuns=runs,
            metrics=metrics,
            progress=85.0 + 10.0 * run_index / runs,
        )

    metric_keys = ("acc", "nmi", "ari", "f1")
    means = {
        key: float(np.mean([result["metrics"][key] for result in run_results]))
        for key in metric_keys
    }
    representative_index = min(
        range(len(run_results)),
        key=lambda index: sum(
            (run_results[index]["metrics"][key] - means[key]) ** 2
            for key in metric_keys
        ),
    )
    _emit(progress_callback, type="stage", stage="persist", progress=98.0)
    return {
        "mode": mode,
        "sampleCount": int(sample_count),
        "baseClusterCount": int(ensemble.shape[1]),
        "classCount": int(cluster_count),
        "groundTruth": ground_truth,
        "runs": run_results,
        "representativeIndex": representative_index,
    }
