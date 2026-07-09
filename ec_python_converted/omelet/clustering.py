import numpy as np
from sklearn.cluster import KMeans
from .metrics import accuracy, compute_nmi, rand_index, compute_f, row_normalize


def spectral_clustering(w, k, random_state=1, n_init=20):
    w = np.asarray(w, dtype=float)
    d = np.sum(w, axis=1)
    inv_sqrt = 1.0 / np.sqrt(np.maximum(d, 1e-12))
    wn = (inv_sqrt[:, None] * w) * inv_sqrt[None, :]
    u, _, _ = np.linalg.svd(wn, full_matrices=False)
    v = row_normalize(u[:, :int(k)])
    return KMeans(n_clusters=int(k), n_init=n_init, random_state=random_state).fit_predict(v) + 1


def ncut_compute(z, gt, k, random_state=1):
    u, s, _ = np.linalg.svd(np.asarray(z, dtype=float), full_matrices=False)
    if s.size == 0:
        raise ValueError('empty matrix')
    r = int(np.sum(s > 1e-4 * s[0]))
    r = max(r, 1)
    emb = u[:, :r] * np.sqrt(s[:r])[None, :]
    emb = row_normalize(emb)
    sim = (emb @ emb.T) ** 4
    labels = spectral_clustering(sim, k, random_state=random_state)
    return np.array([
        accuracy(labels, gt),
        compute_nmi(labels, gt),
        rand_index(labels, gt)[0],
        compute_f(labels, gt)[0],
    ], dtype=float), labels
