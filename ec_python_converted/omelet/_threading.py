"""Runtime BLAS thread limiter.

Some OpenBLAS builds are very slow or can appear to hang for medium-sized
matrix operations when too many threads are used.  Scikit-learn depends on
threadpoolctl, so we use it to make the converted demo reliably runnable.
"""
try:
    from threadpoolctl import threadpool_limits
except Exception:  # pragma: no cover
    threadpool_limits = None

_THREADPOOL_CONTROLLER = None


def limit_threads(limits=1):
    global _THREADPOOL_CONTROLLER
    if threadpool_limits is None:
        return None
    _THREADPOOL_CONTROLLER = threadpool_limits(limits=limits)
    return _THREADPOOL_CONTROLLER

# Apply immediately for normal package use.
limit_threads(1)
