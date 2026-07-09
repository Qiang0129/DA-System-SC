# MATLAB 到 Python 转换对应表

| 原文件 | Python 对应文件 |
|---|---|
| `Accuracy.m` | `omelet/Accuracy.py`, `omelet/metrics.py` |
| `Contingency.m` | `omelet/Contingency.py`, `omelet/metrics.py` |
| `EProjSimplex_new.m` | `omelet/EProjSimplex_new.py`, `omelet/simplex.py` |
| `Gbe.m` | `omelet/Gbe.py`, `omelet/ensemble.py` |
| `L2_distance_1.m` | `omelet/L2_distance_1.py`, `omelet/kernel.py` |
| `OMELET_SV.m` | `OMELET_SV.py`, `omelet/omelet_sv.py` |
| `RandIndex.m` | `omelet/RandIndex.py`, `omelet/metrics.py` |
| `bestMap.m` | `omelet/bestMap.py`, `omelet/metrics.py` |
| `computeMicroclusters.m` | `omelet/computeMicroclusters.py`, `omelet/ensemble.py` |
| `compute_f.m` | `omelet/compute_f.py`, `omelet/metrics.py` |
| `compute_nmi.m` | `omelet/compute_nmi.py`, `omelet/metrics.py` |
| `demo_OMELET.m` | `demo_OMELET.py`, `omelet/demo_omelet.py` |
| `eig1.m` | `omelet/eig1.py`, `omelet/linalg_utils.py` |
| `find_error.m` | `omelet/find_error.py` |
| `get_kernel_fast_mat.m` | `omelet/get_kernel_fast_mat.py`, `omelet/kernel.py` |
| `get_similarity_kernel1.mexw64` | `omelet/get_similarity_kernel1.py`, `omelet/kernel.py` |
| `hungarian.m` | `omelet/hungarian.py` |
| `ionosphere_base_clustering.mat` | `data/ionosphere_base_clustering.npz` and `.mat` |
| `kcenter.m` | `omelet/kcenter.py`, `omelet/kernel.py` |
| `knorm.m` | `omelet/knorm.py`, `omelet/kernel.py` |
| `myNMIACC.p` | `omelet/myNMIACC.py`, `omelet/metrics.py` |
| `mycombFun.m` | `omelet/mycombFun.py`, `omelet/comb.py` |
| `ncut_compute.m` | `omelet/ncut_compute.py`, `omelet/clustering.py` |
| `relabelCl.m` | `omelet/relabelCl.py`, `omelet/ensemble.py` |
| `selectAnchorsFromKernel.m` | `omelet/selectAnchorsFromKernel.py`, `omelet/kernel.py` |
| `select_samples.m` | `omelet/select_samples.py`, `omelet/ensemble.py` |
| `solver_AKTEC1.m` | `omelet/solver_AKTEC1.py`, `omelet/solver.py` |
| `solver_AKTEC_large.m` | `omelet/solver_AKTEC_large.py`, `omelet/solver.py` |
| `spectral_clustering.m` | `omelet/spectral_clustering.py`, `omelet/clustering.py` |
| `update_Z.m` | `omelet/update_Z.py`, `omelet/solver.py` |

说明：`.p` 私有文件和 `.mexw64` 二进制文件无法反编译，已按其在主程序中的用途补写 Python 等价实现。
