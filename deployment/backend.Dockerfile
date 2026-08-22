FROM python:3.12.14-slim@sha256:2c941e860699f878900b0edc2403613c234d4b32eda3cc9fa7036991a2a63c4a

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONUTF8=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    OMP_NUM_THREADS=1 \
    OPENBLAS_NUM_THREADS=1 \
    MKL_NUM_THREADS=1

WORKDIR /app

COPY backend/requirements-lock.txt /tmp/backend-requirements.txt
COPY ec_python_converted/requirements-lock.txt /tmp/algorithm-requirements.txt
RUN python -m pip install --no-cache-dir \
      -r /tmp/backend-requirements.txt \
      -r /tmp/algorithm-requirements.txt \
    && rm -f /tmp/backend-requirements.txt /tmp/algorithm-requirements.txt

COPY backend /app/backend
COPY ec_python_converted /app/ec_python_converted

RUN groupadd --gid 1000 app \
    && useradd --uid 1000 --gid 1000 --create-home --shell /usr/sbin/nologin app \
    && mkdir -p /data/datasets /data/results \
    && chown -R app:app /app /data

USER app
WORKDIR /app/backend

EXPOSE 8000
CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--proxy-headers", "--forwarded-allow-ips=*"]
