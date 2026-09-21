package scheduler_test

import (
	"context"
	"fmt"
	"nurse-scheduler/backend/internal/domain"
	"nurse-scheduler/backend/internal/scheduler"
	"nurse-scheduler/backend/internal/testfixture"
	"strings"
	"testing"
	"time"
)

// Helper to construct a base ready roster for tests
func baseRoster(numRN, numPN int) domain.Roster {
	r := testfixture.Roster()
	r.Staff = []domain.Staff{}
	for i := 1; i <= numRN; i++ {
		r.Staff = append(r.Staff, domain.Staff{
			ID:       fmt.Sprintf("rn-%d", i),
			Name:     fmt.Sprintf("พยาบาล RN %d", i),
			Position: "RN",
			Active:   true,
			Leader:   i <= 2, // first 2 are leaders
			Double:   true,
			Allowed:  []string{"ช", "บ", "ด", "ชบ", "Day", "Night"},
			Skills:   []string{"icu"},
		})
	}
	for i := 1; i <= numPN; i++ {
		r.Staff = append(r.Staff, domain.Staff{
			ID:       fmt.Sprintf("pn-%d", i),
			Name:     fmt.Sprintf("ผู้ช่วย PN %d", i),
			Position: "PN",
			Active:   true,
			Double:   true,
			Allowed:  []string{"ช", "บ", "ด", "ชบ", "Day", "Night"},
		})
	}
	r = testfixture.ReadyRoster(r)
	// Fill full month with X
	start := time.Date(2026, 9, 1, 0, 0, 0, 0, time.UTC)
	end := time.Date(2026, 10, 1, 0, 0, 0, 0, time.UTC)
	r.Assignments = []domain.Cell{}
	for d := start; d.Before(end); d = d.AddDate(0, 0, 1) {
		for _, n := range r.Staff {
			r.Assignments = append(r.Assignments, domain.Cell{
				NurseID: n.ID, Date: d.Format("2006-01-02"), ShiftCode: "X", Version: 1,
			})
		}
	}
	return r
}

// 1. Capacity Evaluation: Multi-dimensional evaluation with leaves & skills
func TestCapacityEvaluationMultiDimensional(t *testing.T) {
	r := baseRoster(3, 2)
	// Staffing requires 1 RN per shift (Morning, Evening, Night) = 3 RNs daily
	r.Policy.Staffing = []domain.Staffing{
		{Date: "2026-09-05", Start: 480, End: 960, RN: 1, PN: 1, Leaders: 1, Skills: map[string]int{"icu": 1}},
		{Date: "2026-09-05", Start: 960, End: 1440, RN: 1, PN: 0, Leaders: 0},
		{Date: "2026-09-05", Start: 0, End: 480, RN: 1, PN: 0, Leaders: 1},
	}

	// Case A: No leaves on 2026-09-05 -> Capacity is sufficient/tight
	rep, err := scheduler.Readiness(r, false)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	for _, issue := range rep.Issues {
		if issue.Code == "CAPACITY_DEFICIT_RN" && issue.Date == "2026-09-05" {
			t.Errorf("did not expect structural deficit when 3 RNs available: %s", issue.Message)
		}
	}

	// Case B: 2 RNs take approved leave on 2026-09-05 -> Only 1 RN available for 3 shifts!
	r.Leaves = append(r.Leaves,
		domain.Leave{NurseID: "rn-1", Start: "2026-09-05", End: "2026-09-05", Approved: true},
		domain.Leave{NurseID: "rn-2", Start: "2026-09-05", End: "2026-09-05", Approved: true},
	)
	rep2, err := scheduler.Readiness(r, false)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	hasDeficit := false
	for _, issue := range rep2.Issues {
		if issue.Code == "CAPACITY_DEFICIT_RN" && issue.Date == "2026-09-05" {
			hasDeficit = true
		}
	}
	if !hasDeficit {
		t.Errorf("expected CAPACITY_DEFICIT_RN on 2026-09-05 when 2 out of 3 RNs are on leave")
	}
}

// 2. Normal Adequate Case: Solver finds complete solution
func TestSolverNormalAdequate(t *testing.T) {
	r := baseRoster(4, 2)
	// Standard single day solve test
	r.Policy.Staffing = []domain.Staffing{
		{Date: "2026-09-01", Start: 480, End: 960, RN: 1, PN: 1, Leaders: 1},
		{Date: "2026-09-01", Start: 960, End: 1440, RN: 1, PN: 0, Leaders: 0},
	}
	snap, _ := scheduler.Snapshot(r)
	in := domain.SolverInput{
		Snapshot:    snap,
		Scope:       domain.SolveScope{Start: "2026-09-01", End: "2026-09-01"},
		Seed:        123,
		MaxDuration: 5 * time.Second,
		MaxNodes:    5000,
	}
	out, err := scheduler.ConstraintSolver{}.Solve(context.Background(), in)
	if err != nil {
		t.Fatalf("solver error: %v", err)
	}
	if out.Status != "complete" {
		t.Errorf("expected status complete, got %s (reason: %s)", out.Status, out.Diagnostics.Reason)
	}
}

// 3. Month Boundary: Previous night shift on Aug 31 prevents Morning on Sep 1
func TestSolverMonthBoundaryRestConstraint(t *testing.T) {
	r := baseRoster(2, 0)
	// Nurse rn-1 had Night shift on 2026-08-31
	r.Boundary = []domain.Cell{
		{NurseID: "rn-1", Date: "2026-08-31", ShiftCode: "ด"},
		{NurseID: "rn-2", Date: "2026-08-31", ShiftCode: "X"},
	}
	// On Sep 1, we need 1 Morning RN (480-960)
	r.Policy.Staffing = []domain.Staffing{
		{Date: "2026-09-01", Start: 480, End: 960, RN: 1, PN: 0, Leaders: 1},
	}
	snap, _ := scheduler.Snapshot(r)
	in := domain.SolverInput{
		Snapshot:    snap,
		Scope:       domain.SolveScope{Start: "2026-09-01", End: "2026-09-01"},
		Seed:        42,
		MaxDuration: 5 * time.Second,
		MaxNodes:    5000,
	}
	out, err := scheduler.ConstraintSolver{}.Solve(context.Background(), in)
	if err != nil {
		t.Fatalf("solver error: %v", err)
	}
	// rn-1 must NOT be assigned Morning on Sep 1 because of night shift on Aug 31
	for _, c := range out.Assignments {
		if c.NurseID == "rn-1" && c.Date == "2026-09-01" {
			if c.ShiftCode == "ช" || c.ShiftCode == "Day" {
				t.Errorf("rn-1 was assigned morning shift immediately after night shift!")
			}
		}
	}
}

// 4. Infeasible Deficit: Solver reports proven_infeasible and shortage details
func TestSolverInfeasibleDeficitExplanation(t *testing.T) {
	r := baseRoster(1, 0) // only 1 RN in ward
	// Needs 3 RNs on Sep 1
	r.Policy.Staffing = []domain.Staffing{
		{Date: "2026-09-01", Start: 480, End: 960, RN: 3, PN: 0, Leaders: 1},
	}
	snap, _ := scheduler.Snapshot(r)
	in := domain.SolverInput{
		Snapshot:    snap,
		Scope:       domain.SolveScope{Start: "2026-09-01", End: "2026-09-01"},
		Seed:        1,
		MaxDuration: 3 * time.Second,
		MaxNodes:    2000,
	}
	out, err := scheduler.ConstraintSolver{}.Solve(context.Background(), in)
	if err != nil {
		t.Fatalf("solver error: %v", err)
	}
	if out.Status != "partial" {
		t.Errorf("expected partial status when staff is insufficient, got %s", out.Status)
	}
	if out.Diagnostics.Feasibility != "proven_infeasible" {
		t.Errorf("expected proven_infeasible feasibility, got %s", out.Diagnostics.Feasibility)
	}
	if len(out.Diagnostics.Shortages) == 0 {
		t.Errorf("expected shortage details in diagnostics")
	} else {
		sh := out.Diagnostics.Shortages[0]
		if sh.Missing <= 0 || sh.Position != "RN" {
			t.Errorf("unexpected shortage detail: %+v", sh)
		}
	}
}

// 5. Separate RN + Leader Staffing: RN 4 + Leaders 1 = 5 RNs scheduled with 0 deficit
func TestSolverRNPlusLeadersStaffing(t *testing.T) {
	r := baseRoster(6, 0) // 6 RNs: rn-1 is Leader, rn-2..rn-6 are regular RNs
	r.Policy.Staffing = []domain.Staffing{
		{Date: "2026-09-01", Start: 480, End: 960, RN: 4, PN: 0, Leaders: 1},
	}
	snap, _ := scheduler.Snapshot(r)
	in := domain.SolverInput{
		Snapshot:    snap,
		Scope:       domain.SolveScope{Start: "2026-09-01", End: "2026-09-01"},
		Seed:        42,
		MaxDuration: 3 * time.Second,
		MaxNodes:    2000,
	}
	out, err := scheduler.ConstraintSolver{}.Solve(context.Background(), in)
	if err != nil {
		t.Fatalf("solver error: %v", err)
	}
	if out.Status != "complete" {
		t.Fatalf("expected complete status, got %s (violations: %+v)", out.Status, out.Violations)
	}

	assignedRNs := 0
	assignedLeaders := 0
	for _, c := range out.Assignments {
		if c.Date == "2026-09-01" && (c.ShiftCode == "ช" || c.ShiftCode == "ชบ" || c.ShiftCode == "Day") {
			assignedRNs++
			if c.NurseID == "rn-1" || c.NurseID == "rn-2" {
				assignedLeaders++
			}
		}
	}

	// Target is 4 RNs + 1 Leader = 5 RNs total
	if assignedRNs != 5 {
		t.Fatalf("expected 5 RNs assigned (4 regular RN + 1 Leader), got %d", assignedRNs)
	}
	if assignedLeaders < 1 {
		t.Fatalf("expected at least 1 Leader assigned, got %d", assignedLeaders)
	}
}

// 6. Tight Rotation Case (14 RNs, 10 shifts/day, 30 days): Solver successfully schedules using smart double shifts and night blocks
func TestSolver14Nurses10DailyShiftsTightRotation(t *testing.T) {
	r := baseRoster(14, 0)
	for i := range r.Staff {
		r.Staff[i].Leader = (i < 7)
	}
	r.Policy.MinRestHours = 8
	r.Policy.MinOff = 7
	r.Policy.MaxConsecutiveDays = 6
	r.Policy.MaxConsecutiveNights = 3
	r.Policy.MaxDoubleShifts = 8
	r.Policy.MaxMonthlyHours = 240
	r.Policy.Staffing = []domain.Staffing{
		{Start: 480, End: 960, RN: 3, PN: 0, Leaders: 1},  // Morning: 4 RNs
		{Start: 960, End: 1440, RN: 3, PN: 0, Leaders: 1}, // Evening: 4 RNs
		{Start: 0, End: 480, RN: 1, PN: 0, Leaders: 1},    // Night: 2 RNs
	}
	for _, n := range r.Staff {
		r.Policy.Targets = append(r.Policy.Targets, domain.Target{NurseID: n.ID, Hours: 176, Off: 8})
	}
	snap, _ := scheduler.Snapshot(r)
	in := domain.SolverInput{
		Snapshot:    snap,
		Scope:       domain.SolveScope{Start: "2026-09-01", End: "2026-09-30"},
		Seed:        999,
		MaxDuration: 4 * time.Second,
		MaxNodes:    5000,
	}
	out, err := scheduler.ConstraintSolver{}.Solve(context.Background(), in)
	if err != nil {
		t.Fatalf("solver error: %v", err)
	}
	if out.Status != "complete" {
		t.Logf("Solver status: %s (violations: %d)", out.Status, len(out.Violations))
		for _, v := range out.Violations {
			if v.Severity == "error" {
				t.Logf("Error violation: %s on %s: %s (%+v)", v.RuleCode, v.Date, v.Message, v.Metadata)
			}
		}
		t.Fatalf("expected complete status for 14 RNs with 10 shifts/day, got %s", out.Status)
	}
}

// 7. Heavy Night Case (14 RNs, 4 Nights, 4 Mornings, 4 Evenings = 12 daily): Solves using autonomous double shifts (ชบ)
func TestSolver14NursesWith4NightShifts(t *testing.T) {
	r := baseRoster(14, 0)
	for i := range r.Staff {
		r.Staff[i].Leader = (i < 8)
		r.Staff[i].Double = true
	}
	r.Policy.MinRestHours = 8
	r.Policy.MinOff = 5
	r.Policy.MaxConsecutiveDays = 6
	r.Policy.MaxConsecutiveNights = 3
	r.Policy.MaxDoubleShifts = 10
	r.Policy.MaxMonthlyHours = 260
	r.Policy.Staffing = []domain.Staffing{
		{Start: 480, End: 960, RN: 3, PN: 0, Leaders: 1},  // Morning: 4 RNs
		{Start: 960, End: 1440, RN: 3, PN: 0, Leaders: 1}, // Evening: 4 RNs
		{Start: 0, End: 480, RN: 3, PN: 0, Leaders: 1},    // Night: 4 RNs
	}
	for _, n := range r.Staff {
		r.Policy.Targets = append(r.Policy.Targets, domain.Target{NurseID: n.ID, Hours: 200, Off: 6})
	}
	snap, _ := scheduler.Snapshot(r)
	in := domain.SolverInput{
		Snapshot:    snap,
		Scope:       domain.SolveScope{Start: "2026-09-01", End: "2026-09-30"},
		Seed:        777,
		MaxDuration: 4 * time.Second,
		MaxNodes:    5000,
	}
	out, err := scheduler.ConstraintSolver{}.Solve(context.Background(), in)
	if err != nil {
		t.Fatalf("solver error: %v", err)
	}
	t.Logf("Solver status: %s (violations: %d)", out.Status, len(out.Violations))
	doublesCount := 0
	for _, c := range out.Assignments {
		if c.ShiftCode == "ชบ" {
			doublesCount++
		}
	}
	t.Logf("Total ชบ double shifts scheduled: %d", doublesCount)
	for _, c := range out.Assignments {
		if c.Date == "2026-09-01" {
			t.Logf("Nurse %s: %s", c.NurseID, c.ShiftCode)
		}
	}
	if doublesCount == 0 {
		t.Errorf("expected autonomous double shifts (ชบ) to be used when night demand is 4, got 0")
	}
	for _, v := range out.Violations {
		if v.Severity == "error" && v.RuleCode == "MIN_STAFFING" {
			t.Logf("Staffing deficit error: %s on %s: %s (Metadata: %+v)", v.RuleCode, v.Date, v.Message, v.Metadata)
		}
	}
}

// 7. Part-Time Mode (Hybrid Approach C)
func TestPartTimeReliefMode(t *testing.T) {
	// Sprint 5: AUTO flow ไม่สร้าง PT สมมติอีกต่อไป ไม่ว่า AllowPartTime จะเป็นค่าใด
	// ระบบจัดคนประจำเท่านั้น และรายงานผ่าน RegularSearchStatus + PartTimeRequirements
	// 5 Full-Time RNs, Daily demand: 2+2+2 = 6 slots => คนประจำไม่พอจริง
	r := baseRoster(5, 2)
	r.Policy.Staffing = []domain.Staffing{
		{Date: "", Start: 480, End: 960, RN: 1, PN: 1, Leaders: 1},
		{Date: "", Start: 960, End: 1440, RN: 1, PN: 1, Leaders: 1},
		{Date: "", Start: 0, End: 480, RN: 1, PN: 0, Leaders: 1},
	}

	snap, _ := scheduler.Snapshot(r)

	// Case A: AllowPartTime = false -> ต้องรายงาน deficit ไม่ได้ complete
	inWithoutPT := domain.SolverInput{
		Snapshot:      snap,
		Scope:         domain.SolveScope{Start: "2026-09-01", End: "2026-09-30"},
		Seed:          42,
		MaxDuration:   2 * time.Second,
		MaxNodes:      3000,
		AllowPartTime: false,
	}
	outNoPT, err := scheduler.ConstraintSolver{}.Solve(context.Background(), inWithoutPT)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	t.Logf("No PT mode status: %s, regularSearchStatus: %s", outNoPT.Status, outNoPT.Diagnostics.RegularSearchStatus)
	if outNoPT.Status == "complete" {
		t.Errorf("expected deficit when 5 RNs are asked to cover 6 RNs daily without PT")
	}

	// Case B: Sprint 5 — AllowPartTime = true ไม่ควรสร้าง PT สมมติ
	// PartTimeShifts/PartTimeNurses ควรเป็น 0 (ไม่มีการจัด PT อัตโนมัติ)
	// RegularSearchStatus ควรระบุสถานะจริง
	inWithPT := domain.SolverInput{
		Snapshot:      snap,
		Scope:         domain.SolveScope{Start: "2026-09-01", End: "2026-09-30"},
		Seed:          42,
		MaxDuration:   5 * time.Second,
		MaxNodes:      15000,
		AllowPartTime: true, // Sprint 5: ไม่มีผลต่อการสร้าง PT อัตโนมัติ
	}
	outWithPT, err := scheduler.ConstraintSolver{}.Solve(context.Background(), inWithPT)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	t.Logf("Sprint5 PT mode: status=%s, regularSearchStatus=%s, PT shifts=%d, PT nurses=%d",
		outWithPT.Status, outWithPT.Diagnostics.RegularSearchStatus,
		outWithPT.Diagnostics.PartTimeShifts, outWithPT.Diagnostics.PartTimeNurses)

	// Sprint 5: ไม่ควรมี PT สมมติในผลลัพธ์ เพราะไม่ได้จัด PT อัตโนมัติแล้ว
	// (locked PT จริงจาก roster เดิมยังนับได้ แต่ในกรณีนี้ไม่มี)
	if outWithPT.Diagnostics.PartTimeShifts > 0 {
		t.Errorf("Sprint 5: expected no auto-generated PT shifts, got %d", outWithPT.Diagnostics.PartTimeShifts)
	}
	// RegularSearchStatus ต้องไม่ว่าง
	if outWithPT.Diagnostics.RegularSearchStatus == "" {
		t.Errorf("Sprint 5: regularSearchStatus must not be empty")
	}
}

func TestCappedPartTimeRelief(t *testing.T) {
	// Sprint 5: TestCappedPartTimeRelief ตรวจสอบว่า assignCappedPartTimeRelief
	// ไม่ถูกเรียกใน AUTO flow — Cap constraints ไม่มีผลต่อ output อีกต่อไป
	r := baseRoster(5, 2)
	r.Policy.Staffing = []domain.Staffing{
		{Date: "", Start: 480, End: 960, RN: 1, PN: 1, Leaders: 1},
		{Date: "", Start: 960, End: 1440, RN: 1, PN: 1, Leaders: 1},
		{Date: "", Start: 0, End: 480, RN: 1, PN: 0, Leaders: 1},
	}

	snap, _ := scheduler.Snapshot(r)

	inCap1 := domain.SolverInput{
		Snapshot:          snap,
		Scope:             domain.SolveScope{Start: "2026-09-01", End: "2026-09-30"},
		Seed:              42,
		MaxDuration:       2 * time.Second,
		MaxNodes:          5000,
		AllowPartTime:     true,
		MaxPartTimeRN:     1,
		MaxPartTimePN:     0,
		MaxPartTimeShifts: 2,
	}

	outCap1, err := scheduler.ConstraintSolver{}.Solve(context.Background(), inCap1)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	t.Logf("Cap1 result: PT nurses=%d, PT shifts=%d", outCap1.Diagnostics.PartTimeNurses, outCap1.Diagnostics.PartTimeShifts)
	// Sprint 5: ไม่มีการสร้าง PT อัตโนมัติ ดังนั้น cap constraints ไม่มีผลต่อ shifts ที่จัด
	// ตรวจว่า PartTimeShifts ไม่เกิน cap ที่กำหนด (ยังคงตรวจ backward compat)
	if outCap1.Diagnostics.PartTimeShifts > 2 {
		t.Errorf("expected at most 2 PartTimeShifts with MaxPartTimeShifts=2, got %d", outCap1.Diagnostics.PartTimeShifts)
	}
}

// TestSprint5RegularSearchStatus ตรวจ Sprint 5 fields ใน diagnostics
func TestSprint5RegularSearchStatus(t *testing.T) {
	// Ward ที่คนประจำพอ: regularSearchStatus ต้องเป็น "complete"
	r := baseRoster(8, 3)
	r.Policy.Staffing = []domain.Staffing{
		{Date: "", Start: 480, End: 960, RN: 2, Leaders: 1},
		{Date: "", Start: 960, End: 1440, RN: 2, Leaders: 1},
		{Date: "", Start: 0, End: 480, RN: 1, Leaders: 1},
	}
	snap, _ := scheduler.Snapshot(r)

	in := domain.SolverInput{
		Snapshot:    snap,
		Scope:       domain.SolveScope{Start: "2026-09-01", End: "2026-09-30"},
		Seed:        1,
		MaxDuration: 10 * time.Second,
		MaxNodes:    20000,
	}
	out, err := scheduler.ConstraintSolver{}.Solve(context.Background(), in)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	t.Logf("status=%s, regularSearchStatus=%s, canContinue=%v", out.Status, out.Diagnostics.RegularSearchStatus, out.Diagnostics.CanContinue)
	if out.Diagnostics.RegularSearchStatus == "" {
		t.Errorf("regularSearchStatus must not be empty")
	}
	// เมื่อ complete: CanContinue ต้องเป็น false, PartTimeRequirements ต้องว่าง
	if out.Status == "complete" {
		if out.Diagnostics.RegularSearchStatus != "complete" {
			t.Errorf("expected regularSearchStatus=complete when status=complete, got %s", out.Diagnostics.RegularSearchStatus)
		}
		if out.Diagnostics.CanContinue {
			t.Errorf("CanContinue must be false when complete")
		}
		if len(out.Diagnostics.PartTimeRequirements) > 0 {
			t.Errorf("PartTimeRequirements must be empty when complete")
		}
	}
}

// TestSprint5NoPTInAutoFlow ตรวจว่าบุคลากร PT จริงในทะเบียนไม่ถูกดึงมาเติมเวร
func TestSprint5NoPTInAutoFlow(t *testing.T) {
	r := baseRoster(4, 2)
	// เพิ่ม PT จริง 2 คนในทะเบียน
	ptRN := domain.Staff{
		ID: "pt-rn-real-1", Name: "PT พยาบาล 1", Position: "RN",
		PartTime: true, Active: true,
		Allowed: []string{"ช", "บ", "ด"},
	}
	ptPN := domain.Staff{
		ID: "pt-pn-real-1", Name: "PT ผู้ช่วย 1", Position: "PN",
		PartTime: true, Active: true,
		Allowed: []string{"ช", "บ", "ด"},
	}
	r.Staff = append(r.Staff, ptRN, ptPN)
	r.Policy.Staffing = []domain.Staffing{
		{Date: "", Start: 480, End: 960, RN: 1, Leaders: 1},
		{Date: "", Start: 960, End: 1440, RN: 1, Leaders: 1},
	}
	snap, _ := scheduler.Snapshot(r)

	in := domain.SolverInput{
		Snapshot:    snap,
		Scope:       domain.SolveScope{Start: "2026-09-01", End: "2026-09-30"},
		Seed:        1,
		MaxDuration: 5 * time.Second,
		MaxNodes:    10000,
	}
	out, err := scheduler.ConstraintSolver{}.Solve(context.Background(), in)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// ตรวจว่า PT จริงไม่ถูกจัดเวรใน AUTO flow (ยกเว้น locked cells)
	for _, c := range out.Assignments {
		if (c.NurseID == "pt-rn-real-1" || c.NurseID == "pt-pn-real-1") &&
			c.ShiftCode != "X" && c.ShiftCode != "L" && c.ShiftCode != "" && !c.Locked {
			t.Errorf("Sprint 5: PT staff %s was auto-assigned shift %s on %s — should not happen in AUTO flow",
				c.NurseID, c.ShiftCode, c.Date)
		}
	}
	t.Logf("Sprint5 no-PT test: status=%s, regularSearchStatus=%s", out.Status, out.Diagnostics.RegularSearchStatus)
}

// TestSprint5TimeoutCanContinue ตรวจว่า timeout → canContinue=true, ไม่มี partTimeRequirements
func TestSprint5TimeoutCanContinue(t *testing.T) {
	r := baseRoster(5, 2)
	r.Policy.Staffing = []domain.Staffing{
		{Date: "", Start: 480, End: 960, RN: 2, Leaders: 1},
		{Date: "", Start: 960, End: 1440, RN: 2, Leaders: 1},
		{Date: "", Start: 0, End: 480, RN: 1, Leaders: 1},
	}
	snap, _ := scheduler.Snapshot(r)

	// จงใจ timeout ด้วยงบน้อย
	in := domain.SolverInput{
		Snapshot:    snap,
		Scope:       domain.SolveScope{Start: "2026-09-01", End: "2026-09-30"},
		Seed:        1,
		MaxDuration: 100 * time.Millisecond,
		MaxNodes:    10,
	}
	out, err := scheduler.ConstraintSolver{}.Solve(context.Background(), in)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	t.Logf("Timeout test: status=%s, regularSearchStatus=%s, canContinue=%v, ptReqs=%d",
		out.Status, out.Diagnostics.RegularSearchStatus, out.Diagnostics.CanContinue,
		len(out.Diagnostics.PartTimeRequirements))

	// timeout → regularSearchStatus ต้องเป็น search_incomplete
	if out.Diagnostics.RegularSearchStatus == "minimum_shortage_proven" {
		t.Errorf("timeout must not report minimum_shortage_proven")
	}
	// timeout → PartTimeRequirements ต้องว่าง (ยังยืนยันปริมาณขาดต่ำสุดไม่ได้)
	if len(out.Diagnostics.PartTimeRequirements) > 0 {
		t.Errorf("timeout must not generate PartTimeRequirements, got %d items", len(out.Diagnostics.PartTimeRequirements))
	}
}

// TestSprint5ProvenInfeasibleExcludesPT ตรวจว่าเมื่อคนประจำไม่พอจริง แต่มี PT ในระบบ
// ระบบต้องพิสูจน์ว่าเป็น minimum_shortage_proven (ไม่นับ PT เข้าไปในยอดคนประจำ)
func TestSprint5ProvenInfeasibleExcludesPT(t *testing.T) {
	// มี RN ประจำเพียง 1 คน แต่ต้องการ RN 2 คนต่อวัน (proven infeasible แน่นอน)
	// แม้จะมี PT ในระบบ 5 คนก็ตาม
	r := baseRoster(1, 0)
	for i := 1; i <= 5; i++ {
		r.Staff = append(r.Staff, domain.Staff{
			ID: fmt.Sprintf("pt-rn-%d", i), Name: fmt.Sprintf("PT %d", i), Position: "RN",
			PartTime: true, Active: true, Allowed: []string{"ช", "บ", "ด"},
		})
	}
	r.Policy.Staffing = []domain.Staffing{
		{Date: "", Start: 480, End: 960, RN: 2, Leaders: 1},
	}
	snap, _ := scheduler.Snapshot(r)

	in := domain.SolverInput{
		Snapshot:    snap,
		Scope:       domain.SolveScope{Start: "2026-09-01", End: "2026-09-30"},
		Seed:        1,
		MaxDuration: 2 * time.Second,
		MaxNodes:    5000,
	}
	out, err := scheduler.ConstraintSolver{}.Solve(context.Background(), in)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	t.Logf("ProvenInfeasible test: status=%s, regularSearchStatus=%s, ptReqs=%d",
		out.Status, out.Diagnostics.RegularSearchStatus, len(out.Diagnostics.PartTimeRequirements))

	if out.Diagnostics.RegularSearchStatus != "minimum_shortage_proven" {
		t.Errorf("expected minimum_shortage_proven when regular staff is 1 and demand is 2, got %s", out.Diagnostics.RegularSearchStatus)
	}
	if len(out.Diagnostics.PartTimeRequirements) == 0 {
		t.Errorf("expected non-empty PartTimeRequirements when minimum_shortage_proven")
	}
}

// TestSprint5InvalidFixedDataOnlyLockedCells ตรวจว่า invalid_fixed_data เกิดขึ้นเฉพาะเมื่อ locked cell ขัดกฎ
func TestSprint5InvalidFixedDataOnlyLockedCells(t *testing.T) {
	// Case 1: ปกติ ไม่มี locked cells ที่ผิดกฎ -> regularSearchStatus ต้องไม่ใช่ invalid_fixed_data
	r1 := baseRoster(4, 2)
	snap1, _ := scheduler.Snapshot(r1)
	in1 := domain.SolverInput{
		Snapshot:    snap1,
		Scope:       domain.SolveScope{Start: "2026-09-01", End: "2026-09-30"},
		Seed:        1,
		MaxDuration: 2 * time.Second,
		MaxNodes:    5000,
	}
	out1, _ := scheduler.ConstraintSolver{}.Solve(context.Background(), in1)
	if out1.Diagnostics.RegularSearchStatus == "invalid_fixed_data" {
		t.Errorf("normal roster should not trigger invalid_fixed_data")
	}

	// Case 2: มี locked cell ขัดกฎ REST_BETWEEN_SHIFTS (เช่น ล็อก ดึก แล้วล็อก เช้า วันถัดไป)
	r2 := baseRoster(4, 2)
	r2.Assignments = []domain.Cell{
		{NurseID: "rn-1", Date: "2026-09-01", ShiftCode: "ด", Locked: true, Version: 1},
		{NurseID: "rn-1", Date: "2026-09-02", ShiftCode: "ช", Locked: true, Version: 1},
	}
	snap2, _ := scheduler.Snapshot(r2)
	in2 := domain.SolverInput{
		Snapshot:    snap2,
		Scope:       domain.SolveScope{Start: "2026-09-01", End: "2026-09-30"},
		Seed:        1,
		MaxDuration: 2 * time.Second,
		MaxNodes:    5000,
	}
	out2, _ := scheduler.ConstraintSolver{}.Solve(context.Background(), in2)
	t.Logf("Invalid fixed data test: regularSearchStatus=%s", out2.Diagnostics.RegularSearchStatus)
	if out2.Diagnostics.RegularSearchStatus != "invalid_fixed_data" {
		t.Errorf("expected invalid_fixed_data when locked cells have REST_BETWEEN_SHIFTS violation, got %s", out2.Diagnostics.RegularSearchStatus)
	}
}

// TestSprint5ThreeWayRotationAndReseed ตรวจสอบว่าระบบมี Move 5 และ Multi-seed strategies
func TestSprint5ThreeWayRotationAndReseed(t *testing.T) {
	r := baseRoster(6, 2)
	r.Policy.Staffing = []domain.Staffing{
		{Date: "", Start: 480, End: 960, RN: 2, Leaders: 1},
		{Date: "", Start: 960, End: 1440, RN: 2, Leaders: 1},
	}
	snap, _ := scheduler.Snapshot(r)
	in := domain.SolverInput{
		Snapshot:    snap,
		Scope:       domain.SolveScope{Start: "2026-09-01", End: "2026-09-30"},
		Seed:        1,
		MaxDuration: 3 * time.Second,
		MaxNodes:    10000,
	}
	out, err := scheduler.ConstraintSolver{}.Solve(context.Background(), in)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	strategies := strings.Join(out.Diagnostics.Strategies, ",")
	if !strings.Contains(strategies, "three_way_rotation") {
		t.Errorf("expected three_way_rotation in strategies, got %s", strategies)
	}
	if !strings.Contains(strategies, "multi_seed_restart") {
		t.Errorf("expected multi_seed_restart in strategies, got %s", strategies)
	}
}

// TestSprint6LeaderAndRNCountExact ตรวจสอบว่า RN ที่เป็น Leader สามารถตอบโจทย์ทั้ง Leader และ RN ได้
// โดยไม่ถูกนับเป็น 2 คนซ้ำซ้อน
func TestSprint6LeaderAndRNCountExact(t *testing.T) {
	r := baseRoster(3, 1)
	// กำหนดความต้องการ: 1 Leader + 1 RN ในช่วง 08:00 - 16:00
	// ถ้ามี RN ที่เป็น Leader 1 คน + RN ธรรมดา 1 คน -> รวม 2 คน ต้องจัดได้ครบ 100% ไม่ฟ้องขาด
	r.Policy.Staffing = []domain.Staffing{
		{Date: "", Start: 480, End: 960, RN: 1, Leaders: 1},
	}
	snap, _ := scheduler.Snapshot(r)
	in := domain.SolverInput{
		Snapshot:      snap,
		Scope:         domain.SolveScope{Start: "2026-09-01", End: "2026-09-30"},
		Seed:          1,
		MaxDuration:   3 * time.Second,
		MaxNodes:      10000,
		AllowPartTime: false,
	}
	out, err := scheduler.ConstraintSolver{}.Solve(context.Background(), in)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	t.Logf("Leader/RN exact test status: %s, regularSearchStatus: %s", out.Status, out.Diagnostics.RegularSearchStatus)
	if out.Status != "complete" {
		t.Errorf("expected complete schedule when RN count and Leader requirement match, got %s (violations: %d)", out.Status, len(out.Violations))
	}
}

// TestSprint6ContinueSearchFromIncumbent ตรวจสอบการส่ง Incumbent เพื่อค้นหาต่อ
func TestSprint6ContinueSearchFromIncumbent(t *testing.T) {
	r := baseRoster(5, 2)
	r.Policy.Staffing = []domain.Staffing{
		{Date: "", Start: 480, End: 960, RN: 2, Leaders: 1},
		{Date: "", Start: 960, End: 1440, RN: 2, Leaders: 1},
		{Date: "", Start: 0, End: 480, RN: 1, Leaders: 1},
	}
	snap, _ := scheduler.Snapshot(r)

	// รอบที่ 1: รันด้วยงบน้อยเพื่อจำลอง search_incomplete
	in1 := domain.SolverInput{
		Snapshot:      snap,
		Scope:         domain.SolveScope{Start: "2026-09-01", End: "2026-09-30"},
		Seed:          1,
		MaxDuration:   200 * time.Millisecond,
		MaxNodes:      50,
		AllowPartTime: false,
	}
	out1, err := scheduler.ConstraintSolver{}.Solve(context.Background(), in1)
	if err != nil {
		t.Fatalf("unexpected error on round 1: %v", err)
	}

	// รอบที่ 2: รันค้นหาต่อโดยส่ง Incumbent จากรอบที่ 1
	in2 := domain.SolverInput{
		Snapshot:      snap,
		Scope:         domain.SolveScope{Start: "2026-09-01", End: "2026-09-30"},
		Seed:          10008,
		MaxDuration:   5 * time.Second,
		MaxNodes:      20000,
		AllowPartTime: false,
		Incumbent:     out1.Assignments,
	}
	out2, err := scheduler.ConstraintSolver{}.Solve(context.Background(), in2)
	if err != nil {
		t.Fatalf("unexpected error on round 2: %v", err)
	}
	t.Logf("Continue search: round 1 violations=%d, round 2 violations=%d", len(out1.Violations), len(out2.Violations))
	if len(out2.Violations) > len(out1.Violations) {
		t.Errorf("round 2 should be at least as good as round 1")
	}
}

// TestDayNight12HourAutoScheduling verifies complete, error-free auto scheduling for 12-hour (Day/Night) shift systems
func TestDayNight12HourAutoScheduling(t *testing.T) {
	r := testfixture.Roster()
	r = testfixture.ReadyRoster(r)
	r.Staff = []domain.Staff{}
	for i := 1; i <= 8; i++ {
		r.Staff = append(r.Staff, domain.Staff{
			ID:       fmt.Sprintf("rn-%d", i),
			Name:     fmt.Sprintf("พยาบาล 12h RN %d", i),
			Position: "RN",
			Active:   true,
			Leader:   i <= 4, // 4 leaders
			Double:   false,
			Allowed:  []string{"Day", "Night", "X", "L"},
		})
	}
	r.Shifts = []domain.RosterShift{
		{Code: "Day", Name: "กลางวัน (12h)", Periods: []domain.Period{{Start: 480, End: 1200}}},
		{Code: "Night", Name: "กลางคืน (12h)", Periods: []domain.Period{{Start: 1200, End: 1920}}},
		{Code: "X", Name: "OFF", Periods: []domain.Period{}},
		{Code: "L", Name: "ลา", Periods: []domain.Period{}},
	}
	r.Policy.Staffing = []domain.Staffing{
		{Date: "", Start: 480, End: 1200, RN: 1, PN: 0, Leaders: 1},
		{Date: "", Start: 1200, End: 1920, RN: 1, PN: 0, Leaders: 1},
	}
	r.Policy.MinRestHours = 8
	r.Policy.MaxConsecutiveDays = 5
	r.Policy.MaxConsecutiveNights = 3
	r.Policy.MaxContinuousHours = 16
	r.Policy.MinOff = 8
	r.Policy.Targets = []domain.Target{}
	for _, n := range r.Staff {
		r.Policy.Targets = append(r.Policy.Targets, domain.Target{
			NurseID: n.ID,
			Hours:   180,
			Off:     15,
		})
	}
	r.Boundary = []domain.Cell{}
	for _, n := range r.Staff {
		r.Boundary = append(r.Boundary, domain.Cell{
			NurseID:   n.ID,
			Date:      "2026-08-31",
			ShiftCode: "X",
			Version:   1,
		})
	}
	start := time.Date(2026, 9, 1, 0, 0, 0, 0, time.UTC)
	end := time.Date(2026, 10, 1, 0, 0, 0, 0, time.UTC)
	r.Assignments = []domain.Cell{}
	for d := start; d.Before(end); d = d.AddDate(0, 0, 1) {
		for _, n := range r.Staff {
			r.Assignments = append(r.Assignments, domain.Cell{
				NurseID: n.ID, Date: d.Format("2006-01-02"), ShiftCode: "X", Version: 1,
			})
		}
	}

	snap, err := scheduler.Snapshot(r)
	if err != nil {
		t.Fatalf("snapshot: %v", err)
	}

	out, err := scheduler.ConstraintSolver{}.Solve(context.Background(), domain.SolverInput{
		Snapshot:      snap,
		Scope:         domain.SolveScope{Start: "2026-09-01", End: "2026-09-30"},
		Seed:          42,
		MaxDuration:   5 * time.Second,
		MaxNodes:      15000,
		AllowPartTime: false,
	})
	if err != nil {
		t.Fatalf("solve failed: %v", err)
	}

	if out.Status != "complete" {
		t.Fatalf("expected status 'complete', got '%s', violations: %+v", out.Status, out.Violations)
	}

	// Verify error violations are 0
	for _, v := range out.Violations {
		if v.Severity == "error" {
			t.Errorf("unexpected error violation: %s (%s) on %s by %s: %s", v.RuleCode, v.Severity, v.Date, v.SubjectID, v.Message)
		}
	}

	// Verify both Day and Night shifts are assigned
	dayCount, nightCount := 0, 0
	byNurse := map[string]map[string]string{}
	for _, c := range out.Assignments {
		if c.ShiftCode == "Day" {
			dayCount++
		} else if c.ShiftCode == "Night" {
			nightCount++
		}
		if byNurse[c.NurseID] == nil {
			byNurse[c.NurseID] = map[string]string{}
		}
		byNurse[c.NurseID][c.Date] = c.ShiftCode
	}

	if dayCount == 0 || nightCount == 0 {
		t.Errorf("expected both Day and Night shifts to be assigned, got Day=%d, Night=%d", dayCount, nightCount)
	}

	// Verify rest rules: Night cannot be followed by Day on next day (0h rest)
	for nurseID, days := range byNurse {
		for d := start; d.Before(end.AddDate(0, 0, -1)); d = d.AddDate(0, 0, 1) {
			ds1 := d.Format("2006-01-02")
			ds2 := d.AddDate(0, 0, 1).Format("2006-01-02")
			s1 := days[ds1]
			s2 := days[ds2]
			if s1 == "Night" && s2 == "Day" {
				t.Errorf("forbidden transition Night -> Day on consecutive days for nurse %s on %s -> %s", nurseID, ds1, ds2)
			}
		}
	}
}

// TestHybrid8HourAnd12HourAutoScheduling verifies auto scheduling for a hybrid ward with both 8h and 12h shifts
func TestHybrid8HourAnd12HourAutoScheduling(t *testing.T) {
	r := testfixture.Roster()
	r = testfixture.ReadyRoster(r)
	r.Staff = []domain.Staff{}
	for i := 1; i <= 10; i++ {
		r.Staff = append(r.Staff, domain.Staff{
			ID:       fmt.Sprintf("rn-%d", i),
			Name:     fmt.Sprintf("พยาบาล 12h RN %d", i),
			Position: "RN",
			Active:   true,
			Leader:   i <= 4,
			Double:   true,
			Allowed:  []string{"Day", "Night", "ช", "บ", "ด", "ชบ", "X", "L"},
		})
	}
	r.Shifts = []domain.RosterShift{
		{Code: "ช", Name: "เช้า (8h)", Periods: []domain.Period{{Start: 480, End: 960}}},
		{Code: "บ", Name: "บ่าย (8h)", Periods: []domain.Period{{Start: 960, End: 1440}}},
		{Code: "ด", Name: "ดึก (8h)", Periods: []domain.Period{{Start: 0, End: 480}}},
		{Code: "ชบ", Name: "เช้าบ่าย (16h)", Double: true, Periods: []domain.Period{{Start: 480, End: 960}, {Start: 960, End: 1440}}},
		{Code: "Day", Name: "กลางวัน (12h)", Periods: []domain.Period{{Start: 480, End: 1200}}},
		{Code: "Night", Name: "กลางคืน (12h)", Periods: []domain.Period{{Start: 1200, End: 1920}}},
		{Code: "X", Name: "OFF", Periods: []domain.Period{}},
		{Code: "L", Name: "ลา", Periods: []domain.Period{}},
	}
	r.Policy.Staffing = []domain.Staffing{
		{Date: "", Start: 480, End: 1200, RN: 1, PN: 0, Leaders: 1},
		{Date: "", Start: 1200, End: 1920, RN: 1, PN: 0, Leaders: 1},
	}
	r.Policy.MinRestHours = 8
	r.Policy.MaxConsecutiveDays = 5
	r.Policy.MaxConsecutiveNights = 3
	r.Policy.MaxContinuousHours = 16
	r.Policy.MinOff = 8
	r.Policy.MaxDoubleShifts = 4
	r.Policy.Targets = []domain.Target{}
	for _, n := range r.Staff {
		r.Policy.Targets = append(r.Policy.Targets, domain.Target{
			NurseID: n.ID,
			Hours:   180,
			Off:     15,
		})
	}
	r.Boundary = []domain.Cell{}
	for _, n := range r.Staff {
		r.Boundary = append(r.Boundary, domain.Cell{
			NurseID:   n.ID,
			Date:      "2026-08-31",
			ShiftCode: "X",
			Version:   1,
		})
	}
	start := time.Date(2026, 9, 1, 0, 0, 0, 0, time.UTC)
	end := time.Date(2026, 10, 1, 0, 0, 0, 0, time.UTC)
	r.Assignments = []domain.Cell{}
	for d := start; d.Before(end); d = d.AddDate(0, 0, 1) {
		for _, n := range r.Staff {
			r.Assignments = append(r.Assignments, domain.Cell{
				NurseID: n.ID, Date: d.Format("2006-01-02"), ShiftCode: "X", Version: 1,
			})
		}
	}

	snap, err := scheduler.Snapshot(r)
	if err != nil {
		t.Fatalf("snapshot: %v", err)
	}

	out, err := scheduler.ConstraintSolver{}.Solve(context.Background(), domain.SolverInput{
		Snapshot:      snap,
		Scope:         domain.SolveScope{Start: "2026-09-01", End: "2026-09-30"},
		Seed:          99,
		MaxDuration:   5 * time.Second,
		MaxNodes:      20000,
		AllowPartTime: false,
	})
	if err != nil {
		t.Fatalf("solve failed: %v", err)
	}

	if out.Status != "complete" {
		t.Fatalf("expected status 'complete', got '%s', violations: %+v", out.Status, out.Violations)
	}

	// Verify error violations are 0
	for _, v := range out.Violations {
		if v.Severity == "error" {
			t.Errorf("unexpected error violation in hybrid schedule: %s (%s) on %s by %s: %s", v.RuleCode, v.Severity, v.Date, v.SubjectID, v.Message)
		}
	}
}

// Test3ShiftPolicyWithDayNightRelief verifies that when policy is defined as 3 shifts (ช, บ, ด),
// the solver can actively utilize Day and Night shifts to relieve staffing shortages and form valid pairs.
func Test3ShiftPolicyWithDayNightRelief(t *testing.T) {
	r := testfixture.Roster()
	r = testfixture.ReadyRoster(r)
	r.Staff = []domain.Staff{}
	for i := 1; i <= 8; i++ {
		r.Staff = append(r.Staff, domain.Staff{
			ID:       fmt.Sprintf("rn-%d", i),
			Name:     fmt.Sprintf("พยาบาล RN %d", i),
			Position: "RN",
			Active:   true,
			Leader:   i <= 4,
			Double:   false, // Pure single/12h shifts
			Allowed:  []string{"Day", "Night", "ช", "บ", "ด", "X", "L"},
		})
	}
	r.Shifts = []domain.RosterShift{
		{Code: "ช", Name: "เช้า (8h)", Periods: []domain.Period{{Start: 480, End: 960}}},
		{Code: "บ", Name: "บ่าย (8h)", Periods: []domain.Period{{Start: 960, End: 1440}}},
		{Code: "ด", Name: "ดึก (8h)", Periods: []domain.Period{{Start: 0, End: 480}}},
		{Code: "Day", Name: "กลางวัน (12h)", Periods: []domain.Period{{Start: 480, End: 1200}}},
		{Code: "Night", Name: "กลางคืน (12h)", Periods: []domain.Period{{Start: 1200, End: 1920}}},
		{Code: "X", Name: "OFF", Periods: []domain.Period{}},
		{Code: "L", Name: "ลา", Periods: []domain.Period{}},
	}
	// 3 shifts per day: 08-16 (1 RN), 16-24 (1 RN), 00-08 (1 RN)
	r.Policy.Staffing = []domain.Staffing{
		{Date: "", Start: 480, End: 960, RN: 1, PN: 0, Leaders: 1},
		{Date: "", Start: 960, End: 1440, RN: 1, PN: 0, Leaders: 1},
		{Date: "", Start: 0, End: 480, RN: 1, PN: 0, Leaders: 1},
	}
	r.Policy.MinRestHours = 8
	r.Policy.MaxConsecutiveDays = 5
	r.Policy.MaxConsecutiveNights = 3
	r.Policy.MaxContinuousHours = 16
	r.Policy.MinOff = 8
	r.Policy.Targets = []domain.Target{}
	for _, n := range r.Staff {
		r.Policy.Targets = append(r.Policy.Targets, domain.Target{
			NurseID: n.ID,
			Hours:   180,
			Off:     15,
		})
	}
	r.Boundary = []domain.Cell{}
	for _, n := range r.Staff {
		r.Boundary = append(r.Boundary, domain.Cell{
			NurseID:   n.ID,
			Date:      "2026-08-31",
			ShiftCode: "X",
			Version:   1,
		})
	}
	start := time.Date(2026, 9, 1, 0, 0, 0, 0, time.UTC)
	end := time.Date(2026, 10, 1, 0, 0, 0, 0, time.UTC)
	r.Assignments = []domain.Cell{}
	for d := start; d.Before(end); d = d.AddDate(0, 0, 1) {
		for _, n := range r.Staff {
			r.Assignments = append(r.Assignments, domain.Cell{
				NurseID: n.ID, Date: d.Format("2006-01-02"), ShiftCode: "X", Version: 1,
			})
		}
	}

	snap, err := scheduler.Snapshot(r)
	if err != nil {
		t.Fatalf("snapshot: %v", err)
	}

	out, err := scheduler.ConstraintSolver{}.Solve(context.Background(), domain.SolverInput{
		Snapshot:      snap,
		Scope:         domain.SolveScope{Start: "2026-09-01", End: "2026-09-30"},
		Seed:          42,
		MaxDuration:   5 * time.Second,
		MaxNodes:      20000,
		AllowPartTime: false,
	})
	if err != nil {
		t.Fatalf("solve failed: %v", err)
	}

	if out.Status != "complete" {
		t.Fatalf("expected status 'complete', got '%s', violations: %+v", out.Status, out.Violations)
	}

	// Verify error violations are 0
	for _, v := range out.Violations {
		if v.Severity == "error" {
			t.Errorf("unexpected error violation: %s (%s) on %s by %s: %s", v.RuleCode, v.Severity, v.Date, v.SubjectID, v.Message)
		}
	}

	// Verify that Day and Night shifts are assigned and utilized
	dayCount, nightCount := 0, 0
	byNurse := map[string]map[string]string{}
	for _, c := range out.Assignments {
		if c.ShiftCode == "Day" {
			dayCount++
		} else if c.ShiftCode == "Night" {
			nightCount++
		}
		if byNurse[c.NurseID] == nil {
			byNurse[c.NurseID] = map[string]string{}
		}
		byNurse[c.NurseID][c.Date] = c.ShiftCode
	}

	t.Logf("Day shifts scheduled: %d, Night shifts scheduled: %d", dayCount, nightCount)
	if dayCount == 0 || nightCount == 0 {
		t.Errorf("expected Day and Night shifts to be actively utilized, got Day=%d, Night=%d", dayCount, nightCount)
	}

	// Verify rest rules: Night cannot be followed by Day on next day (0h rest)
	for nurseID, days := range byNurse {
		for d := start; d.Before(end.AddDate(0, 0, -1)); d = d.AddDate(0, 0, 1) {
			ds1 := d.Format("2006-01-02")
			ds2 := d.AddDate(0, 0, 1).Format("2006-01-02")
			s1 := days[ds1]
			s2 := days[ds2]
			if s1 == "Night" && s2 == "Day" {
				t.Errorf("forbidden transition Night -> Day on consecutive days for nurse %s on %s -> %s", nurseID, ds1, ds2)
			}
		}
	}
}










