from __future__ import annotations
import argparse
from pathlib import Path
import numpy as np
from ._threading import limit_threads
from .data_loader import load_ensemble_data
from .ensemble import gbe
from .kernel import get_kernel_fast_mat
from .solver import solver_aktec1
from .clustering import ncut_compute


def run_demo(data_path: str | Path, n_base=20, lambdas=(5,), gammas=(5,), sigmas=(1,), runs=1, random_state_start=1):
    data_path = Path(data_path)
    e, y = load_ensemble_data(data_path)
    k = len(np.unique(y))
    results = []
    for sigma in sigmas:
        sigma_val = 2.0 ** sigma if isinstance(sigma, (int, np.integer)) else float(sigma)
        for lam in lambdas:
            for gam in gammas:
                acc_runs, nmi_runs, ari_runs, f_runs = [], [], [], []
                for run in range(random_state_start, random_state_start + runs):
                    rng = np.random.default_rng(run)
                    idx = rng.permutation(e.shape[1])[:n_base]
                    ec_end = e[:, idx]
                    m = gbe(ec_end)
                    ca = (m @ m.T) / n_base
                    kernels = get_kernel_fast_mat(ca, sigma_val)
                    s_consensus, _, _ = solver_aktec1(kernels, lam, gam, k)
                    metrics, _ = ncut_compute(s_consensus, y, k, random_state=run)
                    acc_runs.append(metrics[0])
                    nmi_runs.append(metrics[1])
                    ari_runs.append(metrics[2])
                    f_runs.append(metrics[3])
                results.append({
                    'sigma': sigma_val,
                    'lambda': float(lam),
                    'gamma': float(gam),
                    'ACC_mean': float(np.mean(acc_runs)),
                    'ACC_std': float(np.std(acc_runs)),
                    'NMI_mean': float(np.mean(nmi_runs)),
                    'NMI_std': float(np.std(nmi_runs)),
                    'ARI_mean': float(np.mean(ari_runs)),
                    'ARI_std': float(np.std(ari_runs)),
                    'F_mean': float(np.mean(f_runs)),
                    'F_std': float(np.std(f_runs)),
                })
    return results


def main():
    parser = argparse.ArgumentParser(description='Run the Python-converted OMELET demo.')
    parser.add_argument('--data', type=str, default=str(Path(__file__).resolve().parents[1] / 'data' / 'ionosphere_base_clustering.npz'))
    parser.add_argument('--n-base', type=int, default=20)
    parser.add_argument('--runs', type=int, default=1, help='Use 10 to mimic the original MATLAB demo.')
    parser.add_argument('--lambda-values', type=float, nargs='+', default=[5.0])
    parser.add_argument('--gamma-values', type=float, nargs='+', default=[5.0])
    parser.add_argument('--sigma-powers', type=float, nargs='+', default=[0.0], help='Values p used as sigma=2**p. Original code uses -6..6.')
    args = parser.parse_args()
    limit_threads(1)
    rows = run_demo(args.data, n_base=args.n_base, lambdas=args.lambda_values, gammas=args.gamma_values, sigmas=args.sigma_powers, runs=args.runs)
    header = 'sigma,lambda,gamma,ACC_mean,ACC_std,NMI_mean,NMI_std,ARI_mean,ARI_std,F_mean,F_std'
    print(header)
    for r in rows:
        print(','.join(str(r[k]) for k in ['sigma','lambda','gamma','ACC_mean','ACC_std','NMI_mean','NMI_std','ARI_mean','ARI_std','F_mean','F_std']))


if __name__ == '__main__':
    main()
