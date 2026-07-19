import numpy as np
from .kernel import l2_distance
from .linalg_utils import eig1, project_psd_symmetric
from .simplex import eproj_simplex_new, eproj_simplex_columns


def _safe_inv_sqrt_diag_from_sums(mat, eps=1e-12):
    d = np.sum(mat, axis=0)
    return 1.0 / np.sqrt(np.maximum(d, eps))


def update_z(c, alpha, gamma, f, max_iter=10):
    """Python version of ``update_Z.m``.

    The MATLAB code updates each column independently.  This implementation
    performs the same updates column-wise but vectorizes all columns into matrix
    operations, which is essential for practical Python runtime.
    """
    c = np.asarray(c, dtype=float)
    f = np.asarray(f, dtype=float)
    n = c.shape[1]
    eye = np.eye(n)
    lc = np.diag(np.sum(c, axis=0)) - c
    a = lc + float(alpha) * eye
    diff = float(gamma) * l2_distance(f.T, f.T)
    b = 2 * float(alpha) * eye - diff
    rho = 1.5
    yita = 10.0
    q = np.ones((n, n), dtype=float)
    z = np.ones((n, n), dtype=float) / n
    for _ in range(max_iter):
        p = z - (a.T @ z + q) / yita
        temp = p - q / yita - (a @ p - b) / yita
        z = eproj_simplex_columns(temp)
        yita *= rho
        q = q + yita * (z - p)
    return 0.5 * (z + z.T)


def _objective(kernel_consensus, z, s, a_list, alpha, lam, gamma, eye):
    d = np.sum(z, axis=0)
    inv_sqrt = 1.0 / np.sqrt(np.maximum(d, 1e-12))
    norm_z = (inv_sqrt[:, None] * z) * inv_sqrt[None, :]
    obj = np.trace(kernel_consensus) - 2 * np.trace(kernel_consensus @ z) + np.trace(z.T @ kernel_consensus @ z)
    obj += lam * np.linalg.norm(z, 'fro') ** 2
    for ai, ker in zip(alpha, a_list):
        obj += np.linalg.norm(kernel_consensus - ai * ker, 'fro') ** 2
    obj += gamma * np.linalg.norm(s - eye, 'fro') ** 2
    obj += np.sum(np.diag(s.T @ (eye - norm_z) @ s))
    return float(np.real(obj))


def _solve(
    a_list,
    lam,
    gamma,
    clu,
    max_iter=20,
    gam=1.5,
    tol_factor=1e-2,
    progress_callback=None,
):
    if not isinstance(a_list, (list, tuple)):
        raise TypeError('a_list must be a list/tuple of kernel matrices')
    a_list = [np.asarray(a, dtype=float) for a in a_list]
    n = a_list[0].shape[0]
    if any(a.shape != (n, n) for a in a_list):
        raise ValueError('all kernels must be square matrices with the same size')
    order = len(a_list)
    eye = np.eye(n)
    z = eye.copy()
    s = z.copy()
    alpha = np.ones(order, dtype=float) / order
    kernel_consensus = sum(a_list) / order
    l = np.diag(np.sum(s, axis=0)) - s
    h, _, _ = eig1(l, int(clu), is_max=False, is_sym=True)
    obj = []

    for iteration in range(1, max_iter + 1):
        inv_sqrt = _safe_inv_sqrt_diag_from_sums(z)
        g = inv_sqrt[:, None] * s
        lhs = 2 * kernel_consensus + 2 * float(lam) * eye
        rhs = 2 * kernel_consensus + g @ g.T
        try:
            z = np.linalg.solve(lhs, rhs)
        except np.linalg.LinAlgError:
            z = np.linalg.pinv(lhs) @ rhs
        z = np.maximum(0.0, np.real(z))

        temp = sum(2 * ai * ker for ai, ker in zip(alpha, a_list))
        kernel_consensus = (temp + 2 * z.T - eye - z @ z.T) / (2 * order)
        kernel_consensus = project_psd_symmetric(kernel_consensus)

        s = update_z(z, gamma, gam, h)
        s = 0.5 * (s + s.T)

        tr_ata = np.array([np.sum(ker ** 2) for ker in a_list], dtype=float)
        tr_ata = np.maximum(tr_ata, 1e-12)
        tr_cta = np.array([np.trace(kernel_consensus @ ker) for ker in a_list], dtype=float)
        tr_caaa = tr_cta / tr_ata
        beta = (np.sum(tr_caaa) - 1.0) * 2.0 / np.sum(1.0 / tr_ata)
        alpha = (2 * tr_cta - beta) / (2 * tr_ata)

        lz = np.diag(np.sum(s, axis=0)) - s
        h, _, _ = eig1(lz, int(clu), is_max=False, is_sym=True)
        current = _objective(kernel_consensus, z, s, a_list, alpha, float(lam), float(gamma), eye)
        obj.append(current)
        if progress_callback is not None:
            progress_callback(iteration, current)
        if len(obj) >= 2 and abs(obj[-1] - obj[-2]) < tol_factor * max(abs(obj[-1]), 1e-12):
            break
    return s, z, kernel_consensus, alpha, np.array(obj)


def solver_aktec1(a_list, lam, gamma, clu, max_iter=20, return_obj=False, progress_callback=None):
    """Python version of ``solver_AKTEC1.m``.

    Returns ``(S, Z, K)`` by default, matching the MATLAB output order.
    """
    s, z, k, alpha, obj = _solve(
        a_list,
        lam,
        gamma,
        clu,
        max_iter=max_iter,
        gam=1.5,
        tol_factor=1e-2,
        progress_callback=progress_callback,
    )
    if return_obj:
        return s, z, k, alpha, obj
    return s, z, k


def solver_aktec_large(a_list, lam, gamma, clu, max_iter=10, return_obj=False, progress_callback=None):
    """Python version of ``solver_AKTEC_large.m``.

    Returns ``(S, Z, alpha)`` by default, matching the MATLAB output order.
    """
    s, z, k, alpha, obj = _solve(
        a_list,
        lam,
        gamma,
        clu,
        max_iter=max_iter,
        gam=1.4,
        tol_factor=1e-1,
        progress_callback=progress_callback,
    )
    if return_obj:
        return s, z, alpha, obj
    return s, z, alpha
