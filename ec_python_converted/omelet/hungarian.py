import numpy as np
from scipy.optimize import linear_sum_assignment


def hungarian(cost_matrix):
    """Solve the assignment problem, replacing ``hungarian.m``."""
    a = np.asarray(cost_matrix, dtype=float)
    if a.ndim != 2 or a.shape[0] != a.shape[1]:
        raise ValueError('cost_matrix must be square')
    row_ind, col_ind = linear_sum_assignment(a)
    # MATLAB hungarian.m returns C where C(j)=i.  Here assignment[j] = i + 1.
    assignment = np.zeros(a.shape[1], dtype=int)
    assignment[col_ind] = row_ind + 1
    total = float(a[row_ind, col_ind].sum())
    return assignment, total
