-- 034_add_part_time_to_nurses.sql
ALTER TABLE nurses ADD COLUMN is_part_time BOOLEAN NOT NULL DEFAULT FALSE AFTER can_double_shift;
