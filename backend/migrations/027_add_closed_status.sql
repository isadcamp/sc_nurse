-- 027_add_closed_status.sql
ALTER TABLE schedules
  MODIFY COLUMN status ENUM('draft','generated','under_review','approved','published','closed') NOT NULL DEFAULT 'draft',
  ADD COLUMN closed_by VARCHAR(100) NULL,
  ADD COLUMN closed_at DATETIME NULL;
