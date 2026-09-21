package domain

import "time"

type GenerateScheduleRequest struct {
	StartDate        string `json:"startDate"`
	Days             int    `json:"days"`
	RequiredPerShift int    `json:"requiredPerShift"`
}

type GeneratedAssignment struct {
	Date      string `json:"date"`
	Shift     string `json:"shift"`
	NurseID   string `json:"nurseId"`
	NurseName string `json:"nurseName"`
	IsLeader  bool   `json:"isLeader"`
}

type GeneratedSchedule struct {
	ID          string                `json:"id"`
	Status      string                `json:"status"`
	Assignments []GeneratedAssignment `json:"assignments"`
	Warnings    []string              `json:"warnings"`
	GeneratedAt time.Time             `json:"generatedAt"`
}
