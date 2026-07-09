import numpy as np


def eig1(a, c=None, is_max=True, is_sym=True):
    a = np.asarray(a, dtype=float)
    if a.ndim != 2 or a.shape[0] != a.shape[1]:
        raise ValueError('A must be a square matrix')
    n = a.shape[0]
    if c is None:
        c = n
    c = min(int(c), n)
    if is_sym:
        a = np.maximum(a, a.T)
        vals, vecs = np.linalg.eigh(a)
    else:
        vals, vecs = np.linalg.eig(a)
        vals = np.real(vals)
        vecs = np.real(vecs)
    order = np.argsort(vals)
    if is_max:
        order = order[::-1]
    idx = order[:c]
    return vecs[:, idx], vals[idx], vals[order]


def project_psd_symmetric(k):
    k = 0.5 * (k + k.T)
    vals, vecs = np.linalg.eigh(k)
    vals = np.maximum(vals, 0.0)
    out = (vecs * vals) @ vecs.T
    return 0.5 * (out + out.T)
