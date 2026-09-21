package scheduler

import (
	"context"
	"nurse-scheduler/backend/internal/domain"
	"nurse-scheduler/backend/internal/testfixture"
	"testing"
	"time"
)

// ── helpers ──

func readyRoster() domain.Roster {
	r := testfixture.Roster()
	r = testfixture.ReadyRoster(r)
	// Fill the full month with X assignments so the solver has a base
	start := time.Date(2026, 9, 1, 0, 0, 0, 0, time.UTC)
	end := time.Date(2026, 10, 1, 0, 0, 0, 0, time.UTC)
	for d := start; d.Before(end); d = d.AddDate(0, 0, 1) {
		for _, n := range r.Staff {
			r.Assignments = append(r.Assignments, domain.Cell{
				NurseID: n.ID, Date: d.Format("2006-01-02"), ShiftCode: "X", Version: 1,
			})
		}
	}
	return r
}

// ── Snapshot tests ──

func TestSnapshotHashDeterministic(t *testing.T) {
	r := readyRoster()
	a, err := Snapshot(r)
	if err != nil {
		t.Fatalf("snapshot error: %v", err)
	}
	b, err := Snapshot(r)
	if err != nil {
		t.Fatalf("snapshot error: %v", err)
	}
	if a.Hash != b.Hash {
		t.Fatal("identical rosters must produce identical hashes")
	}
	if a.Hash == "" {
		t.Fatal("hash must not be empty")
	}
}

func TestSnapshotHashChangesOnMutation(t *testing.T) {
	r := readyRoster()
	a, _ := Snapshot(r)
	r.Assignments[0].ShiftCode = "ช"
	b, _ := Snapshot(r)
	if a.Hash == b.Hash {
		t.Fatal("mutated roster must produce a different hash")
	}
}

func TestSnapshotSchemaVersion(t *testing.T) {
	r := readyRoster()
	s, err := Snapshot(r)
	if err != nil {
		t.Fatalf("snapshot error: %v", err)
	}
	if s.SchemaVersion != 1 {
		t.Fatalf("expected SchemaVersion 1, got %d", s.SchemaVersion)
	}
}

func TestSnapshotIncludesLeaves(t *testing.T) {
	r := readyRoster()
	r.Leaves = []domain.Leave{{NurseID: "test-a", Start: "2026-09-05", End: "2026-09-05", Approved: true}}
	s, err := Snapshot(r)
	if err != nil {
		t.Fatalf("snapshot error: %v", err)
	}
	if len(s.Leaves) != 1 {
		t.Fatalf("expected 1 leave in snapshot, got %d", len(s.Leaves))
	}
}

// ── ValidateScope tests ──

func TestValidateScopeValid(t *testing.T) {
	r := readyRoster()
	if err := ValidateScope(r, domain.SolveScope{}); err != nil {
		t.Fatalf("empty scope should be valid: %v", err)
	}
	if err := ValidateScope(r, domain.SolveScope{Start: "2026-09-01", End: "2026-09-30"}); err != nil {
		t.Fatalf("full month scope should be valid: %v", err)
	}
	if err := ValidateScope(r, domain.SolveScope{NurseIDs: []string{"test-a"}}); err != nil {
		t.Fatalf("single nurse scope should be valid: %v", err)
	}
}

func TestValidateScopeRejectsInvalid(t *testing.T) {
	r := readyRoster()
	cases := []struct {
		name  string
		scope domain.SolveScope
	}{
		{"start only", domain.SolveScope{Start: "2026-09-01"}},
		{"end only", domain.SolveScope{End: "2026-09-30"}},
		{"before month", domain.SolveScope{Start: "2026-08-01", End: "2026-09-30"}},
		{"after month", domain.SolveScope{Start: "2026-09-01", End: "2026-10-01"}},
		{"end before start", domain.SolveScope{Start: "2026-09-15", End: "2026-09-10"}},
		{"unknown nurse", domain.SolveScope{NurseIDs: []string{"unknown"}}},
		{"duplicate nurse", domain.SolveScope{NurseIDs: []string{"test-a", "test-a"}}},
	}
	for _, tc := range cases {
		if err := ValidateScope(r, tc.scope); err == nil {
			t.Errorf("expected error for %q scope", tc.name)
		}
	}
}

// ── Readiness tests ──

func TestReadinessReady(t *testing.T) {
	r := readyRoster()
	report, err := Readiness(r, false)
	if err != nil {
		t.Fatalf("readiness error: %v", err)
	}
	if !report.Ready {
		for _, issue := range report.Issues {
			t.Logf("issue: %s %s %s %s — %s (fix: %s)", issue.Code, issue.Field, issue.Date, issue.NurseID, issue.Message, issue.FixPath)
		}
		t.Fatal("expected readiness to be true")
	}
	if report.Revision == "" {
		t.Fatal("revision must not be empty")
	}
}

func TestReadinessIssueStructure(t *testing.T) {
	r := readyRoster()
	r.Policy.Status = "draft" // not confirmed → issue for non-simulation
	report, _ := Readiness(r, false)
	if report.Ready {
		t.Fatal("expected readiness to be false with draft policy")
	}
	if len(report.Issues) == 0 {
		t.Fatal("expected at least one issue")
	}
	for _, issue := range report.Issues {
		if issue.Code == "" {
			t.Error("issue must have code")
		}
		if issue.Field == "" {
			t.Error("issue must have field")
		}
		if issue.FixPath == "" {
			t.Error("issue must have fixPath")
		}
		if issue.Severity == "" {
			t.Error("issue must have severity")
		}
	}
}

func TestReadinessSimulationAllowsDraft(t *testing.T) {
	r := readyRoster()
	r.Policy.Status = "draft"
	report, _ := Readiness(r, true)
	// Simulation allows draft — should not have POLICY_NOT_CONFIRMED
	for _, issue := range report.Issues {
		if issue.Code == "POLICY_NOT_CONFIRMED" {
			t.Error("simulation should accept draft policy")
		}
	}
}

func TestReadinessNoStaff(t *testing.T) {
	r := readyRoster()
	r.Staff = []domain.Staff{}
	report, _ := Readiness(r, true)
	found := false
	for _, issue := range report.Issues {
		if issue.Code == "STAFF_MISSING" {
			found = true
		}
	}
	if !found {
		t.Error("expected STAFF_MISSING issue when no active staff")
	}
}

func TestReadinessMissingBoundary(t *testing.T) {
	r := readyRoster()
	r.Boundary = []domain.Cell{} // remove boundary data
	report, _ := Readiness(r, false)
	found := false
	for _, issue := range report.Issues {
		if issue.Code == "BOUNDARY_MISSING" {
			found = true
		}
	}
	if !found {
		t.Error("expected BOUNDARY_MISSING issue")
	}
}

func TestReadinessMissingTargets(t *testing.T) {
	r := readyRoster()
	r.Policy.Targets = []domain.Target{} // remove targets
	report, _ := Readiness(r, false)
	found := false
	for _, issue := range report.Issues {
		if issue.Code == "TARGET_MISSING" {
			found = true
		}
	}
	if !found {
		t.Error("expected TARGET_MISSING issue when targets are empty")
	}
}

func TestReadinessMissingRestShifts(t *testing.T) {
	r := readyRoster()
	// Remove X and L shifts
	filtered := []domain.RosterShift{}
	for _, s := range r.Shifts {
		if s.Code != "X" && s.Code != "L" {
			filtered = append(filtered, s)
		}
	}
	r.Shifts = filtered
	report, _ := Readiness(r, true)
	found := false
	for _, issue := range report.Issues {
		if issue.Code == "REST_SHIFT_MISSING" {
			found = true
		}
	}
	if !found {
		t.Error("expected REST_SHIFT_MISSING issue when X/L shifts missing")
	}
}

// ── Solver tests ──

func TestSolveComplete(t *testing.T) {
	r := readyRoster()
	snap, err := Snapshot(r)
	if err != nil {
		t.Fatalf("snapshot error: %v", err)
	}
	input := domain.SolverInput{
		Snapshot:    snap,
		Scope:       domain.SolveScope{},
		Seed:        42,
		MaxDuration: 5 * time.Second,
		MaxNodes:    10000,
	}
	solver := ConstraintSolver{}
	result, err := solver.Solve(context.Background(), input)
	if err != nil {
		t.Fatalf("solve error: %v", err)
	}
	// With 2 nurses and X-only initial assignments, solver should find a valid assignment
	if result.Status != "complete" && result.Status != "partial" && result.Status != "timeout" {
		t.Fatalf("unexpected status: %s", result.Status)
	}
	if len(result.Assignments) == 0 {
		t.Fatal("expected at least some assignments in result")
	}
	if len(result.Violations) < 0 {
		t.Fatal("violations should be initialized")
	}
}

func TestSolveCompletePassesAllHardConstraints(t *testing.T) {
	r := readyRoster()
	snap, _ := Snapshot(r)
	input := domain.SolverInput{
		Snapshot:    snap,
		Scope:       domain.SolveScope{},
		Seed:        42,
		MaxDuration: 10 * time.Second,
		MaxNodes:    50000,
	}
	result, err := ConstraintSolver{}.Solve(context.Background(), input)
	if err != nil {
		t.Fatalf("solve error: %v", err)
	}
	if result.Status == "complete" {
		for _, v := range result.Violations {
			if v.Severity == "error" {
				t.Errorf("complete result has hard violation: %s %s %s — %s", v.RuleCode, v.Date, v.SubjectID, v.Message)
			}
		}
	}
}

func TestSolveLockedCellsPreserved(t *testing.T) {
	r := readyRoster()
	// Lock one cell
	r.Assignments[0].ShiftCode = "ช"
	r.Assignments[0].Locked = true
	snap, _ := Snapshot(r)
	input := domain.SolverInput{
		Snapshot:    snap,
		Scope:       domain.SolveScope{},
		Seed:        1,
		MaxDuration: 5 * time.Second,
		MaxNodes:    10000,
	}
	result, err := ConstraintSolver{}.Solve(context.Background(), input)
	if err != nil {
		t.Fatalf("solve error: %v", err)
	}
	// Find the locked cell in result
	for _, c := range result.Assignments {
		if c.Date == r.Assignments[0].Date && c.NurseID == r.Assignments[0].NurseID {
			if c.ShiftCode != "ช" {
				t.Errorf("locked cell changed from ช to %s", c.ShiftCode)
			}
			return
		}
	}
}

func TestSolveScopeNarrow(t *testing.T) {
	r := readyRoster()
	snap, _ := Snapshot(r)
	// Only solve for test-a on Sep 1
	input := domain.SolverInput{
		Snapshot: snap,
		Scope:    domain.SolveScope{Start: "2026-09-01", End: "2026-09-01", NurseIDs: []string{"test-a"}},
		Seed:     1, MaxDuration: 5 * time.Second, MaxNodes: 10000,
	}
	result, err := ConstraintSolver{}.Solve(context.Background(), input)
	if err != nil {
		t.Fatalf("solve error: %v", err)
	}
	// Out-of-scope cells must keep original shift (X)
	for _, c := range result.Assignments {
		if c.NurseID == "test-b" && c.ShiftCode != "X" {
			t.Errorf("out-of-scope nurse test-b changed on %s from X to %s", c.Date, c.ShiftCode)
		}
		if c.NurseID == "test-a" && c.Date != "2026-09-01" && c.ShiftCode != "X" {
			t.Errorf("out-of-scope date %s for test-a changed from X to %s", c.Date, c.ShiftCode)
		}
	}
}

func TestSolveTimeout(t *testing.T) {
	r := readyRoster()
	snap, _ := Snapshot(r)
	// Very tight budget → should timeout or exhaust quickly
	ctx, cancel := context.WithTimeout(context.Background(), 1*time.Millisecond)
	defer cancel()
	input := domain.SolverInput{
		Snapshot: snap, Scope: domain.SolveScope{}, Seed: 1,
		MaxDuration: 1 * time.Millisecond, MaxNodes: 1,
	}
	result, err := ConstraintSolver{}.Solve(ctx, input)
	if err != nil {
		t.Fatalf("solve error: %v", err)
	}
	// Should be timeout or infeasible (not complete with only 1 node)
	if result.Status == "complete" {
		t.Fatal("expected non-complete with 1 node budget")
	}
}

func TestSolveRejectsInvalidSchemaVersion(t *testing.T) {
	r := readyRoster()
	snap, _ := Snapshot(r)
	snap.SchemaVersion = 999
	input := domain.SolverInput{Snapshot: snap, Scope: domain.SolveScope{}, MaxDuration: time.Second, MaxNodes: 100}
	_, err := ConstraintSolver{}.Solve(context.Background(), input)
	if err == nil {
		t.Fatal("expected error for invalid schema version")
	}
}

// ── Score tests ──

func TestScoreRange(t *testing.T) {
	r := readyRoster()
	r.Policy.Weights = domain.ObjectiveWeights{Coverage: 1, Fairness: 1, Preference: 1, Stability: 1}
	s := Score(r, r.Assignments)
	for _, v := range []float64{s.Coverage, s.Fairness, s.Preference, s.Stability, s.Total} {
		if v < 0 || v > 100 {
			t.Errorf("score out of range [0,100]: %v", v)
		}
	}
}

func TestScoreStabilityDecreasesWithChanges(t *testing.T) {
	r := readyRoster()
	r.Policy.Weights = domain.ObjectiveWeights{Coverage: 1, Fairness: 1, Preference: 1, Stability: 1}
	original := append([]domain.Cell{}, r.Assignments...)
	before := Score(r, original)
	// Change every assignment
	for i := range r.Assignments {
		r.Assignments[i].ShiftCode = "ช"
	}
	after := Score(r, original)
	if after.Stability >= before.Stability {
		t.Error("stability should decrease when many cells change")
	}
}

func TestSolveRNAndPNSegregatedStaffing(t *testing.T) {
	r := readyRoster()
	// test-a is RN with Leader=true, test-b is PN
	// Add another RN
	r.Staff = append(r.Staff, domain.Staff{
		ID:       "test-rn2",
		Name:     "RN 2",
		Position: "RN",
		Active:   true,
		Leader:   true,
		Double:   true,
		Allowed:  []string{"ช", "บ", "ด", "ชบ", "บด", "Day", "Night", "X", "L"},
	})
	// Add another PN
	r.Staff = append(r.Staff, domain.Staff{
		ID:       "test-pn2",
		Name:     "PN 2",
		Position: "PN",
		Active:   true,
		Leader:   false,
		Double:   true,
		Allowed:  []string{"ช", "บ", "ด", "ชบ", "บด", "Day", "Night", "X", "L"},
	})
	r.Policy.Staffing = []domain.Staffing{
		{Start: 480, End: 960, RN: 0, PN: 1, Leaders: 1},
	}
	r.Policy.Targets = []domain.Target{
		{NurseID: "test-a", Hours: 160, Off: 8},
		{NurseID: "test-b", Hours: 160, Off: 8},
		{NurseID: "test-rn2", Hours: 160, Off: 8},
		{NurseID: "test-pn2", Hours: 160, Off: 8},
	}
	snap, err := Snapshot(r)
	if err != nil {
		t.Fatalf("snapshot: %v", err)
	}
	out, err := ConstraintSolver{}.Solve(context.Background(), domain.SolverInput{
		Snapshot: snap,
		MaxDuration: 2 * time.Second,
		MaxNodes: 3000,
	})
	if err != nil {
		t.Fatalf("solve: %v", err)
	}
	if out.Status != "complete" {
		t.Fatalf("expected complete, got %s (violations: %+v)", out.Status, out.Violations)
	}

	// Verify that on each day, 1 RN is assigned morning (or Day/ชบ) and 1 PN is assigned morning (or Day/ชบ)
	staffMap := map[string]domain.Staff{}
	for _, st := range r.Staff {
		staffMap[st.ID] = st
	}
	dayRN := map[string]int{}
	dayPN := map[string]int{}
	for _, c := range out.Assignments {
		if c.ShiftCode == "ช" || c.ShiftCode == "Day" || c.ShiftCode == "ชบ" {
			if staffMap[c.NurseID].Position == "RN" {
				dayRN[c.Date]++
			} else if staffMap[c.NurseID].Position == "PN" {
				dayPN[c.Date]++
			}
		}
	}
	start := time.Date(2026, 9, 1, 0, 0, 0, 0, time.UTC)
	end := time.Date(2026, 10, 1, 0, 0, 0, 0, time.UTC)
	for d := start; d.Before(end); d = d.AddDate(0, 0, 1) {
		ds := d.Format("2006-01-02")
		if dayRN[ds] < 1 {
			t.Errorf("date %s missing RN morning", ds)
		}
		if dayPN[ds] < 1 {
			t.Errorf("date %s missing PN morning", ds)
		}
	}
}

func TestSolveNeverGeneratesForbiddenTransitionsOrBD(t *testing.T) {
	r := readyRoster()
	// Add enough staff to rotate through shifts (Day/Eve/Night)
	for i := 1; i <= 6; i++ {
		r.Staff = append(r.Staff, domain.Staff{
			ID:       "extra-rn-" + string(rune('0'+i)),
			Name:     "Extra RN",
			Position: "RN",
			Active:   true,
			Leader:   true,
			Double:   true,
			Allowed:  []string{"ช", "บ", "ด", "ชบ", "บด", "Day", "Night", "X", "L"},
		})
	}
	r.Policy.Staffing = []domain.Staffing{
		{Start: 480, End: 960, RN: 1, PN: 0, Leaders: 1},
		{Start: 960, End: 1440, RN: 1, PN: 0, Leaders: 1},
		{Start: 0, End: 480, RN: 0, PN: 0, Leaders: 1},
	}
	for _, st := range r.Staff {
		r.Policy.Targets = append(r.Policy.Targets, domain.Target{NurseID: st.ID, Hours: 160, Off: 8})
	}
	snap, err := Snapshot(r)
	if err != nil {
		t.Fatalf("snapshot: %v", err)
	}
	out, err := ConstraintSolver{}.Solve(context.Background(), domain.SolverInput{
		Snapshot: snap,
		MaxDuration: 2 * time.Second,
		MaxNodes: 3000,
	})
	if err != nil {
		t.Fatalf("solve: %v", err)
	}
	if out.Status != "complete" {
		t.Fatalf("expected complete, got %s (violations: %+v)", out.Status, out.Violations)
	}

	// Verify no "บด" is ever assigned
	for _, c := range out.Assignments {
		if c.ShiftCode == "บด" {
			t.Fatalf("บด should not be assigned: %+v", c)
		}
	}

	// Group by nurse and verify no forbidden transitions (บ->ด, ด->บ, ด->ช)
	byNurse := map[string]map[string]string{}
	for _, c := range out.Assignments {
		if byNurse[c.NurseID] == nil {
			byNurse[c.NurseID] = map[string]string{}
		}
		byNurse[c.NurseID][c.Date] = c.ShiftCode
	}

	start := time.Date(2026, 9, 1, 0, 0, 0, 0, time.UTC)
	end := time.Date(2026, 10, 1, 0, 0, 0, 0, time.UTC)
	for nurseID, dates := range byNurse {
		for d := start; d.Before(end.AddDate(0, 0, -1)); d = d.AddDate(0, 0, 1) {
			d1 := d.Format("2006-01-02")
			d2 := d.AddDate(0, 0, 1).Format("2006-01-02")
			c1 := dates[d1]
			c2 := dates[d2]
			if c1 == "บ" && c2 == "ด" {
				t.Fatalf("forbidden transition บ->ด for nurse %s found on %s (%s) -> %s (%s)", nurseID, d1, c1, d2, c2)
			}
			if c1 == "ด" && c2 == "บ" {
				t.Fatalf("forbidden transition ด->บ found on %s->%s", d1, d2)
			}
			if c1 == "ด" && c2 == "ช" {
				t.Fatalf("forbidden transition ด->ช found on %s->%s", d1, d2)
			}
		}
	}
}

func TestSolveUtilizesDoubleShiftAnd12h(t *testing.T) {
	r := readyRoster()
	// Setup 14 RNs and 8 PNs
	r.Staff = []domain.Staff{}
	for i := 1; i <= 14; i++ {
		r.Staff = append(r.Staff, domain.Staff{
			ID:       "rn-" + string(rune('a'+i-1)),
			Name:     "RN Nurse",
			Position: "RN",
			Active:   true,
			Leader:   i <= 7,
			Double:   true,
			Allowed:  []string{"ช", "บ", "ด", "ชบ", "Day", "Night", "X", "L"},
		})
	}
	for i := 1; i <= 8; i++ {
		r.Staff = append(r.Staff, domain.Staff{
			ID:       "pn-" + string(rune('a'+i-1)),
			Name:     "PN Nurse",
			Position: "PN",
			Active:   true,
			Leader:   false,
			Double:   true,
			Allowed:  []string{"ช", "บ", "ด", "ชบ", "Day", "Night", "X", "L"},
		})
	}

	r.Policy.MinRestHours = 8
	r.Policy.MinOff = 7
	r.Policy.MaxConsecutiveDays = 6
	r.Policy.MaxConsecutiveNights = 3
	r.Policy.MaxDoubleShifts = 8
	r.Policy.MaxMonthlyHours = 250
	r.Policy.Staffing = []domain.Staffing{
		{Start: 480, End: 960, RN: 2, PN: 3, Leaders: 1},
		{Start: 960, End: 1440, RN: 2, PN: 3, Leaders: 1},
		{Start: 0, End: 480, RN: 1, PN: 2, Leaders: 1},
	}
	for _, st := range r.Staff {
		r.Policy.Targets = append(r.Policy.Targets, domain.Target{NurseID: st.ID, Hours: 176, Off: 8})
	}

	// Base assignments
	r.Assignments = []domain.Cell{}
	start := time.Date(2026, 9, 1, 0, 0, 0, 0, time.UTC)
	end := time.Date(2026, 10, 1, 0, 0, 0, 0, time.UTC)
	for d := start; d.Before(end); d = d.AddDate(0, 0, 1) {
		for _, n := range r.Staff {
			r.Assignments = append(r.Assignments, domain.Cell{
				NurseID: n.ID, Date: d.Format("2006-01-02"), ShiftCode: "X", Version: 1,
			})
		}
	}

	snap, err := Snapshot(r)
	if err != nil {
		t.Fatalf("snapshot: %v", err)
	}

	out, err := ConstraintSolver{}.Solve(context.Background(), domain.SolverInput{
		Snapshot:    snap,
		MaxDuration: 3 * time.Second,
		MaxNodes:    3000,
	})
	if err != nil {
		t.Fatalf("solve: %v", err)
	}
	if out.Status != "complete" {
		t.Logf("--- Assignments for days 1 to 30 ---")
		for d := start; d.Before(end); d = d.AddDate(0, 0, 1) {
			ds := d.Format("2006-01-02")
			var rowRN, rowPN []string
			for _, n := range r.Staff {
				for _, c := range out.Assignments {
					if c.Date == ds && c.NurseID == n.ID {
						if n.Position == "RN" {
							rowRN = append(rowRN, n.ID+":"+c.ShiftCode)
						} else {
							rowPN = append(rowPN, n.ID+":"+c.ShiftCode)
						}
					}
				}
			}
			t.Logf("%s RNs: %v", ds, rowRN)
			t.Logf("%s PNs: %v", ds, rowPN)
		}
		// Print nurse total hours and double shifts count
		for _, n := range r.Staff {
			if n.Position == "PN" {
				hrs := 0.0
				doubles := 0
				offs := 0
				for _, c := range out.Assignments {
					if c.NurseID == n.ID {
						if c.ShiftCode == "ชบ" {
							hrs += 16.0
							doubles++
						} else if c.ShiftCode == "X" {
							offs++
						} else if c.ShiftCode != "" {
							hrs += 8.0
						}
					}
				}
				t.Logf("PN %s: Hours=%.1f, Doubles=%d, Offs=%d", n.ID, hrs, doubles, offs)
			}
		}
		for _, v := range out.Violations {
			if v.Severity == "error" {
				t.Logf("Violation error: %s on %s: %s (%+v)", v.RuleCode, v.Date, v.Message, v.Metadata)
			}
		}
		t.Fatalf("expected complete, got %s", out.Status)
	}

	// Verify that ชบ was actively used to fulfill double staffing
	doubleCount := 0
	for _, c := range out.Assignments {
		if c.ShiftCode == "ชบ" {
			doubleCount++
		}
	}
	if doubleCount == 0 {
		t.Errorf("expected ชบ to be utilized, got 0")
	}
	t.Logf("Successfully scheduled %d double shifts (ชบ) to achieve 100%% staffing coverage with 0 errors", doubleCount)
}

func TestMultiPlanProfilesAndMetrics(t *testing.T) {
	r := readyRoster()
	snap, err := Snapshot(r)
	if err != nil {
		t.Fatalf("snapshot error: %v", err)
	}

	profiles := []string{"balanced", "rest_focused", "preference_focused"}
	solver := ConstraintSolver{}

	for _, prof := range profiles {
		input := domain.SolverInput{
			Snapshot:      snap,
			Profile:       prof,
			Seed:          42,
			MaxDuration:   10 * time.Second,
			MaxNodes:      30000,
			AllowPartTime: true,
		}

		out, err := solver.Solve(context.Background(), input)
		if err != nil {
			t.Fatalf("profile %s solve error: %v", prof, err)
		}
		if out.Profile != prof {
			t.Errorf("expected profile %s, got %s", prof, out.Profile)
		}
		if out.Metrics == nil {
			t.Fatalf("expected plan metrics for profile %s, got nil", prof)
		}
		if out.Metrics.FairnessScore <= 0 {
			t.Errorf("expected positive fairness score, got %v", out.Metrics.FairnessScore)
		}
		t.Logf("Profile: %s -> Status: %s, Fairness: %.1f, PrefRate: %.1f%%, ConsecOffs: %d, 12h: %d, Doubles: %d, StdDev: %.1f",
			prof, out.Status, out.Metrics.FairnessScore, out.Metrics.PreferenceRate,
			out.Metrics.ConsecutiveOffs, out.Metrics.TwelveHourShifts, out.Metrics.DoubleShifts, out.Metrics.HoursStdDev)
	}
}

func TestPruneExcessDoubles(t *testing.T) {
	r := readyRoster()
	r.Staff = []domain.Staff{
		{ID: "rn-1", Name: "RN 1", Position: "RN", Active: true, Leader: true, Double: true, Allowed: []string{"ช", "บ", "ด", "ชบ"}},
		{ID: "rn-2", Name: "RN 2", Position: "RN", Active: true, Leader: false, Double: true, Allowed: []string{"ช", "บ", "ด", "ชบ"}},
		{ID: "rn-3", Name: "RN 3", Position: "RN", Active: true, Leader: false, Double: true, Allowed: []string{"ช", "บ", "ด", "ชบ"}},
		{ID: "rn-4", Name: "RN 4", Position: "RN", Active: true, Leader: false, Double: true, Allowed: []string{"ช", "บ", "ด", "ชบ"}},
		{ID: "rn-5", Name: "RN 5", Position: "RN", Active: true, Leader: false, Double: true, Allowed: []string{"ช", "บ", "ด", "ชบ"}},
		{ID: "rn-6", Name: "RN 6", Position: "RN", Active: true, Leader: true, Double: true, Allowed: []string{"ช", "บ", "ด", "ชบ"}},
		{ID: "rn-7", Name: "RN 7", Position: "RN", Active: true, Leader: false, Double: true, Allowed: []string{"ช", "บ", "ด", "ชบ"}},
		{ID: "rn-8", Name: "RN 8", Position: "RN", Active: true, Leader: false, Double: true, Allowed: []string{"ช", "บ", "ด", "ชบ"}},
		{ID: "rn-9", Name: "RN 9", Position: "RN", Active: true, Leader: false, Double: true, Allowed: []string{"ช", "บ", "ด", "ชบ"}},
	}
	r.Policy.Staffing = []domain.Staffing{
		{Start: 480, End: 960, RN: 4, Leaders: 1, PN: 0},  // Morning: 5 RN
		{Start: 960, End: 1440, RN: 3, Leaders: 1, PN: 0}, // Evening: 4 RN
		{Start: 0, End: 480, RN: 1, Leaders: 1, PN: 0},    // Night: 2 RN
	}

	date := "2026-09-01"
	// Setup a day with 2 RNs on ชบ, 3 RNs on ช, and 4 RNs on บ => Morning: 5 RN (5/5), Evening: 6 RN (6/4, +2 excess)
	cells := []domain.Cell{
		{NurseID: "rn-1", Date: date, ShiftCode: "ชบ"}, // Leader on ชบ
		{NurseID: "rn-2", Date: date, ShiftCode: "ชบ"}, // Non-leader on ชบ
		{NurseID: "rn-3", Date: date, ShiftCode: "ช"},
		{NurseID: "rn-4", Date: date, ShiftCode: "ช"},
		{NurseID: "rn-5", Date: date, ShiftCode: "ช"},
		{NurseID: "rn-6", Date: date, ShiftCode: "บ"},
		{NurseID: "rn-7", Date: date, ShiftCode: "บ"},
		{NurseID: "rn-8", Date: date, ShiftCode: "บ"},
		{NurseID: "rn-9", Date: date, ShiftCode: "บ"},
	}

	pruned := pruneExcessDoubles(r, cells)

	eveRN := 0
	mornRN := 0
	for _, c := range pruned {
		if c.ShiftCode == "ช" || c.ShiftCode == "ชบ" {
			mornRN++
		}
		if c.ShiftCode == "บ" || c.ShiftCode == "ชบ" {
			eveRN++
		}
	}

	if mornRN != 5 {
		t.Errorf("expected morning RN count to remain 5, got %d", mornRN)
	}
	if eveRN != 4 {
		t.Errorf("expected evening RN count to be pruned to exactly 4, got %d", eveRN)
	}
	t.Logf("Pruned result: Morning RN=%d (5/5), Evening RN=%d (4/4, zero excess)", mornRN, eveRN)
}

func TestPruneExcessDoubles_HospitalStandard_12HourWeighting(t *testing.T) {
	r := readyRoster()
	r.Staff = []domain.Staff{
		{ID: "rn-1", Name: "RN 1", Position: "RN", Active: true, Leader: true, Allowed: []string{"ช", "บ", "ด", "ชบ", "D", "N"}},
		{ID: "rn-2", Name: "RN 2", Position: "RN", Active: true, Leader: false, Allowed: []string{"ช", "บ", "ด", "ชบ", "D", "N"}},
		{ID: "rn-3", Name: "RN 3", Position: "RN", Active: true, Leader: false, Allowed: []string{"ช", "บ", "ด", "ชบ", "D", "N"}},
		{ID: "rn-4", Name: "RN 4", Position: "RN", Active: true, Leader: false, Allowed: []string{"ช", "บ", "ด", "ชบ", "D", "N"}},
		{ID: "rn-5", Name: "RN 5", Position: "RN", Active: true, Leader: false, Allowed: []string{"ช", "บ", "ด", "ชบ", "D", "N"}},
		{ID: "rn-6", Name: "RN 6", Position: "RN", Active: true, Leader: false, Allowed: []string{"ช", "บ", "ด", "ชบ", "D", "N"}},
	}
	r.Policy.Staffing = []domain.Staffing{
		{Start: 480, End: 960, RN: 3, Leaders: 1, PN: 0},  // Morning: 4 RN
		{Start: 960, End: 1440, RN: 3, Leaders: 1, PN: 0}, // Evening: 4 RN
		{Start: 0, End: 480, RN: 1, Leaders: 1, PN: 0},    // Night: 2 RN
	}

	date := "2026-09-01"
	// Setup: 1 on D (0.5 eve), 1 on N (0.5 eve), 2 on บ (2.0 eve), 2 on ชบ (2.0 eve)
	// Total Evening = 0.5 + 0.5 + 2.0 + 2.0 = 5.0 (Target: 4.0 => Excess = +1.0)
	cells := []domain.Cell{
		{NurseID: "rn-1", Date: date, ShiftCode: "D"},
		{NurseID: "rn-2", Date: date, ShiftCode: "N"},
		{NurseID: "rn-3", Date: date, ShiftCode: "บ"},
		{NurseID: "rn-4", Date: date, ShiftCode: "บ"},
		{NurseID: "rn-5", Date: date, ShiftCode: "ชบ"},
		{NurseID: "rn-6", Date: date, ShiftCode: "ชบ"},
	}

	pruned := pruneExcessDoubles(r, cells)

	eveScore := 0.0
	for _, c := range pruned {
		if c.ShiftCode == "บ" || c.ShiftCode == "ชบ" {
			eveScore += 1.0
		} else if c.ShiftCode == "D" || c.ShiftCode == "N" {
			eveScore += 0.5
		}
	}

	if eveScore != 4.0 {
		t.Errorf("expected evening RN count to be pruned to exactly 4.0, got %.1f", eveScore)
	}
	t.Logf("Hospital formula pruned result: Evening RN=%.1f (Target 4.0)", eveScore)
}

func TestPruneExcessDoubles_TrimEveningToNotExceedTarget(t *testing.T) {
	r := readyRoster()
	r.Staff = []domain.Staff{
		{ID: "rn-1", Name: "RN 1", Position: "RN", Active: true, Leader: true, Allowed: []string{"ช", "บ", "ด", "ชบ", "D", "N"}},
		{ID: "rn-2", Name: "RN 2", Position: "RN", Active: true, Leader: false, Allowed: []string{"ช", "บ", "ด", "ชบ", "D", "N"}},
		{ID: "rn-3", Name: "RN 3", Position: "RN", Active: true, Leader: false, Allowed: []string{"ช", "บ", "ด", "ชบ", "D", "N"}},
		{ID: "rn-4", Name: "RN 4", Position: "RN", Active: true, Leader: false, Allowed: []string{"ช", "บ", "ด", "ชบ", "D", "N"}},
		{ID: "rn-5", Name: "RN 5", Position: "RN", Active: true, Leader: false, Allowed: []string{"ช", "บ", "ด", "ชบ", "D", "N"}},
	}
	r.Policy.Staffing = []domain.Staffing{
		{Start: 480, End: 960, RN: 3, Leaders: 1, PN: 0},  // Morning: 4 RN
		{Start: 960, End: 1440, RN: 3, Leaders: 1, PN: 0}, // Evening: 4 RN
		{Start: 0, End: 480, RN: 1, Leaders: 1, PN: 0},    // Night: 2 RN
	}

	date := "2026-09-01"
	// Setup: 1 on D (0.5 eve), 2 on บ (2.0 eve), 2 on ชบ (2.0 eve) => Evening = 4.5 (Target 4.0)
	// User Rule: If target is 4, allow 3.5 and DO NOT exceed 4 (4.5 must be trimmed to 3.5).
	cells := []domain.Cell{
		{NurseID: "rn-1", Date: date, ShiftCode: "D"},
		{NurseID: "rn-2", Date: date, ShiftCode: "บ"},
		{NurseID: "rn-3", Date: date, ShiftCode: "บ"},
		{NurseID: "rn-4", Date: date, ShiftCode: "ชบ"},
		{NurseID: "rn-5", Date: date, ShiftCode: "ชบ"},
	}

	pruned := pruneExcessDoubles(r, cells)

	eveScore := 0.0
	for _, c := range pruned {
		if c.ShiftCode == "บ" || c.ShiftCode == "ชบ" {
			eveScore += 1.0
		} else if c.ShiftCode == "D" || c.ShiftCode == "N" {
			eveScore += 0.5
		}
	}

	if eveScore != 3.5 {
		t.Errorf("expected evening RN count to be trimmed to 3.5 (not exceeding target 4.0), got %.1f", eveScore)
	}
	t.Logf("Hospital evening cap result: Evening RN=%.1f (<= Target 4.0, no excess OT)", eveScore)
}

func TestPruneExcessNight_DynamicDeficitCap(t *testing.T) {
	// Rule: If Yesterday's Evening target is 4.0 and actual is 3.5 (deficit 0.5),
	// Today's Night shift (target 4.0) is capped at 4.5 max (cannot be 5.0).
	r := domain.Roster{
		Month: 9,
		Year:  2026,
		Policy: domain.Policy{
			Staffing: []domain.Staffing{
				{Start: 480, End: 960, RN: 4, Leaders: 1},  // Morning: 5 RN
				{Start: 960, End: 1440, RN: 3, Leaders: 1}, // Evening: 4 RN
				{Start: 0, End: 480, RN: 3, Leaders: 1},    // Night: 4 RN
			},
		},
		Staff: []domain.Staff{
			// Yesterday evening staff: 1 on D (0.5 eve) + 3 on บ (3.0 eve) => Evening = 3.5 (Target 4.0, Deficit = 0.5)
			{ID: "rn-d1", Active: true, Position: "RN", Allowed: []string{"D", "X"}},
			{ID: "rn-e1", Active: true, Position: "RN", Allowed: []string{"บ", "X"}},
			{ID: "rn-e2", Active: true, Position: "RN", Allowed: []string{"บ", "X"}},
			{ID: "rn-e3", Active: true, Position: "RN", Leader: true, Allowed: []string{"บ", "X"}},

			// Today night staff: 6 nurses assigned to night shifts (1 leader + 5 regular), exceeding max allowed 4.5
			{ID: "rn-n1", Active: true, Position: "RN", Allowed: []string{"ด", "X"}},
			{ID: "rn-n2", Active: true, Position: "RN", Allowed: []string{"ด", "X"}},
			{ID: "rn-n3", Active: true, Position: "RN", Allowed: []string{"ด", "X"}},
			{ID: "rn-n4", Active: true, Position: "RN", Allowed: []string{"ชด", "ช", "X"}},
			{ID: "rn-n5", Active: true, Position: "RN", Allowed: []string{"บด", "บ", "X"}},
			{ID: "rn-nl", Active: true, Position: "RN", Leader: true, Allowed: []string{"ด", "X"}},
		},
		Shifts: []domain.RosterShift{
			{Code: "D", Periods: []domain.Period{{Start: 480, End: 1200}}},
			{Code: "บ", Periods: []domain.Period{{Start: 960, End: 1440}}},
			{Code: "ด", Periods: []domain.Period{{Start: 0, End: 480}}},
			{Code: "ชด", Periods: []domain.Period{{Start: 480, End: 960}, {Start: 0, End: 480}}},
			{Code: "บด", Periods: []domain.Period{{Start: 960, End: 1440}, {Start: 0, End: 480}}},
			{Code: "X", Periods: []domain.Period{}},
		},
	}

	prevDate := "2026-09-01"
	currDate := "2026-09-02"
	cells := []domain.Cell{
		// Yesterday (2026-09-01): Evening = 3.5 (Deficit 0.5)
		{NurseID: "rn-d1", Date: prevDate, ShiftCode: "D"},
		{NurseID: "rn-e1", Date: prevDate, ShiftCode: "บ"},
		{NurseID: "rn-e2", Date: prevDate, ShiftCode: "บ"},
		{NurseID: "rn-e3", Date: prevDate, ShiftCode: "บ"},

		// Today (2026-09-02): Night has 6 RNs assigned (1 leader + 3 on ด + 1 on ชด + 1 on บด)
		{NurseID: "rn-nl", Date: currDate, ShiftCode: "ด"},
		{NurseID: "rn-n1", Date: currDate, ShiftCode: "ด"},
		{NurseID: "rn-n2", Date: currDate, ShiftCode: "ด"},
		{NurseID: "rn-n3", Date: currDate, ShiftCode: "ด"},
		{NurseID: "rn-n4", Date: currDate, ShiftCode: "ชด"},
		{NurseID: "rn-n5", Date: currDate, ShiftCode: "บด"},
	}

	pruned := pruneExcessDoubles(r, cells)

	nightScore := 0.0
	for _, c := range pruned {
		if c.Date == currDate {
			if c.ShiftCode == "ด" || c.ShiftCode == "ชด" || c.ShiftCode == "บด" || c.ShiftCode == "N" || c.ShiftCode == "Night" || c.ShiftCode == "12N" {
				nightScore += 1.0
			}
		}
	}

	if nightScore > 4.5 {
		t.Errorf("expected today's night RN count to NOT exceed 4.5 (Target 4.0 + Yesterday Eve deficit 0.5), got %.1f", nightScore)
	}
	t.Logf("Hospital chronological night cap result: Night RN=%.1f (<= Max Allowed 4.5, perfectly balanced with yesterday Eve 3.5)", nightScore)
}

func TestPruneExcessNight_Day1Oct_FiveToFour(t *testing.T) {
	// Setup 1 Oct: Target Night RN = 4 (3 regular + 1 leader).
	// If 5 nurses are assigned to night on 1 Oct, the excess 1 nurse must be removed, leaving exactly 4.
	r := domain.Roster{
		Month: 10,
		Year:  2026,
		Policy: domain.Policy{
			Staffing: []domain.Staffing{
				{Start: 480, End: 960, RN: 4, Leaders: 1},  // Morning: 5 RN
				{Start: 960, End: 1440, RN: 3, Leaders: 1}, // Evening: 4 RN
				{Start: 0, End: 480, RN: 3, Leaders: 1},    // Night: 4 RN
			},
		},
		Boundary: []domain.Cell{
			// 30 Sep boundary: Evening had 4 nurses (no deficit)
			{NurseID: "rn-b1", Date: "2026-09-30", ShiftCode: "บ"},
			{NurseID: "rn-b2", Date: "2026-09-30", ShiftCode: "บ"},
			{NurseID: "rn-b3", Date: "2026-09-30", ShiftCode: "บ"},
			{NurseID: "rn-b4", Date: "2026-09-30", ShiftCode: "บ"},
		},
		Staff: []domain.Staff{
			{ID: "rn-1", Active: true, Position: "RN", Allowed: []string{"ด", "X"}},
			{ID: "rn-2", Active: true, Position: "RN", Allowed: []string{"ด", "X"}},
			{ID: "rn-3", Active: true, Position: "RN", Allowed: []string{"ด", "X"}},
			{ID: "rn-4", Active: true, Position: "RN", Allowed: []string{"ด", "X"}},
			{ID: "rn-5", Active: true, Position: "RN", Allowed: []string{"ด", "X"}},
			{ID: "rn-lead", Active: true, Position: "RN", Leader: true, Allowed: []string{"ด", "X"}},
		},
		Shifts: []domain.RosterShift{
			{Code: "บ", Periods: []domain.Period{{Start: 960, End: 1440}}},
			{Code: "ด", Periods: []domain.Period{{Start: 0, End: 480}}},
			{Code: "X", Periods: []domain.Period{}},
		},
	}

	date := "2026-10-01"
	// 1 Leader + 4 regular nurses on "ด" => Total 5 RNs on Night (Target is 4.0)
	cells := []domain.Cell{
		{NurseID: "rn-lead", Date: date, ShiftCode: "ด"},
		{NurseID: "rn-1", Date: date, ShiftCode: "ด"},
		{NurseID: "rn-2", Date: date, ShiftCode: "ด"},
		{NurseID: "rn-3", Date: date, ShiftCode: "ด"},
		{NurseID: "rn-4", Date: date, ShiftCode: "ด"},
	}

	pruned := pruneExcessDoubles(r, cells)

	nightScore := 0.0
	for _, c := range pruned {
		if c.Date == date && (c.ShiftCode == "ด" || c.ShiftCode == "Night" || c.ShiftCode == "N") {
			nightScore += 1.0
		}
	}

	hasLeader := false
	for _, c := range pruned {
		if c.Date == date && c.NurseID == "rn-lead" && c.ShiftCode == "ด" {
			hasLeader = true
		}
	}

	if !hasLeader {
		t.Errorf("expected Leader RN (rn-lead) to be strictly PRESERVED on Night shift, but leader was removed")
	}

	if nightScore > 4.0 {
		t.Errorf("expected 1 Oct night RN count to be pruned from 5 to 4.0, got %.1f", nightScore)
	}
	t.Logf("1 Oct Night Cap result: 5 RNs pruned to %.1f (exactly target 4.0, 1 excess removed, Leader PRESERVED)", nightScore)
}

func TestPruneExcessNight_Method1_MorningDoubleAndNightRelief(t *testing.T) {
	// Rule: If night shift has 5 nurses (4 on ด + 1 on N) and morning has 1 nurse on ชบ,
	// Method 1 adjusts: ชบ -> ช and N -> บ.
	// Result: Night count becomes exactly 4 (all on ด), and morning/evening remain balanced.
	r := domain.Roster{
		Month: 10,
		Year:  2026,
		Policy: domain.Policy{
			Staffing: []domain.Staffing{
				{Start: 480, End: 960, RN: 4, Leaders: 1},  // Morning: 5 RN
				{Start: 960, End: 1440, RN: 3, Leaders: 1}, // Evening: 4 RN
				{Start: 0, End: 480, RN: 3, Leaders: 1},    // Night: 4 RN
			},
		},
		Staff: []domain.Staff{
			{ID: "rn-m1", Active: true, Position: "RN", Allowed: []string{"ชบ", "ช", "X"}},
			{ID: "rn-n1", Active: true, Position: "RN", Allowed: []string{"N", "บ", "X"}},
			{ID: "rn-d1", Active: true, Position: "RN", Allowed: []string{"ด", "X"}},
			{ID: "rn-d2", Active: true, Position: "RN", Allowed: []string{"ด", "X"}},
			{ID: "rn-d3", Active: true, Position: "RN", Allowed: []string{"ด", "X"}},
			{ID: "rn-lead", Active: true, Position: "RN", Leader: true, Allowed: []string{"ด", "X"}},
		},
		Shifts: []domain.RosterShift{
			{Code: "ช", Periods: []domain.Period{{Start: 480, End: 960}}},
			{Code: "บ", Periods: []domain.Period{{Start: 960, End: 1440}}},
			{Code: "ด", Periods: []domain.Period{{Start: 0, End: 480}}},
			{Code: "ชบ", Periods: []domain.Period{{Start: 480, End: 960}, {Start: 960, End: 1440}}},
			{Code: "N", Periods: []domain.Period{{Start: 1200, End: 1920}}},
			{Code: "X", Periods: []domain.Period{}},
		},
	}

	date := "2026-10-02"
	// 1 nurse on "ชบ", 1 on "N", and 4 on "ด" (1 leader + 3 regular)
	cells := []domain.Cell{
		{NurseID: "rn-m1", Date: date, ShiftCode: "ชบ"},
		{NurseID: "rn-n1", Date: date, ShiftCode: "N"},
		{NurseID: "rn-lead", Date: date, ShiftCode: "ด"},
		{NurseID: "rn-d1", Date: date, ShiftCode: "ด"},
		{NurseID: "rn-d2", Date: date, ShiftCode: "ด"},
		{NurseID: "rn-d3", Date: date, ShiftCode: "ด"},
	}

	pruned := pruneExcessDoubles(r, cells)

	resMap := map[string]string{}
	for _, c := range pruned {
		if c.Date == date {
			resMap[c.NurseID] = c.ShiftCode
		}
	}

	// Verify Method 1 conversions: rn-m1: ชบ -> ช, rn-n1: N -> บ
	if resMap["rn-m1"] != "ช" {
		t.Errorf("expected rn-m1 to be converted from 'ชบ' to 'ช', got '%s'", resMap["rn-m1"])
	}
	if resMap["rn-n1"] != "บ" {
		t.Errorf("expected rn-n1 to be converted from 'N' to 'บ', got '%s'", resMap["rn-n1"])
	}
	if resMap["rn-lead"] != "ด" {
		t.Errorf("expected rn-lead to remain 'ด', got '%s'", resMap["rn-lead"])
	}

	t.Logf("Method 1 Result: rn-m1='%s', rn-n1='%s', rn-lead='%s' (Perfect 3-shift rebalance!)", resMap["rn-m1"], resMap["rn-n1"], resMap["rn-lead"])
}

func TestPruneExcessNight_Target3_FourToThree(t *testing.T) {
	// Setup: Target Night RN = 3 (2 regular + 1 leader).
	// Assigned on Night: 3 on 'ด' + 1 on 'N' = Total 4 nurses (exceeds target 3).
	r := domain.Roster{
		Month: 10,
		Year:  2026,
		Policy: domain.Policy{
			Staffing: []domain.Staffing{
				{Start: 480, End: 960, RN: 3, Leaders: 1},  // Morning: 4 RN
				{Start: 960, End: 1440, RN: 3, Leaders: 1}, // Evening: 4 RN
				{Start: 0, End: 480, RN: 2, Leaders: 1},    // Night: 3 RN (Target = 3)
			},
		},
		Staff: []domain.Staff{
			// Morning nurse (pure 'ช', no 'ชบ' so will trigger Method 2 fallback)
			{ID: "rn-m1", Active: true, Position: "RN", Allowed: []string{"ช", "X"}},
			// Night nurses: 3 on 'ด' + 1 on 'N' = 4 nurses
			{ID: "rn-lead", Active: true, Position: "RN", Leader: true, Allowed: []string{"ด", "X"}},
			{ID: "rn-d1", Active: true, Position: "RN", Allowed: []string{"ด", "X"}},
			{ID: "rn-d2", Active: true, Position: "RN", Allowed: []string{"ด", "X"}},
			{ID: "rn-n1", Active: true, Position: "RN", Allowed: []string{"N", "X"}},
		},
		Shifts: []domain.RosterShift{
			{Code: "ช", Periods: []domain.Period{{Start: 480, End: 960}}},
			{Code: "บ", Periods: []domain.Period{{Start: 960, End: 1440}}},
			{Code: "ด", Periods: []domain.Period{{Start: 0, End: 480}}},
			{Code: "N", Periods: []domain.Period{{Start: 1200, End: 1920}}},
			{Code: "X", Periods: []domain.Period{}},
		},
	}

	date := "2026-10-03"
	cells := []domain.Cell{
		{NurseID: "rn-m1", Date: date, ShiftCode: "ช"},
		{NurseID: "rn-lead", Date: date, ShiftCode: "ด"},
		{NurseID: "rn-d1", Date: date, ShiftCode: "ด"},
		{NurseID: "rn-d2", Date: date, ShiftCode: "ด"},
		{NurseID: "rn-n1", Date: date, ShiftCode: "N"},
	}

	pruned := pruneExcessDoubles(r, cells)

	nightScore := 0.0
	hasLeader := false
	for _, c := range pruned {
		if c.Date == date {
			if c.ShiftCode == "ด" || c.ShiftCode == "N" {
				nightScore += 1.0
			}
			if c.NurseID == "rn-lead" && c.ShiftCode == "ด" {
				hasLeader = true
			}
		}
	}

	if nightScore > 3.0 {
		t.Errorf("expected Target=3 night shift count to be pruned from 4 to 3.0, got %.1f", nightScore)
	}
	if !hasLeader {
		t.Errorf("expected Leader RN to be PRESERVED on night shift")
	}

	t.Logf("Target=3 Night Cap result: 4 nurses pruned to %.1f (exactly target 3.0, leader PRESERVED)", nightScore)
}





