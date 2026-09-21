package domain

import "time"

type Assignment struct {
	ID         int64     `json:"id"`
	ScheduleID int64     `json:"schedule_id"`
	NurseID    string    `json:"nurse_id"`
	Date       time.Time `json:"date"`
	ShiftCode  string    `json:"shift_code"`
	Version    int       `json:"version"`
	CreatedAt  time.Time `json:"created_at"`
	UpdatedAt  time.Time `json:"updated_at"`
}
