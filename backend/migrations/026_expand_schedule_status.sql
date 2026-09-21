-- 026_expand_schedule_status.sql
ALTER TABLE schedules
  DROP INDEX uq_ward_month_year,
  MODIFY COLUMN status ENUM('draft','generated','under_review','approved','published') NOT NULL DEFAULT 'draft',
  ADD COLUMN version INT NOT NULL DEFAULT 1,
  ADD COLUMN parent_id BIGINT NULL,
  ADD COLUMN submitted_by VARCHAR(100) NULL,
  ADD COLUMN submitted_at DATETIME NULL,
  ADD COLUMN approved_by VARCHAR(100) NULL,
  ADD COLUMN approved_at DATETIME NULL,
  ADD COLUMN published_by VARCHAR(100) NULL,
  ADD COLUMN published_at DATETIME NULL;
