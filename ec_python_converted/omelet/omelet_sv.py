from __future__ import annotations
import argparse
from pathlib import Path
import numpy as np
from ._threading import limit_threads
from .data_loader import load_ensemble_data
from .ensemble import gbe
from .kernel import get_kernel_fast_mat, get_similarity_kernel1
from .solver import solver_aktec_large
from .metrics import my_nmi_acc


def run_landmark_demo(data_path: str | Path, n_base=20, anchor=10, lambdas=(5,), gammas=(5,), sigmas=(0,), runs=1):
    """Landmark version corresponding to ``OMELET_SV.m``."""
    e, y = load_ensemble_data(data_path)
    k = len(np.unique(y))
    num = len(y)
    num_landmark = min(anchor * int(np.ceil(np.sqrt(num))), num)
    rows = []
    for sigma_power in sigmas:
        sigma = 2.0 ** float(sigma_power)
        for lam in lambdas:
            for gam in gammas:
                acc_runs, nmi_runs, ari_runs, f_runs = [], [], [], []
                for run in range(1, runs + 1):
                    rng = np.random.default_rng(run)
                    idx = rng.permutation(e.shape[1])[:n_base]
                    ec_end = e[:, idx]
                    m = gbe(ec_end)
                    ca = (m @ m.T) / n_base
                    landmark_idx = np.sort(np.random.default_rng(1).choice(num, size=num_landmark, replace=False))
                    sample_row = ca[landmark_idx, :]
                    a_kernels = get_kernel_fast_mat(sample_row.T, sigma)
                    p_kernels = get_similarity_kernel1(ca, sample_row.T, sigma)
                    s_consensus, _, alpha = solver_aktec_large(a_kernels, lam, gam, k)
                    u, s, _ = np.linalg.svd(s_consensus, full_matrices=False)
                    s_inv_sqrt = np.diag(1.0 / np.sqrt(np.maximum(s, 1e-12)))
                    weighted_p = sum(ai * p for ai, p in zip(alpha, p_kernels))
                    features = weighted_p @ u @ s_inv_sqrt
                    res, _ = my_nmi_acc(features, y, k, random_state=run)
                    nmi_runs.append(res[0]); ari_runs.append(res[1]); f_runs.append(res[2]); acc_runs.append(res[3])
                rows.append({
                    'sigma': sigma, 'lambda': float(lam), 'gamma': float(gam),
                    'ACC_mean': float(np.mean(acc_runs)), 'ACC_std': float(np.std(acc_runs)),
                    'NMI_mean': float(np.mean(nmi_runs)), 'NMI_std': float(np.std(nmi_runs)),
                    'ARI_mean': float(np.mean(ari_runs)), 'ARI_std': float(np.std(ari_runs)),
                    'F_mean': float(np.mean(f_runs)), 'F_std': float(np.std(f_runs)),
                })
    return rows


def main():
    parser = argparse.ArgumentParser(description='Run the Python-converted OMELET landmark demo.')
    parser.add_argument('--data', type=str, default=str(Path(__file__).resolve().parents[1] / 'data' / 'ionosphere_base_clustering.npz'))
    parser.add_argument('--n-base', type=int, default=20)
    parser.add_argument('--anchor', type=int, default=10)
    parser.add_argument('--runs', type=int, default=1)
    parser.add_argument('--lambda-values', type=float, nargs='+', default=[5.0])
    parser.add_argument('--gamma-values', type=float, nargs='+', default=[5.0])
    parser.add_argument('--sigma-powers', type=float, nargs='+', default=[0.0])
    args = parser.parse_args()
    limit_threads(1)
    rows = run_landmark_demo(args.data, n_base=args.n_base, anchor=args.anchor, lambdas=args.lambda_values, gammas=args.gamma_values, sigmas=args.sigma_powers, runs=args.runs)
    print('sigma,lambda,gamma,ACC_mean,ACC_std,NMI_mean,NMI_std,ARI_mean,ARI_std,F_mean,F_std')
    for r in rows:
        print(','.join(str(r[k]) for k in ['sigma','lambda','gamma','ACC_mean','ACC_std','NMI_mean','NMI_std','ARI_mean','ARI_std','F_mean','F_std']))


if __name__ == '__main__':
    main()
