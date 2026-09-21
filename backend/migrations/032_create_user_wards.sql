-- 032_create_user_wards.sql
CREATE TABLE IF NOT EXISTS user_wards (
    user_id INT NOT NULL,
    ward_id VARCHAR(36) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, ward_id),
    CONSTRAINT fk_user_wards_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_user_wards_ward FOREIGN KEY (ward_id) REFERENCES wards(id) ON DELETE CASCADE
) ENGINE=InnoDB;
