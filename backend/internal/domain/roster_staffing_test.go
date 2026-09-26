package domain

import "testing"

func TestStaffingForDateModesAndOverride(t *testing.T) {
	legacy := Policy{Staffing: []Staffing{{Start: 480, End: 960, RN: 2}}}
	if got := StaffingForDate(legacy, "2026-09-21"); len(got) != 1 || got[0].RN != 2 {
		t.Fatalf("legacy staffing = %+v", got)
	}

	weekly := Policy{
		StaffingMode: "weekly",
		WeeklyStaffing: []WeeklyStaffing{
			{Weekday: 1, Start: 480, End: 960, RN: 5, PN: 3, Leaders: 1},
			{Weekday: 2, Start: 480, End: 960, RN: 4, PN: 2, Leaders: 1},
		},
		Staffing: []Staffing{{Date: "2026-09-21", Start: 480, End: 960, RN: 6, PN: 2, Leaders: 1}},
	}
	monday := StaffingForDate(weekly, "2026-09-21")
	if len(monday) != 1 || monday[0].RN != 6 || monday[0].PN != 2 {
		t.Fatalf("Monday override = %+v", monday)
	}
	tuesday := StaffingForDate(weekly, "2026-09-22")
	if len(tuesday) != 1 || tuesday[0].RN != 4 || tuesday[0].PN != 2 {
		t.Fatalf("Tuesday staffing = %+v", tuesday)
	}
}
