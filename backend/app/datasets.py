import io
from pathlib import Path

import scipy.io as sio
from fastapi import APIRouter, HTTPException, UploadFile, File

router = APIRouter(prefix="/api/datasets", tags=["datasets"])


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
            "shape": list(value.shape),
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

    if file.filename.endswith(".mat"):
        try:
            mat = sio.loadmat(io.BytesIO(content))
        except Exception as exc:
            raise HTTPException(400, f"无法解析 .mat 文件: {exc}")

        variables = {}
        for name, value in mat.items():
            if name.startswith("__"):
                continue
            variables[name] = {
                "shape": list(value.shape),
                "dtype": str(value.dtype),
            }

        # 找最大的二维矩阵作为主变量
        main_var = None
        main_shape = [0, 0]
        for name, info in variables.items():
            shape = info["shape"]
            if len(shape) >= 2 and shape[0] * shape[1] > main_shape[0] * main_shape[1]:
                main_var = name
                main_shape = shape

        # 判断是否有标签列（y / label / labels 等）
        has_labels = any(k in variables for k in ("y", "label", "labels"))

        # 判断类别数（标签列唯一值，可通过变量 shape 推断或设默认）
        class_count = 2
        if has_labels and "y" in variables:
            y_shape = variables["y"]["shape"]
            # 如果是 1D 向量，实际类数不能直接从 shape 确定，保留 2

        return {
            "fileName": file.filename,
            "variables": variables,
            "mainVariable": main_var,
            "sampleCount": main_shape[0],
            "baseCount": main_shape[1] if len(main_shape) >= 2 else 1,
            "classCount": class_count,
            "hasLabels": has_labels,
        }

    raise HTTPException(400, f"不支持的文件格式: {file.filename}，目前仅支持 .mat")
