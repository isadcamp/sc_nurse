-- 016_create_schedules.sql
CREATE TABLE schedules (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    ward_id VARCHAR(50) NOT NULL,
    month INT NOT NULL,
    year INT NOT NULL,
    status ENUM('draft','final') NOT NULL DEFAULT 'draft',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_ward_month_year (ward_id, month, year)
);
