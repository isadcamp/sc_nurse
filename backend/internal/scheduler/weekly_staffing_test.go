package scheduler

import (
	"context"
	"nurse-scheduler/backend/internal/domain"
	"testing"
	"time"
)

func weeklyPolicyForTest(r *domain.Roster) {
	r.Policy.StaffingMode = "weekly"
	r.Policy.Staffing = nil
	r.Policy.WeeklyStaffing = nil
	for day := 1; day <= 7; day++ {
		rn := 0
		if day == 2 {
			rn = 1
		}
		r.Policy.WeeklyStaffing = append(r.Policy.WeeklyStaffing, domain.WeeklyStaffing{Weekday: day, Start: 480, End: 960, RN: rn})
	}
}

func TestWeeklyReadinessWithNoLegacyStaffing(t *testing.T) {
	r := readyRoster()
	weeklyPolicyForTest(&r)
	report, err := Readiness(r, true)
	if err != nil {
		t.Fatal(err)
	}
	for _, issue := range report.Issues {
		if issue.Code == "STAFFING_MISSING" {
			t.Fatal("weekly staffing must satisfy readiness staffing requirement")
		}
	}
}

func TestWeeklyCandidateSafeIgnoresDepartmentCoverage(t *testing.T) {
	r := readyRoster()
	weeklyPolicyForTest(&r)
	var nurse domain.Staff
	for _, n := range r.Staff {
		if n.Position == "RN" {
			for _, allowed := range n.Allowed {
				if allowed == "ช" {
					nurse = n
					break
				}
			}
		}
		if nurse.ID != "" {
			break
		}
	}
	if nurse.ID == "" {
		t.Fatal("fixture has no morning RN")
	}
	if !candidateSafe(r, nil, nil, nil, nurse, "2026-09-01", "ช") {
		t.Fatal("weekly department staffing must not reject an individually valid morning RN")
	}
}
func TestWeeklySolverProducesWorkingShifts(t *testing.T) {
	r := readyRoster()
	weeklyPolicyForTest(&r)
	snap, err := Snapshot(r)
	if err != nil {
		t.Fatal(err)
	}
	out, err := ConstraintSolver{}.Solve(context.Background(), domain.SolverInput{Snapshot: snap, MaxDuration: 3 * time.Second, MaxNodes: 3000})
	if err != nil {
		t.Fatal(err)
	}
	working := 0
	for _, c := range out.Assignments {
		if c.ShiftCode != "" && c.ShiftCode != "X" && c.ShiftCode != "L" {
			working++
		}
	}
	if working == 0 {
		t.Fatalf("weekly solver produced no working shifts: status=%s reason=%s", out.Status, out.Diagnostics.Reason)
	}
}

func TestWeeklyDemandDifferentiatesHighAndLowDays(t *testing.T) {
	r := readyRoster()
	r.Policy.StaffingMode = "weekly"
	r.Policy.Staffing = nil
	r.Policy.WeeklyStaffing = nil

	// Adequate staff to cover 3 RNs on weekdays
	r.Staff = []domain.Staff{
		{ID: "rn-1", Name: "RN 1", Position: "RN", Active: true, Leader: true, Double: true, Allowed: []string{"ช", "บ", "ด", "ชบ", "X", "L"}},
		{ID: "rn-2", Name: "RN 2", Position: "RN", Active: true, Leader: true, Double: true, Allowed: []string{"ช", "บ", "ด", "ชบ", "X", "L"}},
		{ID: "rn-3", Name: "RN 3", Position: "RN", Active: true, Leader: false, Double: true, Allowed: []string{"ช", "บ", "ด", "ชบ", "X", "L"}},
		{ID: "rn-4", Name: "RN 4", Position: "RN", Active: true, Leader: false, Double: true, Allowed: []string{"ช", "บ", "ด", "ชบ", "X", "L"}},
		{ID: "rn-5", Name: "RN 5", Position: "RN", Active: true, Leader: false, Double: true, Allowed: []string{"ช", "บ", "ด", "ชบ", "X", "L"}},
		{ID: "pn-1", Name: "PN 1", Position: "PN", Active: true, Double: true, Allowed: []string{"ช", "บ", "ด", "ชบ", "X", "L"}},
	}
	r.Policy.Targets = []domain.Target{
		{NurseID: "rn-1", Hours: 160, Off: 8},
		{NurseID: "rn-2", Hours: 160, Off: 8},
		{NurseID: "rn-3", Hours: 160, Off: 8},
		{NurseID: "rn-4", Hours: 160, Off: 8},
		{NurseID: "rn-5", Hours: 160, Off: 8},
		{NurseID: "pn-1", Hours: 160, Off: 8},
	}
	r.Assignments = nil
	start := time.Date(2026, 9, 1, 0, 0, 0, 0, time.UTC)
	end := time.Date(2026, 10, 1, 0, 0, 0, 0, time.UTC)
	for d := start; d.Before(end); d = d.AddDate(0, 0, 1) {
		for _, n := range r.Staff {
			r.Assignments = append(r.Assignments, domain.Cell{
				NurseID: n.ID, Date: d.Format("2006-01-02"), ShiftCode: "X", Version: 1,
			})
		}
	}

	// Weekdays (Mon-Fri = 1-5): Morning requires RN=3 (RN 2 + Leader 1), PN=1
	// Weekends (Sat-Sun = 6-7): Morning requires RN=1 (RN 0 + Leader 1), PN=0
	for day := 1; day <= 7; day++ {
		rn := 2
		pn := 1
		leader := 1
		if day == 6 || day == 7 {
			rn = 0
			pn = 0
			leader = 1
		}
		// 3 standard shifts per day
		r.Policy.WeeklyStaffing = append(r.Policy.WeeklyStaffing,
			domain.WeeklyStaffing{Weekday: day, Start: 480, End: 960, RN: rn, PN: pn, Leaders: leader},
			domain.WeeklyStaffing{Weekday: day, Start: 960, End: 1440, RN: 1, PN: 0, Leaders: 1},
			domain.WeeklyStaffing{Weekday: day, Start: 0, End: 480, RN: 1, PN: 0, Leaders: 0},
		)
	}

	snap, err := Snapshot(r)
	if err != nil {
		t.Fatal(err)
	}

	out, err := ConstraintSolver{}.Solve(context.Background(), domain.SolverInput{Snapshot: snap, MaxDuration: 5 * time.Second, MaxNodes: 5000})
	if err != nil {
		t.Fatal(err)
	}

	// Verify that weekdays (e.g. 2026-09-01 Tuesday = weekday 2) have significantly more morning staff than weekend (2026-09-06 Sunday = weekday 7)
	mornTueCount := 0
	mornSunCount := 0
	for _, c := range out.Assignments {
		if c.ShiftCode == "ช" || c.ShiftCode == "ชบ" {
			if c.Date == "2026-09-01" { // Tuesday (Weekday peak)
				mornTueCount++
			}
			if c.Date == "2026-09-06" { // Sunday (Weekend low)
				mornSunCount++
			}
		}
	}

	if mornTueCount <= mornSunCount {
		t.Fatalf("expected weekday morning count (%d) to exceed weekend morning count (%d)", mornTueCount, mornSunCount)
	}
}
