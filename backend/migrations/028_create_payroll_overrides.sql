-- 028_create_payroll_overrides.sql
CREATE TABLE IF NOT EXISTS payroll_overrides (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    schedule_id BIGINT NOT NULL,
    nurse_id VARCHAR(50) NOT NULL,
    field_name VARCHAR(50) NOT NULL,
    original_value DOUBLE NOT NULL,
    override_value DOUBLE NOT NULL,
    reason TEXT NOT NULL,
    approved_by VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_schedule_nurse (schedule_id, nurse_id)
);
