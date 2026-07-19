CREATE DATABASE IF NOT EXISTS soft_web
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE soft_web;

CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  username VARCHAR(64) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(32) NOT NULL DEFAULT 'user',
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  last_login_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_users_username (username),
  KEY idx_users_status (status)
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
  CONSTRAINT fk_analysis_tasks_user_id
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_analysis_tasks_dataset_id
    FOREIGN KEY (dataset_id) REFERENCES datasets(id)
    ON DELETE CASCADE
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
