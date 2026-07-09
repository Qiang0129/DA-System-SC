import numpy as np


def l2_distance(a, b):
    """Squared Euclidean distance between columns of a and b."""
    a = np.asarray(a, dtype=float)
    b = np.asarray(b, dtype=float)
    if a.ndim == 1:
        a = a.reshape(1, -1)
    if b.ndim == 1:
        b = b.reshape(1, -1)
    if a.shape[0] == 1:
        a = np.vstack([a, np.zeros((1, a.shape[1]))])
        b = np.vstack([b, np.zeros((1, b.shape[1]))])
    aa = np.sum(a * a, axis=0)
    bb = np.sum(b * b, axis=0)
    ab = a.T @ b
    d = aa[:, None] + bb[None, :] - 2 * ab
    return np.maximum(np.real(d), 0.0)


def get_kernel_fast_mat(ca, sigma):
    """Return the four kernels used by OMELET.

    ``ca`` follows the MATLAB convention: columns are samples.
    """
    ca = np.asarray(ca, dtype=float)
    sigma = float(sigma)
    g = ca.T @ ca
    nx = np.sum(ca ** 2, axis=0)
    dist2 = np.maximum(nx[:, None] + nx[None, :] - 2 * g, 0.0)
    eps = 1e-12
    return [
        np.exp(-dist2 / (sigma ** 2 + eps)),
        g.copy(),
        np.exp(-dist2 / (sigma + eps)),
        (g + 1.0) ** 2,
    ]


def get_similarity_kernel1(ca, landmarks, sigma):
    """Python replacement for unavailable ``get_similarity_kernel1.mexw64``.

    Args:
        ca: full data representation with columns as samples, shape d-by-n.
        landmarks: landmark representation with columns as landmarks, shape d-by-m.
        sigma: kernel bandwidth.

    Returns:
        list of four n-by-m cross-kernel matrices matching ``get_kernel_fast_mat``.
    """
    ca = np.asarray(ca, dtype=float)
    landmarks = np.asarray(landmarks, dtype=float)
    sigma = float(sigma)
    if ca.shape[0] != landmarks.shape[0]:
        raise ValueError(f'ca and landmarks must have the same feature dimension, got {ca.shape} and {landmarks.shape}')
    g = ca.T @ landmarks
    nx = np.sum(ca ** 2, axis=0)
    nl = np.sum(landmarks ** 2, axis=0)
    dist2 = np.maximum(nx[:, None] + nl[None, :] - 2 * g, 0.0)
    eps = 1e-12
    return [
        np.exp(-dist2 / (sigma ** 2 + eps)),
        g.copy(),
        np.exp(-dist2 / (sigma + eps)),
        (g + 1.0) ** 2,
    ]


def kcenter(k):
    k = np.asarray(k, dtype=float).copy()
    if k.ndim == 2:
        n = k.shape[1]
        d = np.sum(k, axis=0) / n
        e = np.sum(d) / n
        j = np.ones((n, 1)) @ d.reshape(1, -1)
        out = k - j - j.T + e * np.ones((n, n))
        return 0.5 * (out + out.T)
    if k.ndim == 3:
        out = k.copy()
        for i in range(out.shape[2]):
            out[:, :, i] = kcenter(out[:, :, i]) + 1e-12 * np.eye(out.shape[0])
        return out
    raise ValueError('K must be 2-D or 3-D')


def knorm(k):
    k = np.asarray(k, dtype=float).copy()
    eps = 1e-12
    if k.ndim == 2:
        d = np.sqrt(np.maximum(np.diag(k), eps))
        return k / np.maximum(np.outer(d, d), eps)
    if k.ndim == 3:
        out = k.copy()
        for i in range(out.shape[2]):
            out[:, :, i] = knorm(out[:, :, i])
        return out
    raise ValueError('K must be 2-D or 3-D')


def select_anchors_from_kernel(k, num_anchors, eta=1.0):
    k = np.asarray(k, dtype=float)
    node_degree = np.sum(k, axis=1)
    remaining = list(range(k.shape[0]))
    anchors = []
    for _ in range(int(num_anchors)):
        if not remaining:
            break
        scores = np.power(np.maximum(node_degree[remaining], 0.0), eta)
        selected_pos = int(np.argmax(scores))
        anchors.append(remaining[selected_pos])
        del remaining[selected_pos]
    return np.array(anchors, dtype=int)
