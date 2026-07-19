from __future__ import annotations

import argparse
import csv
import json
import sys
from pathlib import Path
from time import perf_counter
from typing import Any

import numpy as np


PROJECT_ROOT = Path(__file__).resolve().parents[2]
ALGORITHM_ROOT = PROJECT_ROOT / "ec_python_converted"
if str(ALGORITHM_ROOT) not in sys.path:
    sys.path.insert(0, str(ALGORITHM_ROOT))

from omelet.analysis import run_analysis  # noqa: E402


EVENT_PREFIX = "OMELET_EVENT "
KERNEL_KEYS = ("rbf_sigma_squared", "linear", "rbf_sigma", "polynomial_2")


def emit(event_type: str, **payload: Any) -> None:
    print(
        EVENT_PREFIX + json.dumps({"type": event_type, **payload}, ensure_ascii=False, allow_nan=False),
        flush=True,
    )


def _number(value: Any, digits: int = 10) -> float:
    result = float(value)
    if not np.isfinite(result):
        raise ValueError("算法输出包含非有限数值")
    return round(result, digits)


def _matrix_preview(matrix: np.ndarray, limit: int = 24) -> dict[str, Any]:
    values = np.asarray(matrix, dtype=float)
    if values.ndim != 2:
        raise ValueError("矩阵产物必须是二维数组")
    if not np.all(np.isfinite(values)):
        raise ValueError("矩阵产物包含非有限数值")

    row_indices = np.unique(np.linspace(0, values.shape[0] - 1, min(limit, values.shape[0]), dtype=int))
    column_indices = np.unique(np.linspace(0, values.shape[1] - 1, min(limit, values.shape[1]), dtype=int))
    sampled = values[np.ix_(row_indices, column_indices)]
    diagonal = np.diag(values) if values.shape[0] == values.shape[1] else np.array([], dtype=float)
    symmetry_error = (
        float(np.max(np.abs(values - values.T)))
        if values.shape[0] == values.shape[1] and values.size
        else None
    )

    top_pairs: list[dict[str, Any]] = []
    if values.shape[0] == values.shape[1] and values.shape[0] > 1:
        upper_rows, upper_columns = np.triu_indices(values.shape[0], k=1)
        upper_values = values[upper_rows, upper_columns]
        count = min(20, upper_values.size)
        if count:
            positions = np.argpartition(upper_values, -count)[-count:]
            positions = positions[np.argsort(upper_values[positions])[::-1]]
            top_pairs = [
                {
                    "row": int(upper_rows[position]) + 1,
                    "column": int(upper_columns[position]) + 1,
                    "value": _number(upper_values[position]),
                }
                for position in positions
            ]

    return {
        "shape": [int(values.shape[0]), int(values.shape[1])],
        "rowIndices": [int(index) + 1 for index in row_indices],
        "columnIndices": [int(index) + 1 for index in column_indices],
        "values": [[_number(value, 8) for value in row] for row in sampled],
        "stats": {
            "min": _number(np.min(values)),
            "max": _number(np.max(values)),
            "mean": _number(np.mean(values)),
            "std": _number(np.std(values)),
            "diagonalMean": _number(np.mean(diagonal)) if diagonal.size else None,
            "symmetryMaxError": _number(symmetry_error) if symmetry_error is not None else None,
            "nonzeroRatio": _number(np.count_nonzero(values) / values.size),
        },
        "topPairs": top_pairs,
    }


def _scatter_preview(
    coordinates: np.ndarray,
    predicted_labels: np.ndarray,
    ground_truth: np.ndarray,
    limit: int = 2000,
) -> dict[str, Any]:
    coordinates = np.asarray(coordinates, dtype=float)
    predicted_labels = np.asarray(predicted_labels).reshape(-1)
    ground_truth = np.asarray(ground_truth).reshape(-1)
    sample_count = coordinates.shape[0]

    if sample_count <= limit:
        selected = np.arange(sample_count)
    else:
        selected_parts: list[np.ndarray] = []
        unique_labels = np.unique(predicted_labels)
        for label in unique_labels:
            group = np.flatnonzero(predicted_labels == label)
            allocation = max(1, round(limit * len(group) / sample_count))
            positions = np.linspace(0, len(group) - 1, min(allocation, len(group)), dtype=int)
            selected_parts.append(group[positions])
        selected = np.unique(np.concatenate(selected_parts))[:limit]

    points = [
        {
            "sampleIndex": int(index) + 1,
            "x": _number(coordinates[index, 0], 8),
            "y": _number(coordinates[index, 1], 8),
            "predictedLabel": str(predicted_labels[index]),
            "trueLabel": str(ground_truth[index]),
        }
        for index in selected
    ]
    return {"totalCount": int(sample_count), "sampled": len(points) < sample_count, "points": points}


def _metric_payload(run_results: list[dict[str, Any]]) -> dict[str, Any]:
    aggregate: dict[str, Any] = {}
    for key in ("acc", "nmi", "ari", "f1"):
        values = np.array([result["metrics"][key] for result in run_results], dtype=float)
        aggregate[key] = {
            "mean": _number(np.mean(values)),
            "std": _number(np.std(values)),
            "min": _number(np.min(values)),
            "max": _number(np.max(values)),
        }
    return {
        "aggregate": aggregate,
        "runs": [
            {
                "run": int(result["run"]),
                "seed": int(result["seed"]),
                "runtimeSeconds": _number(result["runtimeSeconds"], 6),
                **{key: _number(result["metrics"][key]) for key in ("acc", "nmi", "ari", "f1")},
            }
            for result in run_results
        ],
    }


def _kernel_payload(run_results: list[dict[str, Any]], representative_index: int) -> dict[str, Any]:
    all_weights = np.stack([result["kernelWeights"] for result in run_results])
    return {
        "items": [
            {
                "key": key,
                "mean": _number(np.mean(all_weights[:, index])),
                "std": _number(np.std(all_weights[:, index])),
                "representative": _number(all_weights[representative_index, index]),
            }
            for index, key in enumerate(KERNEL_KEYS)
        ],
        "runs": [
            {
                "run": int(result["run"]),
                "values": [_number(value) for value in result["kernelWeights"]],
            }
            for result in run_results
        ],
    }


def _convergence_payload(run_results: list[dict[str, Any]], representative_index: int, max_iter: int) -> dict[str, Any]:
    runs: list[dict[str, Any]] = []
    for result in run_results:
        objective = np.asarray(result["objective"], dtype=float)
        points = []
        for index, value in enumerate(objective):
            relative_change = None
            if index:
                denominator = max(abs(float(objective[index - 1])), 1e-12)
                relative_change = _number(abs(float(value) - float(objective[index - 1])) / denominator)
            points.append(
                {
                    "iteration": index + 1,
                    "objective": _number(value),
                    "relativeChange": relative_change,
                },
            )
        runs.append(
            {
                "run": int(result["run"]),
                "converged": len(points) < max_iter,
                "points": points,
            },
        )
    return {"representativeRun": representative_index + 1, "runs": runs}


def _write_artifacts(
    output_dir: Path,
    run_results: list[dict[str, Any]],
    representative_index: int,
    ground_truth: np.ndarray,
) -> dict[str, str]:
    representative = run_results[representative_index]
    labels = np.stack([result["labels"] for result in run_results])
    np.savez_compressed(output_dir / "labels.npz", labels=labels, ground_truth=ground_truth)
    np.savez_compressed(output_dir / "ca_matrix.npz", matrix=representative["ca"])
    np.savez_compressed(output_dir / "s_matrix.npz", matrix=representative["s"])
    np.savez_compressed(output_dir / "z_matrix.npz", matrix=representative["z"])

    with (output_dir / "labels.csv").open("w", newline="", encoding="utf-8-sig") as stream:
        writer = csv.writer(stream)
        writer.writerow(["sample_index", "predicted_label", "true_label"])
        for index, (predicted, actual) in enumerate(zip(representative["labels"], ground_truth), start=1):
            writer.writerow([index, predicted, actual])

    return {
        "labels": "labels.npz",
        "labelsCsv": "labels.csv",
        "ca": "ca_matrix.npz",
        "s": "s_matrix.npz",
        "z": "z_matrix.npz",
    }


def execute(job_path: Path) -> None:
    job = json.loads(job_path.read_text(encoding="utf-8"))
    output_dir = Path(job["outputDir"]).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    started = perf_counter()

    def forward_progress(event: dict[str, Any]) -> None:
        event_type = str(event.pop("type", "progress"))
        emit(event_type, **event)

    params = job["params"]
    result = run_analysis(
        job["datasetPath"],
        mode=job["mode"],
        n_base=int(params["nBase"]),
        sigma=float(params["sigma"]),
        lam=float(params["lambda"]),
        gamma=float(params["gamma"]),
        anchor=int(params.get("anchor") or 0),
        runs=int(params["runs"]),
        max_iter=int(params["maxIter"]),
        random_seed=int(params.get("randomSeed") or 1),
        progress_callback=forward_progress,
    )
    run_results = result["runs"]
    representative_index = int(result["representativeIndex"])
    representative = run_results[representative_index]
    artifacts = _write_artifacts(output_dir, run_results, representative_index, result["groundTruth"])
    metrics = _metric_payload(run_results)
    kernels = _kernel_payload(run_results, representative_index)
    convergence = _convergence_payload(run_results, representative_index, int(params["maxIter"]))
    preview = {
        "schemaVersion": 1,
        "summary": {
            "mode": result["mode"],
            "sampleCount": result["sampleCount"],
            "baseClusterCount": result["baseClusterCount"],
            "classCount": result["classCount"],
            "representativeRun": representative_index + 1,
            "randomSeed": int(params.get("randomSeed") or 1),
        },
        "matrices": {
            "ca": _matrix_preview(representative["ca"]),
            "s": _matrix_preview(representative["s"]),
            "z": _matrix_preview(representative["z"]),
        },
        "scatter": _scatter_preview(
            representative["coordinates"],
            representative["labels"],
            result["groundTruth"],
        ),
    }
    manifest = {
        "schemaVersion": 1,
        "runtimeSeconds": _number(perf_counter() - started, 6),
        "parameters": params,
        "metrics": metrics,
        "kernelWeights": kernels,
        "convergence": convergence,
        "preview": preview,
        "artifacts": artifacts,
    }
    manifest_path = output_dir / "manifest.json"
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, allow_nan=False),
        encoding="utf-8",
    )
    emit("completed", manifestPath=str(manifest_path), progress=100.0)


def main() -> None:
    parser = argparse.ArgumentParser(description="OMELET 任务子进程")
    parser.add_argument("--job", required=True, type=Path)
    args = parser.parse_args()
    try:
        execute(args.job.resolve())
    except Exception as exc:
        emit("error", message=str(exc), errorType=type(exc).__name__)
        raise


if __name__ == "__main__":
    main()
