import os
import sys
from pathlib import Path


BACKEND_ROOT = Path(__file__).resolve().parents[1]

os.environ.setdefault("EMAIL_VERIFICATION_REQUIRED", "false")
os.environ.setdefault("TURNSTILE_SECRET_KEY", "")

if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))
