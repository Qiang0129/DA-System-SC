# OMELET Python Conversion

这是对上传的 OMELET MATLAB 集成聚类代码的 Python 可运行转换版。

## 目录

- `omelet/`: Python 算法包。
- `demo_OMELET.py`: 对应原始 `demo_OMELET.m` 的普通版本入口。
- `OMELET_SV.py`: 对应原始 `OMELET_SV.m` 的 landmark/large-scale 版本入口。
- `data/ionosphere_base_clustering.npz`: Python 示例数据；同时保留 `.mat` 版本并可由 `scipy.io.loadmat` 读取。
- `original_matlab_reference/`: 原始 MATLAB 文件备份，便于核对。

## 安装依赖

```bash
pip install -r requirements.txt
```

## 快速运行测试

```bash
python demo_OMELET.py --runs 1 --lambda-values 5 --gamma-values 5 --sigma-powers 0
python OMELET_SV.py --runs 1 --lambda-values 5 --gamma-values 5 --sigma-powers 0
```

输出格式为：

```text
sigma,lambda,gamma,ACC_mean,ACC_std,NMI_mean,NMI_std,ARI_mean,ARI_std,F_mean,F_std
...
```

## 完整复现实验

原始 MATLAB 网格为：

- `lambda_all = [5,10,20,50,80,100,150,200]`
- `gamma_all = [5,10,50,100,150]`
- `sigma_all = -6:6`
- `runs = 10`

Python 可以这样运行：

```bash
python demo_OMELET.py --runs 10 --lambda-values 5 10 20 50 80 100 150 200 --gamma-values 5 10 50 100 150 --sigma-powers -6 -5 -4 -3 -2 -1 0 1 2 3 4 5 6
```

## 转换说明

- 原始 `myNMIACC.p` 是 MATLAB 私有加密文件，不能反编译；这里实现了 `omelet.metrics.my_nmi_acc`，功能是对特征做 k-means 后返回 `[NMI, ARI, F-score, ACC]`。
- 原始 `get_similarity_kernel1.mexw64` 是 Windows MEX 二进制文件，不能直接用于 Python；这里实现了 `omelet.kernel.get_similarity_kernel1`，与 `get_kernel_fast_mat` 使用同一组四种核：RBF(sigma^2)、linear、RBF(sigma)、polynomial degree 2。
- Python 中 k-means、SVD 和随机数与 MATLAB 实现不完全一致，因此数值结果可能有轻微差异，但算法流程和输入输出保持一致。
