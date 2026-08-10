from functools import lru_cache
from pathlib import Path
from urllib.parse import quote_plus

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


BASE_DIR = Path(__file__).resolve().parents[1]
JWT_SECRET_PLACEHOLDER = "replace_with_a_random_secret"
MIN_JWT_SECRET_BYTES = 32


def validate_jwt_secret_key(value: str | None, app_env: str) -> str:
    """校验 JWT 密钥，避免应用在空密钥或弱密钥下运行。"""
    environment = (app_env or "development").strip().lower()
    secret = (value or "").strip()

    if not secret:
        if environment == "production":
            raise ValueError("生产环境必须配置 JWT_SECRET_KEY")
        raise ValueError(f"{environment} 环境必须配置 JWT_SECRET_KEY")
    if secret == JWT_SECRET_PLACEHOLDER:
        raise ValueError("JWT_SECRET_KEY 仍是配置模板占位值，请替换为随机密钥")
    if len(secret.encode("utf-8")) < MIN_JWT_SECRET_BYTES:
        raise ValueError(f"JWT_SECRET_KEY 至少需要 {MIN_JWT_SECRET_BYTES} 字节")
    return secret


class Settings(BaseSettings):
    app_env: str = Field("development", validation_alias="APP_ENV")
    max_dataset_file_size_mb: int = Field(100, ge=1, validation_alias="MAX_DATASET_FILE_SIZE_MB")
    max_matrix_rows: int = Field(50000, ge=1, validation_alias="MAX_MATRIX_ROWS")
    max_matrix_columns: int = Field(5000, ge=1, validation_alias="MAX_MATRIX_COLUMNS")
    max_mat_variables: int = Field(100, ge=1, validation_alias="MAX_MAT_VARIABLES")
    user_storage_quota_mb: int = Field(2048, ge=1, validation_alias="USER_STORAGE_QUOTA_MB")
    dataset_parse_timeout_seconds: float = Field(30.0, gt=0, validation_alias="DATASET_PARSE_TIMEOUT_SECONDS")
    db_host: str = Field("127.0.0.1", validation_alias="DB_HOST")
    db_port: int = Field(3306, validation_alias="DB_PORT")
    db_name: str = Field("soft_web", validation_alias="DB_NAME")
    db_user: str = Field("root", validation_alias="DB_USER")
    db_password: str = Field("", validation_alias="DB_PASSWORD")
    db_charset: str = Field("utf8mb4", validation_alias="DB_CHARSET")
    db_pool_size: int = Field(5, validation_alias="DB_POOL_SIZE")
    db_max_overflow: int = Field(10, validation_alias="DB_MAX_OVERFLOW")
    db_pool_recycle: int = Field(1800, validation_alias="DB_POOL_RECYCLE")
    db_echo_sql: bool = Field(False, validation_alias="DB_ECHO_SQL")

    jwt_secret_key: str | None = Field(None, validation_alias="JWT_SECRET_KEY")
    jwt_algorithm: str = Field("HS256", validation_alias="JWT_ALGORITHM")
    access_token_expire_minutes: int = Field(30, validation_alias="ACCESS_TOKEN_EXPIRE_MINUTES")
    refresh_token_expire_days: int = Field(7, validation_alias="REFRESH_TOKEN_EXPIRE_DAYS")
    dataset_storage_dir: Path = Field(
        BASE_DIR / "storage" / "datasets",
        validation_alias="DATASET_STORAGE_DIR",
    )
    result_storage_dir: Path = Field(
        BASE_DIR / "storage" / "results",
        validation_alias="RESULT_STORAGE_DIR",
    )
    task_executor_enabled: bool = Field(True, validation_alias="TASK_EXECUTOR_ENABLED")
    task_poll_interval_seconds: float = Field(1.0, validation_alias="TASK_POLL_INTERVAL_SECONDS")
    task_max_runtime_seconds: float = Field(3600.0, gt=0, validation_alias="TASK_MAX_RUNTIME_SECONDS")
    task_heartbeat_interval_seconds: float = Field(10.0, gt=0, validation_alias="TASK_HEARTBEAT_INTERVAL_SECONDS")
    task_heartbeat_timeout_seconds: float = Field(60.0, gt=0, validation_alias="TASK_HEARTBEAT_TIMEOUT_SECONDS")
    turnstile_secret_key: str = Field("", validation_alias="TURNSTILE_SECRET_KEY")
    turnstile_verify_url: str = Field(
        "https://challenges.cloudflare.com/turnstile/v0/siteverify",
        validation_alias="TURNSTILE_VERIFY_URL",
    )
    turnstile_timeout_seconds: float = Field(5.0, validation_alias="TURNSTILE_TIMEOUT_SECONDS")
    turnstile_pass_expire_minutes: int = Field(5, validation_alias="TURNSTILE_PASS_EXPIRE_MINUTES")
    email_verification_required: bool = Field(True, validation_alias="EMAIL_VERIFICATION_REQUIRED")
    email_code_expire_minutes: int = Field(10, validation_alias="EMAIL_CODE_EXPIRE_MINUTES")
    email_code_resend_cooldown_seconds: int = Field(60, validation_alias="EMAIL_CODE_RESEND_COOLDOWN_SECONDS")
    smtp_host: str = Field("smtp.qq.com", validation_alias="SMTP_HOST")
    smtp_port: int = Field(465, validation_alias="SMTP_PORT")
    smtp_username: str = Field("", validation_alias="SMTP_USERNAME")
    smtp_password: str = Field("", validation_alias="SMTP_PASSWORD")
    smtp_from_email: str = Field("", validation_alias="SMTP_FROM_EMAIL")
    smtp_from_name: str = Field("新材料数据分析系统", validation_alias="SMTP_FROM_NAME")
    smtp_use_ssl: bool = Field(True, validation_alias="SMTP_USE_SSL")
    smtp_timeout_seconds: float = Field(10.0, validation_alias="SMTP_TIMEOUT_SECONDS")

    cors_origins: str = Field(
        "http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174",
        validation_alias="CORS_ORIGINS",
    )

    model_config = SettingsConfigDict(
        env_file=str(BASE_DIR / "config" / "database.env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @model_validator(mode="after")
    def validate_security_settings(self):
        self.jwt_secret_key = validate_jwt_secret_key(self.jwt_secret_key, self.app_env)
        return self

    @property
    def database_url(self) -> str:
        password = quote_plus(self.db_password)
        return (
            f"mysql+pymysql://{self.db_user}:{password}"
            f"@{self.db_host}:{self.db_port}/{self.db_name}?charset={self.db_charset}"
        )

    @property
    def allowed_origins(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
