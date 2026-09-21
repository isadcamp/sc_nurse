CREATE TABLE policy_snapshots (
 job_id VARCHAR(64) PRIMARY KEY,
 snapshot_hash CHAR(64) NOT NULL,
 data JSON NOT NULL,
 FOREIGN KEY (job_id) REFERENCES solver_jobs(id)
) ENGINE=InnoDB;
