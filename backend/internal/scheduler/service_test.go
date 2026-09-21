package scheduler

import (
	"nurse-scheduler/backend/internal/domain"
	"testing"
	"time"
)

func TestScheduleInvariants(t *testing.T) {
	result, err := NewService().Generate(domain.GenerateScheduleRequest{StartDate: "2026-09-14", Days: 7, RequiredPerShift: 2})
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Assignments) != 42 || len(result.Warnings) != 0 {
		t.Fatalf("unexpected coverage: %d, %v", len(result.Assignments), result.Warnings)
	}
	seen := map[string]bool{}
	nights := map[string]bool{}
	leaders := map[string]bool{}
	for _, a := range result.Assignments {
		key := a.Date + a.NurseID
		if seen[key] {
			t.Fatalf("duplicate nurse/day: %s", key)
		}
		seen[key] = true
		day, _ := time.Parse("2006-01-02", a.Date)
		if a.Shift == "M" && nights[day.AddDate(0, 0, -1).Format("2006-01-02")+a.NurseID] {
			t.Fatal("night followed by morning")
		}
		if a.Shift == "N" {
			nights[key] = true
		}
		if a.IsLeader {
			leaders[a.Date+a.Shift] = true
		}
	}
	if len(leaders) != 21 {
		t.Fatal("missing shift leader")
	}
}

func TestInsufficientStaffProducesWarnings(t *testing.T) {
	result, err := NewService().Generate(domain.GenerateScheduleRequest{StartDate: "2026-09-14", Days: 1, RequiredPerShift: 10})
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Warnings) == 0 {
		t.Fatal("expected shortage warning")
	}
}
