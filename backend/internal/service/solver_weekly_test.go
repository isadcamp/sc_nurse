package service

import (
	"nurse-scheduler/backend/internal/domain"
	"testing"
)

func TestSolverResultHasNoWorkRejectsWeeklyOffOnly(t *testing.T) {
	r := domain.Roster{Year: 2026, Month: 4}
	r.Policy.StaffingMode = "weekly"
	for day := 1; day <= 7; day++ {
		r.Policy.WeeklyStaffing = append(r.Policy.WeeklyStaffing, domain.WeeklyStaffing{Weekday: day, Start: 480, End: 960, RN: 1})
	}
	off := &domain.SolverOutput{Status: "timeout", Assignments: []domain.Cell{{Date: "2026-04-01", NurseID: "n1", ShiftCode: "X"}}}
	if !solverResultHasNoWork(r, off) || solverResultCanApply(r, off) {
		t.Fatal("off-only result must not be applicable")
	}
	work := &domain.SolverOutput{Status: "partial", Assignments: []domain.Cell{{Date: "2026-04-01", NurseID: "n1", ShiftCode: "ช"}}}
	if solverResultHasNoWork(r, work) {
		t.Fatal("working result rejected")
	}
}
