CREATE TABLE solver_jobs (
 id VARCHAR(64) PRIMARY KEY,
 schedule_id BIGINT NOT NULL,
 status VARCHAR(20) NOT NULL,
 data JSON NOT NULL,
 created_at DATETIME(6) NOT NULL,
 updated_at DATETIME(6) NOT NULL,
 INDEX ix_solver_schedule (schedule_id,created_at),
 FOREIGN KEY (schedule_id) REFERENCES schedules(id)
) ENGINE=InnoDB;
