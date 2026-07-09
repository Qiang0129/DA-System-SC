import numpy as np
from scipy.optimize import linear_sum_assignment
from sklearn.cluster import KMeans
from sklearn.metrics import adjusted_rand_score


def _as_1d(x):
    return np.asarray(x).reshape(-1)


def best_map(true_labels, pred_labels):
    """Permute predicted labels to best match ground-truth labels."""
    true_labels = _as_1d(true_labels)
    pred_labels = _as_1d(pred_labels)
    if true_labels.shape[0] != pred_labels.shape[0]:
        raise ValueError('true_labels and pred_labels must have the same length')

    label_true = np.unique(true_labels)
    label_pred = np.unique(pred_labels)
    n_class = max(len(label_true), len(label_pred))
    g = np.zeros((n_class, n_class), dtype=float)
    for i, lt in enumerate(label_true):
        mask_t = true_labels == lt
        for j, lp in enumerate(label_pred):
            g[i, j] = np.sum(mask_t & (pred_labels == lp))

    row_ind, col_ind = linear_sum_assignment(-g)
    pred_to_true = {}
    for r, c in zip(row_ind, col_ind):
        if c < len(label_pred) and r < len(label_true):
            pred_to_true[label_pred[c]] = label_true[r]

    # Any unmatched predicted cluster is mapped to the most frequent true label.
    fallback = label_true[np.argmax([np.sum(true_labels == lt) for lt in label_true])]
    return np.array([pred_to_true.get(x, fallback) for x in pred_labels])


def accuracy(pred_labels, true_labels):
    pred_labels = best_map(true_labels, pred_labels)
    true_labels = _as_1d(true_labels)
    return float(np.mean(pred_labels == true_labels))


def contingency(mem1, mem2):
    mem1 = _as_1d(mem1)
    mem2 = _as_1d(mem2)
    if mem1.size != mem2.size:
        raise ValueError('contingency requires two vectors with the same length')
    labels1 = np.unique(mem1)
    labels2 = np.unique(mem2)
    idx1 = {v: i for i, v in enumerate(labels1)}
    idx2 = {v: i for i, v in enumerate(labels2)}
    cont = np.zeros((len(labels1), len(labels2)), dtype=float)
    for a, b in zip(mem1, mem2):
        cont[idx1[a], idx2[b]] += 1
    return cont


def rand_index(c1, c2):
    """Return adjusted Rand, Rand, Mirkin, and Hubert indices."""
    c = contingency(c1, c2)
    n = np.sum(c)
    if n < 2:
        return 0.0, 0.0, 0.0, 0.0
    nis = np.sum(np.sum(c, axis=1) ** 2)
    njs = np.sum(np.sum(c, axis=0) ** 2)
    t1 = n * (n - 1) / 2.0
    t2 = np.sum(c ** 2)
    t3 = 0.5 * (nis + njs)
    nc = (n * (n ** 2 + 1) - (n + 1) * nis - (n + 1) * njs + 2 * (nis * njs) / n) / (2 * (n - 1))
    agreements = t1 + t2 - t3
    disagreements = -t2 + t3
    ar = 0.0 if t1 == nc else (agreements - nc) / (t1 - nc)
    ri = agreements / t1
    mi = disagreements / t1
    hi = (agreements - disagreements) / t1
    return float(ar), float(ri), float(mi), float(hi)


def compute_f(t, h):
    t = _as_1d(t)
    h = _as_1d(h)
    if t.size != h.size:
        raise ValueError('compute_f requires equal-length vectors')
    num_t = 0.0
    num_h = 0.0
    num_i = 0.0
    n = t.size
    for i in range(n):
        tn = t[i + 1:] == t[i]
        hn = h[i + 1:] == h[i]
        num_t += np.sum(tn)
        num_h += np.sum(hn)
        num_i += np.sum(tn & hn)
    p = num_i / num_h if num_h > 0 else 1.0
    r = num_i / num_t if num_t > 0 else 1.0
    f = 0.0 if (p + r) == 0 else 2 * p * r / (p + r)
    return float(f), float(p), float(r)


def compute_nmi(t, h):
    """MATLAB-compatible normalized mutual information."""
    t = _as_1d(t)
    h = _as_1d(h)
    if t.size != h.size:
        raise ValueError('compute_nmi requires equal-length vectors')
    n = t.size
    classes = np.unique(t)
    clusters = np.unique(h)
    d = np.array([np.sum(t == c) for c in classes], dtype=float)
    b = np.array([np.sum(h == c) for c in clusters], dtype=float)
    mi = 0.0
    for i, cl in enumerate(clusters):
        idx_cl = h == cl
        for j, cls in enumerate(classes):
            aij = np.sum(idx_cl & (t == cls))
            if aij != 0:
                mi += (aij / n) * np.log2(n * aij / (b[i] * d[j]))
    class_ent = np.sum((d / n) * np.log2(n / d))
    clust_ent = np.sum((b / n) * np.log2(n / b))
    denom = clust_ent + class_ent
    return float(0.0 if denom == 0 else 2 * mi / denom)


def row_normalize(x, eps=1e-12):
    x = np.asarray(x, dtype=float)
    norms = np.linalg.norm(x, axis=1, keepdims=True)
    return x / np.maximum(norms, eps)


def my_nmi_acc(features, gt, k, random_state=1, n_init=20):
    """Replacement for the unavailable MATLAB private file ``myNMIACC.p``.

    It clusters the rows of ``features`` by k-means and returns metrics in the
    same order expected by ``OMELET_SV.m``: [NMI, ARI, F-score, ACC].
    """
    x = row_normalize(np.asarray(features, dtype=float))
    labels = KMeans(n_clusters=int(k), n_init=n_init, random_state=random_state).fit_predict(x) + 1
    nmi = compute_nmi(labels, gt)
    ari = adjusted_rand_score(_as_1d(gt), labels)
    fscore = compute_f(labels, gt)[0]
    acc = accuracy(labels, gt)
    return np.array([nmi, ari, fscore, acc], dtype=float), labels
