-- 017_create_schedule_assignments.sql
CREATE TABLE schedule_assignments (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    schedule_id BIGINT NOT NULL,
    nurse_id VARCHAR(50) NOT NULL,
    date DATE NOT NULL,
    shift_code VARCHAR(10) NOT NULL,
    version INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_schedule_date_nurse (schedule_id, date, nurse_id),
    FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON DELETE CASCADE
);
