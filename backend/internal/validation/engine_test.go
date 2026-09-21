package validation_test

import (
	"encoding/json"
	"nurse-scheduler/backend/internal/domain"
	"nurse-scheduler/backend/internal/testfixture"
	"nurse-scheduler/backend/internal/validation"
	"testing"
)

func has(r domain.Report, code string) bool {
	for _, v := range r.Violations {
		if v.RuleCode == code {
			return true
		}
	}
	return false
}
func TestEveryRuleIndependently(t *testing.T) {
	cases := []struct {
		code  string
		setup func(*domain.Roster)
		old   []domain.Cell
	}{
		{"NO_OVERLAP", func(r *domain.Roster) {
			r.Assignments = []domain.Cell{testfixture.Cell("2026-09-09", "Night"), testfixture.Cell("2026-09-10", "ด")}
		}, nil},
		{"NO_LEAVE_OVERLAP", func(r *domain.Roster) {
			r.Assignments = []domain.Cell{testfixture.Cell("2026-09-09", "Night")}
			r.Leaves = []domain.Leave{{NurseID: "test-a", Start: "2026-09-10", End: "2026-09-10", Approved: true}}
		}, nil},
		{"STAFF_PERMISSION", func(r *domain.Roster) {
			r.Staff[0].Allowed = []string{}
			r.Assignments = []domain.Cell{testfixture.Cell("2026-09-09", "ช")}
		}, nil},
		{"LOCKED_PRESERVED", func(r *domain.Roster) { r.Assignments = []domain.Cell{testfixture.Cell("2026-09-09", "X")} }, []domain.Cell{{NurseID: "test-a", Date: "2026-09-09", ShiftCode: "ช", Locked: true}}},
		{"ONE_ASSIGNMENT_PER_DAY", func(r *domain.Roster) {
			r.Assignments = []domain.Cell{testfixture.Cell("2026-09-09", "ช"), testfixture.Cell("2026-09-09", "บ")}
		}, nil},
		{"DOUBLE_SHIFT_PERMISSION", func(r *domain.Roster) {
			r.Staff[0].Double = false
			r.Assignments = []domain.Cell{testfixture.Cell("2026-09-09", "ชบ")}
		}, nil},
		{"MIN_REST_HOURS", func(r *domain.Roster) {
			r.Assignments = []domain.Cell{testfixture.Cell("2026-09-09", "ด"), testfixture.Cell("2026-09-10", "ช")}
		}, nil},
		{"MAX_CONSECUTIVE_DAYS", func(r *domain.Roster) {
			r.Policy.MaxConsecutiveDays = 1
			r.Assignments = []domain.Cell{testfixture.Cell("2026-09-09", "ช"), testfixture.Cell("2026-09-10", "ช")}
		}, nil},
		{"MAX_CONSECUTIVE_NIGHTS", func(r *domain.Roster) {
			r.Policy.MaxConsecutiveNights = 1
			r.Assignments = []domain.Cell{testfixture.Cell("2026-09-09", "Night"), testfixture.Cell("2026-09-10", "Night")}
		}, nil},
		{"MAX_MONTHLY_HOURS", func(r *domain.Roster) {
			r.Policy.MaxMonthlyHours = 7
			r.Assignments = []domain.Cell{testfixture.Cell("2026-09-09", "ช")}
		}, nil},
		{"MAX_CONTINUOUS_HOURS", func(r *domain.Roster) {
			r.Policy.MaxContinuousHours = 12
			r.Assignments = []domain.Cell{testfixture.Cell("2026-09-09", "ชบ")}
		}, nil},
		{"MAX_DOUBLE_SHIFTS", func(r *domain.Roster) {
			r.Policy.MaxDoubleShifts = 0
			r.Assignments = []domain.Cell{testfixture.Cell("2026-09-09", "บด")}
		}, nil},
		{"MIN_STAFFING", func(r *domain.Roster) {
			r.Policy.Staffing = []domain.Staffing{{Date: "2026-09-09", Start: 480, End: 960, RN: 1, PN: 1, Leaders: 1, Skills: map[string]int{"icu": 1}}}
			r.Assignments = []domain.Cell{testfixture.Cell("2026-09-09", "ช")}
		}, nil},
		{"TARGET_HOURS", func(r *domain.Roster) { r.Policy.Targets = []domain.Target{{NurseID: "test-a", Hours: 160}} }, nil},
		{"TARGET_OFF", func(r *domain.Roster) { r.Policy.Targets = []domain.Target{{NurseID: "test-a", Off: 8}} }, nil},
		{"PREFERENCE", func(r *domain.Roster) {
			r.Policy.Preferences = []domain.Preference{{NurseID: "test-a", Date: "2026-09-09", ShiftCode: "X"}}
		}, nil},
		{"FAIRNESS", func(r *domain.Roster) {
			r.Policy.FairnessHours = 0
			r.Assignments = []domain.Cell{testfixture.Cell("2026-09-09", "ช")}
		}, nil},
		{"SHIFT_QUOTA", func(r *domain.Roster) {
			r.Policy.Targets = []domain.Target{{NurseID: "test-a", Quotas: map[string]int{"ช": 2}}}
		}, nil},
		{"OVER_STAFFING", func(r *domain.Roster) {
			r.Policy.Staffing = []domain.Staffing{{Date: "2026-09-09", Start: 480, End: 960, RN: 1, PN: 0}}
			r.Assignments = []domain.Cell{
				{ID: 1, NurseID: "test-a", Date: "2026-09-09", ShiftCode: "ช", Version: 1},
				{ID: 2, NurseID: "test-b", Date: "2026-09-09", ShiftCode: "ช", Version: 1},
			}
		}, nil},
	}
	for _, tc := range cases {
		t.Run(tc.code, func(t *testing.T) {
			r := testfixture.Roster()
			tc.setup(&r)
			report := validation.Validate(r, tc.old)
			if !has(report, tc.code) {
				t.Fatalf("missing %s: %+v", tc.code, report)
			}
			first, _ := json.Marshal(report)
			second, _ := json.Marshal(validation.Validate(r, tc.old))
			if string(first) != string(second) {
				t.Fatal("non deterministic")
			}
			soft := tc.code == "TARGET_HOURS" || tc.code == "TARGET_OFF" || tc.code == "PREFERENCE" || tc.code == "FAIRNESS" || tc.code == "SHIFT_QUOTA" || tc.code == "OVER_STAFFING"
			for _, v := range report.Violations {
				if v.RuleCode == tc.code && ((v.Severity == "warning") != soft) {
					t.Fatal("wrong severity")
				}
			}
		})
	}
}
func TestTimeBoundaries(t *testing.T) {
	for _, tc := range []struct {
		name                     string
		cells, boundary          []domain.Cell
		rest, continuous         float64
		badRest, badContinuous   bool
		hours, carryIn, carryOut float64
	}{
		{"combined16", []domain.Cell{testfixture.Cell("2026-09-09", "ชบ")}, nil, 8, 16, false, false, 16, 0, 0},
		{"split16", []domain.Cell{testfixture.Cell("2026-09-09", "บด")}, nil, 8, 12, false, false, 16, 0, 0},
		{"restExactly8", []domain.Cell{testfixture.Cell("2026-09-09", "บ"), testfixture.Cell("2026-09-10", "ช")}, nil, 8, 16, false, false, 16, 0, 0},
		{"restBelow9", []domain.Cell{testfixture.Cell("2026-09-09", "บ"), testfixture.Cell("2026-09-10", "ช")}, nil, 9, 16, true, false, 16, 0, 0},
		{"midnightZero", []domain.Cell{testfixture.Cell("2026-09-09", "บ"), testfixture.Cell("2026-09-10", "ด")}, nil, 8, 12, false, true, 16, 0, 0},
		{"crossMonth", []domain.Cell{testfixture.Cell("2026-09-01", "ช")}, []domain.Cell{testfixture.Cell("2026-08-31", "Night")}, 8, 24, true, false, 16, 8, 0},
		{"carryOut", []domain.Cell{testfixture.Cell("2026-09-30", "Night")}, nil, 8, 16, false, false, 4, 0, 8},
		{"offWithCarry", []domain.Cell{testfixture.Cell("2026-09-01", "X")}, []domain.Cell{testfixture.Cell("2026-08-31", "Night")}, 8, 16, false, false, 8, 8, 0},
	} {
		t.Run(tc.name, func(t *testing.T) {
			r := testfixture.Roster()
			r.Assignments = tc.cells
			r.Boundary = tc.boundary
			r.Policy.MinRestHours = tc.rest
			r.Policy.MaxContinuousHours = tc.continuous
			got := validation.Validate(r, nil)
			if has(got, "MIN_REST_HOURS") != tc.badRest || has(got, "MAX_CONTINUOUS_HOURS") != tc.badContinuous {
				t.Fatalf("unexpected rules %+v", got.Violations)
			}
			h := got.Hours[0]
			if h.Monthly != tc.hours || h.CarryIn != tc.carryIn || h.CarryOut != tc.carryOut {
				t.Fatalf("hours %+v", h)
			}
		})
	}
}
func TestNightNotCountedTwice(t *testing.T) {
	r := testfixture.Roster()
	r.Assignments = []domain.Cell{testfixture.Cell("2026-09-09", "Night"), testfixture.Cell("2026-09-10", "ด")}
	h := validation.Validate(r, nil).Hours[0]
	if h.Nights != 1 || h.Night != 8 {
		t.Fatalf("%+v", h)
	}
}
func TestConsecutiveIncludesPreviousMonthAndDoubleCountsOneDay(t *testing.T) {
	r := testfixture.Roster()
	r.Policy.MaxConsecutiveDays = 1
	r.Boundary = []domain.Cell{testfixture.Cell("2026-08-31", "ช")}
	r.Assignments = []domain.Cell{testfixture.Cell("2026-09-01", "บด")}
	if !has(validation.Validate(r, nil), "MAX_CONSECUTIVE_DAYS") {
		t.Fatal("boundary missing")
	}
	r.Boundary = nil
	if has(validation.Validate(r, nil), "MAX_CONSECUTIVE_DAYS") {
		t.Fatal("double counted")
	}
}
func TestStaffingEverySegment(t *testing.T) {
	r := testfixture.Roster()
	r.Policy.Staffing = []domain.Staffing{{Date: "2026-09-09", Start: 480, End: 1200, RN: 0, Leaders: 1, Skills: map[string]int{"icu": 1}}}
	r.Assignments = []domain.Cell{testfixture.Cell("2026-09-09", "ช")}
	if !has(validation.Validate(r, nil), "MIN_STAFFING") {
		t.Fatal("last four hours uncovered")
	}
	r.Assignments[0].ShiftCode = "Day"
	if has(validation.Validate(r, nil), "MIN_STAFFING") {
		t.Fatal("fully covered")
	}
}
func TestMonthLengths(t *testing.T) {
	for _, x := range []struct{ year, month, days int }{{2027, 2, 28}, {2028, 2, 29}, {2026, 9, 30}, {2026, 10, 31}} {
		r := testfixture.Roster()
		r.Year = x.year
		r.Month = x.month
		r.Policy.Staffing = []domain.Staffing{{Start: 480, End: 960, RN: 1}}
		out := validation.Validate(r, nil)
		n := 0
		for _, v := range out.Violations {
			if v.RuleCode == "MIN_STAFFING" {
				n++
			}
		}
		if n != x.days {
			t.Fatalf("%+v got %d", x, n)
		}
	}
}
func TestCarryOutChecksNextMonthCeiling(t *testing.T) {
	r := testfixture.Roster()
	r.Policy.MaxMonthlyHours = 12
	r.Assignments = []domain.Cell{testfixture.Cell("2026-09-30", "Night")}
	r.Boundary = []domain.Cell{testfixture.Cell("2026-10-20", "ช")}
	if !has(validation.Validate(r, nil), "MAX_MONTHLY_HOURS") {
		t.Fatal("next month's hours must include carry-in")
	}
}
func TestSplitRestAndSameDayNightMorning(t *testing.T) {
	r := testfixture.Roster()
	r.Policy.MinRestHours = 9
	r.Assignments = []domain.Cell{testfixture.Cell("2026-09-09", "บด")}
	if !has(validation.Validate(r, nil), "MIN_REST_HOURS") {
		t.Fatal("split shift rest must be checked")
	}
	r.Policy.MinRestHours = 8
	r.Assignments = []domain.Cell{testfixture.Cell("2026-09-09", "ด"), testfixture.Cell("2026-09-09", "ช")}
	if !has(validation.Validate(r, nil), "MIN_REST_HOURS") {
		t.Fatal("night to morning has zero rest")
	}
}
func TestLockedShiftCannotOverlapApprovedLeave(t *testing.T) {
	r := testfixture.Roster()
	c := testfixture.Cell("2026-09-09", "Night")
	c.Locked = true
	r.Assignments = []domain.Cell{c}
	r.Leaves = []domain.Leave{{NurseID: "test-a", Start: "2026-09-10", End: "2026-09-10", Approved: true}}
	if !has(validation.Validate(r, r.Assignments), "NO_LEAVE_OVERLAP") {
		t.Fatal("lock must not bypass leave")
	}
	r.Leaves[0].Approved = false
	got := validation.Validate(r, r.Assignments)
	if has(got, "NO_LEAVE_OVERLAP") || !has(got, "PREFERENCE") {
		t.Fatal("pending leave is soft")
	}
}

func TestRNAndPNSegregation(t *testing.T) {
	r := testfixture.Roster()
	// test-a is RN, test-b is PN
	// Policy requires RN: 1, PN: 1
	r.Policy.Staffing = []domain.Staffing{{Date: "2026-09-09", Start: 480, End: 960, RN: 1, PN: 1, Leaders: 0}}
	// Add another RN
	r.Staff = append(r.Staff, domain.Staff{ID: "test-c", Name: "RN Extra", Position: "RN", Active: true, Allowed: []string{"ช"}})

	// 2 RNs assigned, 0 PN assigned. Total = 2.
	// Since RN excess cannot cover PN, MIN_STAFFING must still trigger!
	r.Assignments = []domain.Cell{
		{NurseID: "test-a", Date: "2026-09-09", ShiftCode: "ช"},
		{NurseID: "test-c", Date: "2026-09-09", ShiftCode: "ช"},
	}
	got := validation.Validate(r, nil)
	if !has(got, "MIN_STAFFING") {
		t.Fatal("excess RN must not satisfy PN requirement")
	}

	// Now assign PN correctly (1 RN + 1 PN)
	r.Assignments = []domain.Cell{
		{NurseID: "test-a", Date: "2026-09-09", ShiftCode: "ช"},
		{NurseID: "test-b", Date: "2026-09-09", ShiftCode: "ช"},
	}
	got2 := validation.Validate(r, nil)
	if has(got2, "MIN_STAFFING") {
		t.Fatalf("1 RN and 1 PN should satisfy staffing requirement, got violations: %+v", got2.Violations)
	}
}

func TestBannedShiftTransitions(t *testing.T) {
	r := testfixture.Roster()
	// Test 1: Evening followed by Night (บ -> ด) is ALLOWED
	r.Assignments = []domain.Cell{
		testfixture.Cell("2026-09-09", "บ"),
		testfixture.Cell("2026-09-10", "ด"),
	}
	got1 := validation.Validate(r, nil)
	if has(got1, "MIN_REST_HOURS") {
		t.Fatal("บ followed by ด should be allowed, but triggered MIN_REST_HOURS")
	}

	// Test 2: Night followed by Evening (ด -> บ)
	r.Assignments = []domain.Cell{
		testfixture.Cell("2026-09-09", "ด"),
		testfixture.Cell("2026-09-10", "บ"),
	}
	got2 := validation.Validate(r, nil)
	if !has(got2, "MIN_REST_HOURS") {
		t.Fatal("ด followed by บ must trigger MIN_REST_HOURS error")
	}

	// Test 3: Night followed by Morning (ด -> ช)
	r.Assignments = []domain.Cell{
		testfixture.Cell("2026-09-09", "ด"),
		testfixture.Cell("2026-09-10", "ช"),
	}
	got3 := validation.Validate(r, nil)
	if !has(got3, "MIN_REST_HOURS") {
		t.Fatal("ด followed by ช must trigger MIN_REST_HOURS error")
	}
}

func TestMaxConsecutiveOffDays(t *testing.T) {
	r := testfixture.Roster()
	r.Policy.MaxConsecutiveOffDays = 2

	// Case 1: 3 consecutive regular OFF days (X, X, X) without leave -> triggers MAX_CONSECUTIVE_OFF
	r.Assignments = []domain.Cell{
		testfixture.Cell("2026-09-01", "X"),
		testfixture.Cell("2026-09-02", "X"),
		testfixture.Cell("2026-09-03", "X"),
	}
	r.Leaves = []domain.Leave{}
	got1 := validation.Validate(r, nil)
	if !has(got1, "MAX_CONSECUTIVE_OFF") {
		t.Fatal("3 consecutive regular X days should trigger MAX_CONSECUTIVE_OFF")
	}

	// Case 2: 3 consecutive OFF days, but user has an approved leave request on these dates -> EXEMPTED (no violation)
	r.Leaves = []domain.Leave{
		{NurseID: "test-a", Start: "2026-09-01", End: "2026-09-03", Approved: true},
	}
	got2 := validation.Validate(r, nil)
	if has(got2, "MAX_CONSECUTIVE_OFF") {
		t.Fatal("Approved leaves must be exempted from MAX_CONSECUTIVE_OFF constraint")
	}
}


