from pathlib import Path
import numpy as np
from scipy.io import loadmat


def load_ensemble_data(path):
    """Load ensemble clustering data from .mat or .npz.

    The returned tuple is ``(E, y)`` where E is N-by-M and y is a 1-D label vector.
    """
    path = Path(path)
    if path.suffix.lower() == '.npz':
        data = np.load(path, allow_pickle=False)
        return np.asarray(data['E']), np.asarray(data['y']).reshape(-1)
    if path.suffix.lower() == '.mat':
        data = loadmat(path)
        if 'E' not in data or 'y' not in data:
            raise KeyError('MAT file must contain variables E and y')
        return np.asarray(data['E']), np.asarray(data['y']).reshape(-1)
    raise ValueError(f'unsupported data file: {path}')
