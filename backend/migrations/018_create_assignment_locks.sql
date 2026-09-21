-- 018_create_assignment_locks.sql
CREATE TABLE assignment_locks (
    assignment_id BIGINT PRIMARY KEY,
    locked_by VARCHAR(100) NOT NULL,
    locked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (assignment_id) REFERENCES schedule_assignments(id) ON DELETE CASCADE
);
