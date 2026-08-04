-- 当前数据库结构快照，仅用于初始化和人工核对；生产环境迁移入口是 Alembic。
-- 部署或升级时请先执行：python -m alembic upgrade head

CREATE DATABASE IF NOT EXISTS soft_web
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE soft_web;

-- 当前连接以及应用连接统一使用 UTC；DATETIME 字段不携带时区，语义由此固定。
SET time_zone = '+00:00';

CREATE TABLE IF NOT EXISTS alembic_version (
  version_num VARCHAR(32) NOT NULL,
  PRIMARY KEY (version_num)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(128) NOT NULL,
  description VARCHAR(255) NOT NULL,
  migrated_rows INT UNSIGNED NOT NULL DEFAULT 0,
  skipped_rows INT UNSIGNED NOT NULL DEFAULT 0,
  metadata_json TEXT NULL,
  applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  username VARCHAR(64) NOT NULL,
  email VARCHAR(255) NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(32) NOT NULL DEFAULT 'user',
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  last_login_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_users_username (username),
  UNIQUE KEY ix_users_email (email),
  KEY idx_users_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS email_verification_codes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  email VARCHAR(255) NOT NULL,
  purpose VARCHAR(32) NOT NULL DEFAULT 'register',
  code_hash VARCHAR(255) NOT NULL,
  client_ip VARCHAR(64) NULL,
  expires_at DATETIME NOT NULL,
  consumed_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_email_verification_codes_email (email),
  KEY idx_email_verification_codes_purpose (purpose),
  KEY idx_email_verification_codes_expires_at (expires_at),
  KEY idx_email_verification_codes_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_sessions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  refresh_token_hash VARCHAR(255) NOT NULL,
  expires_at DATETIME NOT NULL,
  revoked_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_user_sessions_refresh_token_hash (refresh_token_hash),
  KEY idx_user_sessions_user_id (user_id),
  KEY idx_user_sessions_expires_at (expires_at),
  CONSTRAINT fk_user_sessions_user_id
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS datasets (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(128) NOT NULL,
  original_filename VARCHAR(255) NOT NULL,
  storage_path VARCHAR(500) NOT NULL,
  file_hash VARCHAR(128) NOT NULL,
  sample_count INT UNSIGNED NOT NULL,
  base_cluster_count INT UNSIGNED NOT NULL,
  has_ground_truth TINYINT(1) NOT NULL DEFAULT 0,
  cluster_count INT UNSIGNED NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'ready',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_datasets_user_id (user_id),
  KEY idx_datasets_status (status),
  KEY idx_datasets_created_at (created_at),
  KEY idx_datasets_user_created_at (user_id, created_at),
  CONSTRAINT fk_datasets_user_id
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS analysis_tasks (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  dataset_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(128) NOT NULL DEFAULT '',
  mode VARCHAR(32) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'draft',
  progress DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  current_run INT UNSIGNED NOT NULL DEFAULT 0,
  current_iter INT UNSIGNED NOT NULL DEFAULT 0,
  max_iter INT UNSIGNED NOT NULL DEFAULT 20,
  params_json JSON NOT NULL,
  error_message TEXT NULL,
  failure_reason VARCHAR(64) NULL,
  current_stage VARCHAR(64) NULL,
  worker_id VARCHAR(128) NULL,
  heartbeat_at DATETIME NULL,
  retry_count INT NOT NULL DEFAULT 0,
  queued_at DATETIME NULL,
  started_at DATETIME NULL,
  finished_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_analysis_tasks_user_id (user_id),
  KEY idx_analysis_tasks_dataset_id (dataset_id),
  KEY idx_analysis_tasks_status (status),
  KEY idx_analysis_tasks_created_at (created_at),
  KEY idx_analysis_tasks_user_dataset (user_id, dataset_id),
  KEY idx_analysis_tasks_dataset_status_finished (dataset_id, status, finished_at),
  KEY idx_analysis_tasks_worker_id (worker_id),
  KEY idx_analysis_tasks_heartbeat_at (heartbeat_at),
  KEY idx_analysis_tasks_status_queued (status, queued_at, id),
  KEY idx_analysis_tasks_status_heartbeat (status, heartbeat_at),
  KEY idx_analysis_tasks_user_status_queued (user_id, status, queued_at),
  CONSTRAINT fk_analysis_tasks_user_id
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_analysis_tasks_dataset_id
    FOREIGN KEY (dataset_id) REFERENCES datasets(id)
    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS dataset_revisions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  dataset_id BIGINT UNSIGNED NOT NULL,
  version INT UNSIGNED NOT NULL,
  action VARCHAR(32) NOT NULL,
  name VARCHAR(128) NOT NULL,
  original_filename VARCHAR(255) NOT NULL,
  storage_path VARCHAR(500) NOT NULL,
  file_hash VARCHAR(128) NOT NULL,
  sample_count INT UNSIGNED NOT NULL,
  base_cluster_count INT UNSIGNED NOT NULL,
  has_ground_truth TINYINT(1) NOT NULL DEFAULT 0,
  cluster_count INT UNSIGNED NULL,
  quality_status VARCHAR(16) NOT NULL DEFAULT 'ready',
  quality_issues_json JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_dataset_revisions_dataset_version (dataset_id, version),
  KEY idx_dataset_revisions_dataset_id (dataset_id),
  KEY idx_dataset_revisions_created_at (created_at),
  CONSTRAINT fk_dataset_revisions_dataset_id
    FOREIGN KEY (dataset_id) REFERENCES datasets(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS dataset_qualities (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  dataset_id BIGINT UNSIGNED NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'ready',
  issues_json JSON NULL,
  checked_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_dataset_qualities_dataset_id (dataset_id),
  KEY idx_dataset_qualities_dataset_id (dataset_id),
  KEY idx_dataset_qualities_status (status),
  CONSTRAINT fk_dataset_qualities_dataset_id
    FOREIGN KEY (dataset_id) REFERENCES datasets(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 历史草稿任务表，仅供 P0-01 Alembic 迁移读取；运行时业务统一使用 analysis_tasks。
CREATE TABLE IF NOT EXISTS dataset_tasks (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  dataset_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(128) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'draft',
  selected_base_count INT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_dataset_tasks_user_id (user_id),
  KEY idx_dataset_tasks_dataset_id (dataset_id),
  KEY idx_dataset_tasks_status (status),
  KEY idx_dataset_tasks_created_at (created_at),
  CONSTRAINT fk_dataset_tasks_user_id
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_dataset_tasks_dataset_id
    FOREIGN KEY (dataset_id) REFERENCES datasets(id)
    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS task_templates (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(128) NOT NULL,
  mode VARCHAR(32) NOT NULL DEFAULT 'OMELET-SV',
  params_json JSON NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_task_templates_user_id (user_id),
  KEY idx_task_templates_created_at (created_at),
  CONSTRAINT fk_task_templates_user_id
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS task_results (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  schema_version INT NULL,
  task_id BIGINT UNSIGNED NOT NULL,
  metrics_json JSON NULL,
  kernel_weights_json JSON NULL,
  convergence_json JSON NULL,
  preview_json JSON NULL,
  labels_path VARCHAR(500) NULL,
  ca_matrix_path VARCHAR(500) NULL,
  s_matrix_path VARCHAR(500) NULL,
  z_matrix_path VARCHAR(500) NULL,
  runtime_seconds DECIMAL(12,4) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_task_results_task_id (task_id),
  CONSTRAINT fk_task_results_task_id
    FOREIGN KEY (task_id) REFERENCES analysis_tasks(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS task_exports (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  task_id BIGINT UNSIGNED NOT NULL,
  export_type VARCHAR(32) NOT NULL,
  name VARCHAR(128) NULL,
  items_json JSON NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'ready',
  filename VARCHAR(255) NOT NULL,
  storage_path VARCHAR(500) NOT NULL,
  file_size BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_task_exports_task_id (task_id),
  KEY idx_task_exports_task_id_id (task_id, id),
  KEY idx_task_exports_export_type (export_type),
  CONSTRAINT fk_task_exports_task_id
    FOREIGN KEY (task_id) REFERENCES analysis_tasks(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS operation_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NULL,
  task_id BIGINT UNSIGNED NULL,
  action VARCHAR(64) NOT NULL,
  level VARCHAR(16) NOT NULL DEFAULT 'info',
  message VARCHAR(500) NOT NULL,
  detail_json JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_operation_logs_user_id (user_id),
  KEY idx_operation_logs_task_id (task_id),
  KEY idx_operation_logs_action (action),
  KEY idx_operation_logs_created_at (created_at),
  CONSTRAINT fk_operation_logs_user_id
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE SET NULL,
  CONSTRAINT fk_operation_logs_task_id
    FOREIGN KEY (task_id) REFERENCES analysis_tasks(id)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS storage_cleanup_jobs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  storage_path VARCHAR(500) NOT NULL,
  storage_kind VARCHAR(32) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'pending',
  attempts INT UNSIGNED NOT NULL DEFAULT 0,
  last_error TEXT NULL,
  next_attempt_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_storage_cleanup_jobs_storage_path (storage_path),
  KEY idx_storage_cleanup_jobs_status_retry (status, next_attempt_at, id),
  KEY idx_storage_cleanup_jobs_created_at (created_at),
  KEY idx_storage_cleanup_jobs_status (status),
  KEY idx_storage_cleanup_jobs_next_attempt_at (next_attempt_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
