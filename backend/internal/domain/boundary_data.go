package domain

import "time"

type BoundaryData struct {
	ScheduleID         int64          `json:"schedule_id"`
	PreviousMonthHours map[string]int `json:"previous_month_hours"` // key = nurseID, value = hours
	NextMonthHours     map[string]int `json:"next_month_hours"`
	CreatedAt          time.Time      `json:"created_at"`
	UpdatedAt          time.Time      `json:"updated_at"`
}
