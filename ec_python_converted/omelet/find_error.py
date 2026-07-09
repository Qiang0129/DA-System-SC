import numpy as np


def change_ground_truth(gt):
    gt = np.asarray(gt).reshape(-1)
    return (gt[:, None] == gt[None, :]).astype(float)


def find_error(ca, bound, gt):
    ca = np.asarray(ca, dtype=float)
    ground_truth = change_ground_truth(gt)
    e = ca.copy()
    e[ca >= bound] = 0.0
    a = ca - e
    a[a > 0] = 1.0
    return ground_truth - a
