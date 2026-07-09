from pathlib import Path

import numpy as np
import scipy.io as sio
from fastapi import APIRouter, HTTPException

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
