package domain

import "time"

type LeaveStatus string

const (
	LeavePending  LeaveStatus = "pending"
	LeaveApproved LeaveStatus = "approved"
	LeaveRejected LeaveStatus = "rejected"
)

type LeaveRequest struct {
	ID        int64       `json:"id"`
	WardID    string      `json:"wardId"`
	NurseID   string      `json:"nurseId"`
	StartDate time.Time   `json:"startDate"`
	EndDate   time.Time   `json:"endDate"`
	Reason    string      `json:"reason"`
	Status    LeaveStatus `json:"status"`
	Approver  string      `json:"approver,omitempty"`
	CreatedAt time.Time   `json:"createdAt"`
	UpdatedAt time.Time   `json:"updatedAt"`
}
