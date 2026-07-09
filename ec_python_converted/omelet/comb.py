import numpy as np


def mycomb_fun(y, gamma):
    y = np.asarray(y, dtype=float)
    gamma = np.asarray(gamma, dtype=float).reshape(-1)
    if y.ndim != 3:
        raise ValueError('Y must be a 3-D array')
    if y.shape[2] != gamma.size:
        raise ValueError('gamma length must match Y.shape[2]')
    return np.tensordot(y, gamma, axes=([2], [0]))
