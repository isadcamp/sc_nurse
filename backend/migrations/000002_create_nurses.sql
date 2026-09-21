-- 000002_create_nurses.sql
CREATE TABLE IF NOT EXISTS nurses (
    id VARCHAR(36) PRIMARY KEY,
    ward_id VARCHAR(36) NOT NULL,
    name VARCHAR(255) NOT NULL,
    position ENUM('RN','PN') NOT NULL,
    is_charge_eligible BOOLEAN NOT NULL DEFAULT FALSE,
    can_double_shift BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    skills JSON,
    allowed_shift_codes JSON,
    version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    created_by VARCHAR(64),
    updated_by VARCHAR(64),
    CONSTRAINT fk_nurse_ward FOREIGN KEY (ward_id) REFERENCES wards(id) ON DELETE CASCADE
) ENGINE=InnoDB;
