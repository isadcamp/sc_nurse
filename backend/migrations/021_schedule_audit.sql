CREATE TABLE schedule_audit (
 id BIGINT AUTO_INCREMENT PRIMARY KEY,
 schedule_id BIGINT NULL,
 ward_id VARCHAR(50) NOT NULL,
 actor VARCHAR(100) NOT NULL,
 action VARCHAR(30) NOT NULL,
 reason TEXT NOT NULL,
 before_data LONGTEXT NOT NULL,
 after_data LONGTEXT NOT NULL,
 created_at DATETIME(6) NOT NULL,
 INDEX ix_schedule_audit (schedule_id, created_at),
 FOREIGN KEY (schedule_id) REFERENCES schedules(id)
);