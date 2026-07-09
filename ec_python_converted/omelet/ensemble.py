import numpy as np


def relabel_cl(e):
    """Relabel clusters in each base partition so all clusters have global IDs."""
    e = np.asarray(e)
    if e.ndim != 2:
        raise ValueError('E must be an N-by-M matrix')
    n, m = e.shape
    new_e = np.zeros((n, m), dtype=int)
    offset = 0
    for col in range(m):
        labels = np.unique(e[:, col])
        for j, lab in enumerate(labels, start=1):
            new_e[e[:, col] == lab, col] = offset + j
        offset += len(labels)
    return new_e, int(np.max(new_e)) if new_e.size else 0


def gbe(e):
    """Generate binary cluster-membership matrix from a clustering ensemble."""
    new_e, km = relabel_cl(e)
    n = new_e.shape[0]
    be = np.zeros((n, km), dtype=float)
    rows = np.arange(n)[:, None]
    be[rows, new_e - 1] = 1.0
    return be


def compute_microclusters(base_cls):
    """Obtain micro-clusters with respect to a clustering ensemble.

    Returns:
        new_base_cls: unique rows of base_cls, represented as base partitions.
        m_cls_labels: N-by-2 array, column 0 is original sample index (1-based),
            column 1 is the micro-cluster label (1-based).
    """
    base_cls = np.asarray(base_cls)
    if base_cls.ndim != 2:
        raise ValueError('base_cls must be a 2-D array')
    # MATLAB sortrows order.
    sort_order = np.lexsort(tuple(base_cls[:, j] for j in range(base_cls.shape[1] - 1, -1, -1)))
    sorted_rows = base_cls[sort_order]
    unique_rows, first_idx, inverse = np.unique(sorted_rows, axis=0, return_index=True, return_inverse=True)
    # Convert labels back to original order.
    labels_sorted = inverse + 1
    labels_original = np.empty_like(labels_sorted)
    labels_original[sort_order] = labels_sorted
    m_cls_labels = np.column_stack((np.arange(1, base_cls.shape[0] + 1), labels_original))
    # MATLAB returns baseCls(uI,:), where uI are first indices in the original baseCls order.
    unique_orig_rows, unique_orig_idx = np.unique(base_cls, axis=0, return_index=True)
    order = np.argsort(unique_orig_idx)
    new_base_cls = base_cls[unique_orig_idx[order]]
    return new_base_cls, m_cls_labels


def select_samples(m_cls_labels):
    m_cls_labels = np.asarray(m_cls_labels)
    selected = []
    for cls in np.unique(m_cls_labels[:, 1]):
        idx = np.where(m_cls_labels[:, 1] == cls)[0]
        selected.append(int(m_cls_labels[idx[0], 0]))
    return np.array(selected, dtype=int)
