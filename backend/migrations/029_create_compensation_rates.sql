-- 029_create_compensation_rates.sql
CREATE TABLE IF NOT EXISTS compensation_rates (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    position VARCHAR(20) NOT NULL,
    eve_night_rate DOUBLE NOT NULL,
    ot_rate DOUBLE NOT NULL,
    effective_from DATE NOT NULL,
    effective_to DATE NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_pos_effective (position, effective_from)
);
