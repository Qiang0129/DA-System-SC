import os
import sys
from pathlib import Path


BACKEND_ROOT = Path(__file__).resolve().parents[1]

os.environ.setdefault("EMAIL_VERIFICATION_REQUIRED", "false")
os.environ.setdefault("TURNSTILE_SECRET_KEY", "")
# 测试进程使用独立密钥，避免依赖开发机配置或提交真实凭据。
os.environ.setdefault("APP_ENV", "test")
os.environ.setdefault("JWT_SECRET_KEY", "test-jwt-secret-key-for-pytest-32-bytes")

if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))
