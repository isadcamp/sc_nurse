-- 019_create_schedule_boundary_data.sql
CREATE TABLE schedule_boundary_data (
    schedule_id BIGINT PRIMARY KEY,
    previous_month_hours JSON,
    next_month_hours JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON DELETE CASCADE
);
