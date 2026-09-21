package domain

import "time"

type AssignmentLock struct {
	AssignmentID int64     `json:"assignment_id"`
	LockedBy     string    `json:"locked_by"`
	LockedAt     time.Time `json:"locked_at"`
}
