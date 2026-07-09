import numpy as np


def eproj_simplex_new(v, k=1.0, return_iter=False):
    """Project vector ``v`` onto {x | x >= 0, sum(x)=k}.

    This is the Python version of ``EProjSimplex_new.m``.  The implementation
    uses the standard sorting-based projection, which is deterministic and more
    stable than Newton iteration for Python/Numpy.
    """
    v = np.asarray(v, dtype=float).reshape(-1)
    n = v.size
    if n == 0:
        raise ValueError('v must be non-empty')
    if k <= 0:
        return np.zeros_like(v) if not return_iter else (np.zeros_like(v), 0)

    u = np.sort(v)[::-1]
    cssv = np.cumsum(u) - k
    ind = np.arange(1, n + 1)
    cond = u - cssv / ind > 0
    if not np.any(cond):
        x = np.ones(n) * (k / n)
    else:
        rho = ind[cond][-1]
        theta = cssv[cond][-1] / rho
        x = np.maximum(v - theta, 0.0)
    if return_iter:
        return x, 1
    return x


def eproj_simplex_columns(v, k=1.0):
    """Project each column of v onto the probability simplex."""
    v = np.asarray(v, dtype=float)
    if v.ndim != 2:
        raise ValueError('v must be a 2-D array')
    n, m = v.shape
    if n == 0:
        raise ValueError('v must have at least one row')
    u = np.sort(v, axis=0)[::-1, :]
    cssv = np.cumsum(u, axis=0) - k
    ind = np.arange(1, n + 1, dtype=float).reshape(-1, 1)
    cond = u - cssv / ind > 0
    rho = np.maximum(np.sum(cond, axis=0), 1).astype(int)
    theta = cssv[rho - 1, np.arange(m)] / rho
    return np.maximum(v - theta.reshape(1, -1), 0.0)
