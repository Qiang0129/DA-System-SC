import os
import subprocess
import sys
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.config import MIN_JWT_SECRET_BYTES, Settings
from main import validate_startup_configuration


BACKEND_ROOT = Path(__file__).resolve().parents[1]
VALID_SECRET = "test-jwt-secret-key-for-config-32-bytes"


def make_settings(**overrides):
    values = {
        "_env_file": None,
        "APP_ENV": "test",
        "JWT_SECRET_KEY": VALID_SECRET,
    }
    values.update(overrides)
    return Settings(**values)


def test_jwt_secret_is_required_without_a_default():
    with pytest.raises(ValidationError, match="JWT_SECRET_KEY"):
        Settings(_env_file=None, APP_ENV="test", JWT_SECRET_KEY=None)


def test_jwt_secret_must_be_at_least_32_bytes():
    with pytest.raises(ValidationError, match=str(MIN_JWT_SECRET_BYTES)):
        make_settings(JWT_SECRET_KEY="a" * (MIN_JWT_SECRET_BYTES - 1))


def test_template_placeholder_is_not_accepted():
    with pytest.raises(ValidationError, match="占位值"):
        make_settings(JWT_SECRET_KEY="replace_with_a_random_secret")


def test_valid_secret_loads_in_each_environment():
    for environment in ("development", "test", "production"):
        settings = make_settings(APP_ENV=environment)
        assert settings.app_env == environment
        assert len(settings.jwt_secret_key.encode("utf-8")) >= MIN_JWT_SECRET_BYTES


def test_startup_configuration_rejects_invalid_constructed_settings():
    invalid_settings = Settings.model_construct(app_env="production", jwt_secret_key=None)

    with pytest.raises(RuntimeError, match="JWT_SECRET_KEY"):
        validate_startup_configuration(invalid_settings)


def test_production_import_fails_without_jwt_secret():
    environment = os.environ.copy()
    environment["APP_ENV"] = "production"
    # 本地 database.env 可能存在开发密钥，显式传空值才能验证生产环境的缺失配置。
    environment["JWT_SECRET_KEY"] = ""

    result = subprocess.run(
        [sys.executable, "-c", "import main"],
        cwd=BACKEND_ROOT,
        env=environment,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )

    assert result.returncode != 0
    assert "JWT_SECRET_KEY" in result.stderr
