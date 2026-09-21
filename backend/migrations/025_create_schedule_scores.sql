CREATE TABLE schedule_scores (
 job_id VARCHAR(64) PRIMARY KEY,
 data JSON NOT NULL,
 FOREIGN KEY (job_id) REFERENCES solver_jobs(id)
) ENGINE=InnoDB;
