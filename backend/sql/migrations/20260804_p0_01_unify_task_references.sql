USE soft_web;

-- 迁移版本表只记录已经完整提交的迁移。旧表保留时，版本号是防止重复导入的唯一依据。
CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(128) NOT NULL,
  description VARCHAR(255) NOT NULL,
  migrated_rows INT UNSIGNED NOT NULL DEFAULT 0,
  skipped_rows INT UNSIGNED NOT NULL DEFAULT 0,
  applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELIMITER $$

DROP PROCEDURE IF EXISTS migrate_p0_01_unify_task_references$$

CREATE PROCEDURE migrate_p0_01_unify_task_references()
migration_block: BEGIN
  DECLARE migration_version VARCHAR(128) DEFAULT '20260804_p0_01_unify_task_references';
  DECLARE migration_applied INT DEFAULT 0;
  DECLARE legacy_table_exists INT DEFAULT 0;
  DECLARE legacy_row_count INT DEFAULT 0;
  DECLARE migratable_row_count INT DEFAULT 0;
  DECLARE migrated_row_count INT DEFAULT 0;
  DECLARE skipped_row_count INT DEFAULT 0;
  DECLARE orphan_task_count INT DEFAULT 0;
  DECLARE dataset_fk_name VARCHAR(128) DEFAULT NULL;
  DECLARE index_exists INT DEFAULT 0;

  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  SELECT COUNT(*)
    INTO migration_applied
    FROM schema_migrations
   WHERE version = migration_version;

  IF migration_applied > 0 THEN
    SELECT
      migration_version AS version,
      'already_applied' AS status,
      migrated_rows,
      skipped_rows,
      applied_at
    FROM schema_migrations
    WHERE version = migration_version;
    LEAVE migration_block;
  END IF;

  -- 先确认正式任务没有悬空引用，再把数据集删除策略改成数据库级 RESTRICT。
  SELECT COUNT(*)
    INTO orphan_task_count
    FROM analysis_tasks AS task
    LEFT JOIN datasets AS dataset ON dataset.id = task.dataset_id
   WHERE dataset.id IS NULL;

  IF orphan_task_count > 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'analysis_tasks 存在无效 dataset_id，停止 P0-01 迁移';
  END IF;

  SELECT MAX(kcu.CONSTRAINT_NAME)
    INTO dataset_fk_name
    FROM information_schema.KEY_COLUMN_USAGE AS kcu
   WHERE kcu.CONSTRAINT_SCHEMA = DATABASE()
     AND kcu.TABLE_NAME = 'analysis_tasks'
     AND kcu.COLUMN_NAME = 'dataset_id'
     AND kcu.REFERENCED_TABLE_NAME = 'datasets';

  IF dataset_fk_name IS NOT NULL THEN
    SET @drop_dataset_fk_sql = CONCAT(
      'ALTER TABLE analysis_tasks DROP FOREIGN KEY `',
      REPLACE(dataset_fk_name, '`', '``'),
      '`'
    );
    PREPARE drop_dataset_fk_statement FROM @drop_dataset_fk_sql;
    EXECUTE drop_dataset_fk_statement;
    DEALLOCATE PREPARE drop_dataset_fk_statement;
  END IF;

  ALTER TABLE analysis_tasks
    ADD CONSTRAINT fk_analysis_tasks_dataset_id
    FOREIGN KEY (dataset_id) REFERENCES datasets(id)
    ON DELETE RESTRICT;

  SELECT COUNT(*)
    INTO index_exists
    FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'analysis_tasks'
     AND INDEX_NAME = 'idx_analysis_tasks_user_dataset';

  IF index_exists = 0 THEN
    ALTER TABLE analysis_tasks
      ADD INDEX idx_analysis_tasks_user_dataset (user_id, dataset_id);
  END IF;

  SELECT COUNT(*)
    INTO index_exists
    FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'analysis_tasks'
     AND INDEX_NAME = 'idx_analysis_tasks_dataset_status_finished';

  IF index_exists = 0 THEN
    ALTER TABLE analysis_tasks
      ADD INDEX idx_analysis_tasks_dataset_status_finished (dataset_id, status, finished_at);
  END IF;

  SELECT COUNT(*)
    INTO legacy_table_exists
    FROM information_schema.TABLES
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'dataset_tasks';

  START TRANSACTION;

  IF legacy_table_exists > 0 THEN
    SELECT COUNT(*)
      INTO legacy_row_count
      FROM dataset_tasks;

    SELECT COUNT(*)
      INTO migratable_row_count
      FROM dataset_tasks AS legacy_task
      JOIN users AS owner ON owner.id = legacy_task.user_id
      JOIN datasets AS dataset
        ON dataset.id = legacy_task.dataset_id
       AND dataset.user_id = legacy_task.user_id
     WHERE legacy_task.status = 'draft'
       AND dataset.base_cluster_count > 0;

    SET skipped_row_count = legacy_row_count - migratable_row_count;

    INSERT INTO analysis_tasks (
      user_id,
      dataset_id,
      name,
      mode,
      status,
      progress,
      current_run,
      current_iter,
      max_iter,
      params_json,
      error_message,
      failure_reason,
      current_stage,
      queued_at,
      started_at,
      finished_at,
      created_at,
      updated_at
    )
    SELECT
      legacy_task.user_id,
      legacy_task.dataset_id,
      LEFT(
        COALESCE(NULLIF(TRIM(legacy_task.name), ''), CONCAT(dataset.name, ' OMELET-SV 任务')),
        128
      ),
      'OMELET-SV',
      'draft',
      0,
      0,
      0,
      10,
      JSON_OBJECT(
        'nBase', LEAST(
          GREATEST(COALESCE(NULLIF(legacy_task.selected_base_count, 0), 20), 1),
          dataset.base_cluster_count
        ),
        'sigma', 1.0,
        'lambda', 5.0,
        'gamma', 5.0,
        'anchor', 10,
        'runs', 10,
        'maxIter', 10,
        'randomSeed', 1,
        'legacyDatasetTaskId', legacy_task.id
      ),
      NULL,
      NULL,
      NULL,
      NULL,
      NULL,
      NULL,
      COALESCE(legacy_task.created_at, CURRENT_TIMESTAMP),
      COALESCE(legacy_task.updated_at, legacy_task.created_at, CURRENT_TIMESTAMP)
    FROM dataset_tasks AS legacy_task
    JOIN users AS owner ON owner.id = legacy_task.user_id
    JOIN datasets AS dataset
      ON dataset.id = legacy_task.dataset_id
     AND dataset.user_id = legacy_task.user_id
    WHERE legacy_task.status = 'draft'
      AND dataset.base_cluster_count > 0;

    SET migrated_row_count = ROW_COUNT();

    IF migrated_row_count <> migratable_row_count THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = '历史草稿迁移数量校验失败，已回滚 P0-01 数据迁移';
    END IF;
  END IF;

  INSERT INTO schema_migrations (
    version,
    description,
    migrated_rows,
    skipped_rows
  ) VALUES (
    migration_version,
    '统一数据集任务引用到 analysis_tasks，并禁止级联删除正式任务',
    migrated_row_count,
    skipped_row_count
  );

  COMMIT;

  SELECT
    migration_version AS version,
    'applied' AS status,
    migrated_row_count AS migrated_rows,
    skipped_row_count AS skipped_rows,
    legacy_table_exists AS legacy_table_retained;
END$$

CALL migrate_p0_01_unify_task_references()$$
DROP PROCEDURE migrate_p0_01_unify_task_references$$

DELIMITER ;
