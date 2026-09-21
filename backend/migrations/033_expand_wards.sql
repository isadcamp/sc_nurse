-- 033_expand_wards.sql
ALTER TABLE wards
    ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN description VARCHAR(255) NULL;
