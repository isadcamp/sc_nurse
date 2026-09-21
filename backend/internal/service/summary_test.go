package service

import (
	"fmt"
	"nurse-scheduler/backend/internal/domain"
	"testing"
)

func pad2(n int) string {
	return fmt.Sprintf("%02d", n)
}

func TestComputeSummary_Compensation_RN_vs_PN(t *testing.T) {
	roster := domain.Roster{
		ID:       1,
		WardID:   "ward-1",
		Month:    9,
		Year:     2026,
		Timezone: "Asia/Bangkok",
		Staff: []domain.Staff{
			{ID: "rn-1", Name: "RN Somsri", Position: "RN", Active: true},
			{ID: "pn-1", Name: "PN Malee", Position: "PN", Active: true},
		},
		Shifts: []domain.RosterShift{
			{Code: "ช", Name: "เช้า", Periods: []domain.Period{{Start: 480, End: 960}}},
			{Code: "บ", Name: "บ่าย", Periods: []domain.Period{{Start: 960, End: 1440}}},
			{Code: "ด", Name: "ดึก", Periods: []domain.Period{{Start: 0, End: 480}}},
		},
		Policy: domain.Policy{
			MinRestHours:         8,
			MaxConsecutiveDays:   6,
			MaxConsecutiveNights: 3,
			MaxMonthlyHours:      300,
			MaxContinuousHours:   16,
			NightStart:           1200,
			NightEnd:             1920,
			Compensation: domain.CompensationConfig{
				WorkingDays:    22,  // Base = 22 * 8 = 176 hrs
				RNEveNightRate: 240, // RN บด 240
				PNEveNightRate: 180, // PN บด 180
				RNOTRate:       800, // RN OT 800
				PNOTRate:       600, // PN OT 600
			},
		},
		Assignments: []domain.Cell{},
	}

	// Assign RN 25 shifts (200 hours): 10 เช้า, 10 บ่าย, 5 ดึก on days 1..25
	// Total hours = 200. Target = 176. OT hours = 24. OT shifts = 3.
	// EveNight shifts = 10 (บ) + 5 (ด) = 15 shifts.
	day := 1
	for i := 1; i <= 10; i++ {
		roster.Assignments = append(roster.Assignments, domain.Cell{
			NurseID:   "rn-1",
			Date:      "2026-09-" + pad2(day),
			ShiftCode: "ช",
		})
		day++
	}
	for i := 1; i <= 10; i++ {
		roster.Assignments = append(roster.Assignments, domain.Cell{
			NurseID:   "rn-1",
			Date:      "2026-09-" + pad2(day),
			ShiftCode: "บ",
		})
		day++
	}
	for i := 1; i <= 5; i++ {
		roster.Assignments = append(roster.Assignments, domain.Cell{
			NurseID:   "rn-1",
			Date:      "2026-09-" + pad2(day),
			ShiftCode: "ด",
		})
		day++
	}

	// Assign PN 24 shifts (192 hours): 14 เช้า, 5 บ่าย, 5 ดึก on days 1..24
	// Total hours = 192. Target = 176. OT hours = 16. OT shifts = 2.
	// EveNight shifts = 5 (บ) + 5 (ด) = 10 shifts.
	day = 1
	for i := 1; i <= 14; i++ {
		roster.Assignments = append(roster.Assignments, domain.Cell{
			NurseID:   "pn-1",
			Date:      "2026-09-" + pad2(day),
			ShiftCode: "ช",
		})
		day++
	}
	for i := 1; i <= 5; i++ {
		roster.Assignments = append(roster.Assignments, domain.Cell{
			NurseID:   "pn-1",
			Date:      "2026-09-" + pad2(day),
			ShiftCode: "บ",
		})
		day++
	}
	for i := 1; i <= 5; i++ {
		roster.Assignments = append(roster.Assignments, domain.Cell{
			NurseID:   "pn-1",
			Date:      "2026-09-" + pad2(day),
			ShiftCode: "ด",
		})
		day++
	}

	summary := ComputeSummary(roster)

	if len(summary.NurseStats) != 2 {
		t.Fatalf("expected 2 nurse stats, got %d", len(summary.NurseStats))
	}

	var rnStat, pnStat domain.NurseMonthStat
	for _, ns := range summary.NurseStats {
		if ns.NurseID == "rn-1" {
			rnStat = ns
		} else if ns.NurseID == "pn-1" {
			pnStat = ns
		}
	}

	// Verify RN
	if rnStat.PlannedHours != 200 {
		t.Errorf("expected RN planned hours 200, got %f", rnStat.PlannedHours)
	}
	if rnStat.OTShifts != 3 {
		t.Errorf("expected RN OT shifts 3, got %f", rnStat.OTShifts)
	}
	if rnStat.EveNightShifts != 15 {
		t.Errorf("expected RN EveNight shifts 15, got %f", rnStat.EveNightShifts)
	}
	if rnStat.EveNightPay != 3600 {
		t.Errorf("expected RN EveNightPay 3600, got %f", rnStat.EveNightPay)
	}
	if rnStat.OTPay != 2400 {
		t.Errorf("expected RN OTPay 2400, got %f", rnStat.OTPay)
	}
	if rnStat.TotalPay != 6000 {
		t.Errorf("expected RN TotalPay 6000, got %f", rnStat.TotalPay)
	}

	// Verify PN
	if pnStat.PlannedHours != 192 {
		t.Errorf("expected PN planned hours 192, got %f", pnStat.PlannedHours)
	}
	if pnStat.OTShifts != 2 {
		t.Errorf("expected PN OT shifts 2, got %f", pnStat.OTShifts)
	}
	if pnStat.EveNightShifts != 10 {
		t.Errorf("expected PN EveNight shifts 10, got %f", pnStat.EveNightShifts)
	}
	if pnStat.EveNightPay != 1800 {
		t.Errorf("expected PN EveNightPay 1800, got %f", pnStat.EveNightPay)
	}
	if pnStat.OTPay != 1200 {
		t.Errorf("expected PN OTPay 1200, got %f", pnStat.OTPay)
	}
	if pnStat.TotalPay != 3000 {
		t.Errorf("expected PN TotalPay 3000, got %f", pnStat.TotalPay)
	}

	// Verify Grand Totals
	if summary.Totals.TotalEveNightPay != 5400 {
		t.Errorf("expected TotalEveNightPay 5400, got %f", summary.Totals.TotalEveNightPay)
	}
	if summary.Totals.TotalOTPay != 3600 {
		t.Errorf("expected TotalOTPay 3600, got %f", summary.Totals.TotalOTPay)
	}
	if summary.Totals.GrandTotalPay != 9000 {
		t.Errorf("expected GrandTotalPay 9000, got %f", summary.Totals.GrandTotalPay)
	}
}

func validBasePolicy(comp domain.CompensationConfig) domain.Policy {
	return domain.Policy{
		MinRestHours:         8,
		MaxConsecutiveDays:   6,
		MaxConsecutiveNights: 3,
		MaxMonthlyHours:      300,
		MaxContinuousHours:   16,
		NightStart:           1200,
		NightEnd:             1920,
		Compensation:         comp,
	}
}

func TestComputeSummary_LeaveCreditHours_And_HourSegregation(t *testing.T) {
	roster := domain.Roster{
		ID:       2,
		WardID:   "ward-icu",
		Month:    9,
		Year:     2026,
		Timezone: "Asia/Bangkok",
		Staff: []domain.Staff{
			{ID: "rn-exact", Name: "RN Exact (176h)", Position: "RN", Active: true},
			{ID: "rn-short", Name: "RN Short (160h)", Position: "RN", Active: true},
			{ID: "rn-leave", Name: "RN Leave (144h + 32h Va)", Position: "RN", Active: true},
		},
		Shifts: []domain.RosterShift{
			{Code: "ช", Name: "เช้า", Periods: []domain.Period{{Start: 480, End: 960}}},
			{Code: "Va", Name: "พักผ่อน", Periods: []domain.Period{}},
		},
		Policy: validBasePolicy(domain.CompensationConfig{
			WorkingDays:    22, // 176h target
			RNEveNightRate: 240,
			RNOTRate:       800,
		}),
		Assignments: []domain.Cell{},
	}

	// 1. RN Exact: 22 เช้า (176h)
	for d := 1; d <= 22; d++ {
		roster.Assignments = append(roster.Assignments, domain.Cell{
			NurseID:   "rn-exact",
			Date:      fmt.Sprintf("2026-09-%02d", d),
			ShiftCode: "ช",
		})
	}

	// 2. RN Short: 20 เช้า (160h)
	for d := 1; d <= 20; d++ {
		roster.Assignments = append(roster.Assignments, domain.Cell{
			NurseID:   "rn-short",
			Date:      fmt.Sprintf("2026-09-%02d", d),
			ShiftCode: "ช",
		})
	}

	// 3. RN Leave: 18 เช้า (144h) + 4 Va (32h credit)
	for d := 1; d <= 18; d++ {
		roster.Assignments = append(roster.Assignments, domain.Cell{
			NurseID:   "rn-leave",
			Date:      fmt.Sprintf("2026-09-%02d", d),
			ShiftCode: "ช",
		})
	}
	for d := 19; d <= 22; d++ {
		roster.Assignments = append(roster.Assignments, domain.Cell{
			NurseID:   "rn-leave",
			Date:      fmt.Sprintf("2026-09-%02d", d),
			ShiftCode: "Va",
		})
	}

	summary := ComputeSummary(roster)
	statsMap := map[string]domain.NurseMonthStat{}
	for _, s := range summary.NurseStats {
		statsMap[s.NurseID] = s
	}

	// Test Case 1: RN Exact
	exact := statsMap["rn-exact"]
	if exact.ActualWorkHours != 176 || exact.CreditHours != 176 || exact.OTHours != 0 || exact.ShortageHours != 0 {
		t.Errorf("RN Exact failed: work=%f, credit=%f, ot=%f, shortage=%f", exact.ActualWorkHours, exact.CreditHours, exact.OTHours, exact.ShortageHours)
	}

	// Test Case 3: RN Short
	short := statsMap["rn-short"]
	if short.ActualWorkHours != 160 || short.CreditHours != 160 || short.OTHours != 0 || short.ShortageHours != 16 {
		t.Errorf("RN Short failed: work=%f, credit=%f, ot=%f, shortage=%f", short.ActualWorkHours, short.CreditHours, short.OTHours, short.ShortageHours)
	}

	// Test Case 4: RN Leave (144h work + 32h credit = 176h)
	leave := statsMap["rn-leave"]
	if leave.ActualWorkHours != 144 || leave.LeaveCreditHours != 32 || leave.CreditHours != 176 || leave.OTHours != 0 || leave.ShortageHours != 0 {
		t.Errorf("RN Leave failed: work=%f, leaveCredit=%f, credit=%f, ot=%f, shortage=%f", leave.ActualWorkHours, leave.LeaveCreditHours, leave.CreditHours, leave.OTHours, leave.ShortageHours)
	}
}

func TestComputeSummary_12HourShifts_DayAndNight(t *testing.T) {
	roster := domain.Roster{
		ID:       3,
		WardID:   "ward-icu",
		Month:    9,
		Year:     2026,
		Timezone: "Asia/Bangkok",
		Staff: []domain.Staff{
			{ID: "rn-day", Name: "RN Day 12h", Position: "RN", Active: true},
			{ID: "rn-night", Name: "RN Night 12h", Position: "RN", Active: true},
		},
		Shifts: []domain.RosterShift{
			{Code: "D", Name: "Day 12h", Periods: []domain.Period{{Start: 480, End: 1200}}},   // 08:00-20:00 (12 hrs)
			{Code: "N", Name: "Night 12h", Periods: []domain.Period{{Start: 1200, End: 1920}}}, // 20:00-08:00 (12 hrs)
		},
		Policy: validBasePolicy(domain.CompensationConfig{
			WorkingDays:    22,
			RNEveNightRate: 240,
			RNOTRate:       800,
		}),
		Assignments: []domain.Cell{
			{NurseID: "rn-day", Date: "2026-09-01", ShiftCode: "D"},
			{NurseID: "rn-night", Date: "2026-09-01", ShiftCode: "N"},
		},
	}

	summary := ComputeSummary(roster)
	statsMap := map[string]domain.NurseMonthStat{}
	for _, s := range summary.NurseStats {
		statsMap[s.NurseID] = s
	}

	// Test Case 5: D (Day 12h) -> 12h work, 0.5 allowance unit -> 120 THB
	dayNurse := statsMap["rn-day"]
	if dayNurse.ActualWorkHours != 12 || dayNurse.CalculatedEveNightShifts != 0.5 || dayNurse.EveNightPay != 120 {
		t.Errorf("RN Day 12h failed: work=%f, units=%f, pay=%f (expected 12h, 0.5 unit, 120 THB)", dayNurse.ActualWorkHours, dayNurse.CalculatedEveNightShifts, dayNurse.EveNightPay)
	}

	// Test Case 6: N (Night 12h) -> 12h work, 1.5 allowance units -> 360 THB
	nightNurse := statsMap["rn-night"]
	if nightNurse.ActualWorkHours != 12 || nightNurse.CalculatedEveNightShifts != 1.5 || nightNurse.EveNightPay != 360 {
		t.Errorf("RN Night 12h failed: work=%f, units=%f, pay=%f (expected 12h, 1.5 units, 360 THB)", nightNurse.ActualWorkHours, nightNurse.CalculatedEveNightShifts, nightNurse.EveNightPay)
	}
}

func TestComputeSummary_AllowanceCap(t *testing.T) {
	roster := domain.Roster{
		ID:       4,
		WardID:   "ward-icu",
		Month:    9,
		Year:     2026,
		Timezone: "Asia/Bangkok",
		Staff: []domain.Staff{
			{ID: "rn-overcap", Name: "RN Overcap", Position: "RN", Active: true},
		},
		Shifts: []domain.RosterShift{
			{Code: "บ", Name: "บ่าย", Periods: []domain.Period{{Start: 960, End: 1440}}},
			{Code: "N", Name: "Night 12h", Periods: []domain.Period{{Start: 1200, End: 1920}}},
		},
		Policy: validBasePolicy(domain.CompensationConfig{
			WorkingDays:    22,
			AllowanceCap:   17,  // Max 17 days/units
			RNEveNightRate: 240, // 17 * 240 = 4,080 THB
			RNOTRate:       800,
		}),
		Assignments: []domain.Cell{},
	}

	// Assign: 10 บ่าย (10 * 1.0 = 10 units) + 7 Night 12h (7 * 1.5 = 10.5 units) + 1 บ่าย (1 unit) = 21.5 units
	for d := 1; d <= 10; d++ {
		roster.Assignments = append(roster.Assignments, domain.Cell{
			NurseID:   "rn-overcap",
			Date:      fmt.Sprintf("2026-09-%02d", d),
			ShiftCode: "บ",
		})
	}
	for d := 11; d <= 17; d++ {
		roster.Assignments = append(roster.Assignments, domain.Cell{
			NurseID:   "rn-overcap",
			Date:      fmt.Sprintf("2026-09-%02d", d),
			ShiftCode: "N",
		})
	}
	roster.Assignments = append(roster.Assignments, domain.Cell{
		NurseID:   "rn-overcap",
		Date:      "2026-09-18",
		ShiftCode: "บ",
	})

	summary := ComputeSummary(roster)
	stat := summary.NurseStats[0]

	// Calculated = 21.5 units, Cap = 17.0, Payable = 17.0, Excess = 4.5 units
	// EveNightPay = 17.0 * 240 = 4,080 THB
	if stat.CalculatedEveNightShifts != 21.5 {
		t.Errorf("expected calculated units 21.5, got %f", stat.CalculatedEveNightShifts)
	}
	if stat.PayableEveNightShifts != 17.0 {
		t.Errorf("expected payable units 17.0, got %f", stat.PayableEveNightShifts)
	}
	if stat.ExcessEveNightShifts != 4.5 {
		t.Errorf("expected excess units 4.5, got %f", stat.ExcessEveNightShifts)
	}
	if stat.EveNightPay != 4080 {
		t.Errorf("expected EveNightPay 4080, got %f", stat.EveNightPay)
	}
}

func TestComputeSummary_ProrateMidMonthStaff(t *testing.T) {
	// Scenario 8: RN starts mid-month on 2026-09-16
	// In Sep 2026 (30 days): Sep 16 to 30 has 11 weekdays (Mon-Fri) = 88 required hours
	// Nurse works 12 morning shifts = 96 hours
	// Expected: Required = 88h, Work = 96h, OT = 8h (1 shift OT = 800 THB), Shortage = 0h
	roster := domain.Roster{
		ID:       5,
		WardID:   "ward-icu",
		Month:    9,
		Year:     2026,
		Timezone: "Asia/Bangkok",
		Staff: []domain.Staff{
			{
				ID:        "rn-new",
				Name:      "RN New Joiner",
				Position:  "RN",
				Active:    true,
				StartDate: "2026-09-16",
			},
		},
		Shifts: []domain.RosterShift{
			{Code: "ช", Name: "เช้า", Periods: []domain.Period{{Start: 480, End: 960}}},
		},
		Policy: validBasePolicy(domain.CompensationConfig{
			WorkingDays:    22, // 22 * 8 = 176h standard full month
			RNEveNightRate: 240,
			RNOTRate:       800,
		}),
		Assignments: []domain.Cell{},
	}

	// 12 shifts from Sep 16 onwards (12 * 8 = 96 hrs)
	for d := 16; d <= 27; d++ {
		roster.Assignments = append(roster.Assignments, domain.Cell{
			NurseID:   "rn-new",
			Date:      fmt.Sprintf("2026-09-%02d", d),
			ShiftCode: "ช",
		})
	}

	summary := ComputeSummary(roster)
	stat := summary.NurseStats[0]

	if stat.ActualWorkHours != 96 {
		t.Errorf("expected ActualWorkHours 96, got %f", stat.ActualWorkHours)
	}
	if stat.OTHours != 8 {
		t.Errorf("expected OTHours 8, got %f", stat.OTHours)
	}
	if stat.OTShifts != 1.0 {
		t.Errorf("expected OTShifts 1.0, got %f", stat.OTShifts)
	}
	if stat.OTPay != 800 {
		t.Errorf("expected OTPay 800, got %f", stat.OTPay)
	}
	if stat.ShortageHours != 0 {
		t.Errorf("expected ShortageHours 0, got %f", stat.ShortageHours)
	}
}

func TestComputeSummary_CarryOverNightStaffing(t *testing.T) {
	roster := domain.Roster{
		ID:       6,
		WardID:   "ward-icu",
		Month:    9,
		Year:     2026,
		Timezone: "Asia/Bangkok",
		Staff: []domain.Staff{
			{ID: "rn-night-12h", Name: "RN 12h Night", Position: "RN", Active: true},
			{ID: "rn-night-8h", Name: "RN 8h Night", Position: "RN", Active: true},
			{ID: "pn-night-8h", Name: "PN 8h Night", Position: "PN", Active: true},
		},
		Shifts: []domain.RosterShift{
			{Code: "N", Name: "Night 12h", Periods: []domain.Period{{Start: 1200, End: 1920}}},
			{Code: "ด", Name: "ดึก 8h", Periods: []domain.Period{{Start: 0, End: 480}}},
		},
		Policy: domain.Policy{
			Staffing: []domain.Staffing{
				{Date: "", Start: 0, End: 480, RN: 2, PN: 1, Leaders: 0},
			},
		},
		Assignments: []domain.Cell{
			{NurseID: "rn-night-12h", Date: "2026-09-01", ShiftCode: "N"}, // 20:00 Sep 01 - 08:00 Sep 02
			{NurseID: "rn-night-8h", Date: "2026-09-02", ShiftCode: "ด"},   // 00:00 - 08:00 Sep 02
			{NurseID: "pn-night-8h", Date: "2026-09-02", ShiftCode: "ด"},   // 00:00 - 08:00 Sep 02
		},
	}

	summary := ComputeSummary(roster)
	// On Sep 02 (day index 2): interval 00:00-08:00 should have 2 RNs (1 from yesterday's 12h N + 1 from today's 8h ด) and 1 PN
	var day2Night *domain.IntervalStaffing
	for _, d := range summary.DailyStaffing {
		if d.Date == "2026-09-02" {
			for idx := range d.Intervals {
				if d.Intervals[idx].Interval == "00:00-08:00" {
					day2Night = &d.Intervals[idx]
					break
				}
			}
		}
	}

	if day2Night == nil {
		t.Fatalf("expected 00:00-08:00 interval on 2026-09-02")
	}
	if day2Night.ActualRN != 2 {
		t.Errorf("expected ActualRN=2 on 2026-09-02 (00:00-08:00), got %d", day2Night.ActualRN)
	}
	if day2Night.ActualPN != 1 {
		t.Errorf("expected ActualPN=1 on 2026-09-02 (00:00-08:00), got %d", day2Night.ActualPN)
	}
	if day2Night.ActualTotal != 3 {
		t.Errorf("expected ActualTotal=3 on 2026-09-02 (00:00-08:00), got %d", day2Night.ActualTotal)
	}
	if day2Night.Deficit != 0 {
		t.Errorf("expected Deficit=0 on 2026-09-02 (00:00-08:00), got %d", day2Night.Deficit)
	}
}

func TestComputeSummary_HourlyOTRate(t *testing.T) {
	roster := domain.Roster{
		ID:       2,
		WardID:   "ward-icu",
		Month:    9,
		Year:     2026,
		Timezone: "Asia/Bangkok",
		Staff: []domain.Staff{
			{ID: "rn-hourly", Name: "RN Hourly", Position: "RN", Active: true},
			{ID: "pn-hourly", Name: "PN Hourly", Position: "PN", Active: true},
		},
		Shifts: []domain.RosterShift{
			{Code: "ช", Name: "เช้า", Periods: []domain.Period{{Start: 480, End: 960}}},
			{Code: "บ", Name: "บ่าย", Periods: []domain.Period{{Start: 960, End: 1440}}},
		},
		Policy: domain.Policy{
			MinRestHours:         8,
			MaxConsecutiveDays:   6,
			MaxConsecutiveNights: 3,
			MaxMonthlyHours:      300,
			MaxContinuousHours:   16,
			NightStart:           1200,
			NightEnd:             1920,
			Compensation: domain.CompensationConfig{
				WorkingDays:    20,  // Base = 20 * 8 = 160 hrs
				RNEveNightRate: 240,
				PNEveNightRate: 180,
				RNOTRate:       120, // Explicit hourly rate: 120 ฿/hr
				PNOTRate:       80,  // Explicit hourly rate: 80 ฿/hr
			},
		},
		Assignments: []domain.Cell{},
	}

	// RN works 21 shifts (168 hours): 8 hours OT => 8 hrs * 120 ฿/hr = 960 ฿
	// Plus 5 evening shifts => 5 * 240 = 1,200 ฿ => Total = 2,160 ฿
	for i := 1; i <= 16; i++ {
		roster.Assignments = append(roster.Assignments, domain.Cell{
			NurseID:   "rn-hourly",
			Date:      fmt.Sprintf("2026-09-%02d", i),
			ShiftCode: "ช",
		})
	}
	for i := 17; i <= 21; i++ {
		roster.Assignments = append(roster.Assignments, domain.Cell{
			NurseID:   "rn-hourly",
			Date:      fmt.Sprintf("2026-09-%02d", i),
			ShiftCode: "บ",
		})
	}

	// PN works 22 shifts (176 hours): 16 hours OT => 16 hrs * 80 ฿/hr = 1,280 ฿
	// Plus 2 evening shifts => 2 * 180 = 360 ฿ => Total = 1,640 ฿
	for i := 1; i <= 20; i++ {
		roster.Assignments = append(roster.Assignments, domain.Cell{
			NurseID:   "pn-hourly",
			Date:      fmt.Sprintf("2026-09-%02d", i),
			ShiftCode: "ช",
		})
	}
	for i := 21; i <= 22; i++ {
		roster.Assignments = append(roster.Assignments, domain.Cell{
			NurseID:   "pn-hourly",
			Date:      fmt.Sprintf("2026-09-%02d", i),
			ShiftCode: "บ",
		})
	}

	summary := ComputeSummary(roster)
	var rnStat, pnStat domain.NurseMonthStat
	for _, ns := range summary.NurseStats {
		if ns.NurseID == "rn-hourly" {
			rnStat = ns
		} else if ns.NurseID == "pn-hourly" {
			pnStat = ns
		}
	}

	if rnStat.OTHours != 8 {
		t.Errorf("expected RN OTHours=8, got %f", rnStat.OTHours)
	}
	if rnStat.OTPay != 960 {
		t.Errorf("expected RN OTPay=960 (8h * 120 ฿/hr), got %f", rnStat.OTPay)
	}
	if rnStat.TotalPay != 2160 {
		t.Errorf("expected RN TotalPay=2160, got %f", rnStat.TotalPay)
	}

	if pnStat.OTHours != 16 {
		t.Errorf("expected PN OTHours=16, got %f", pnStat.OTHours)
	}
	if pnStat.OTPay != 1280 {
		t.Errorf("expected PN OTPay=1280 (16h * 80 ฿/hr), got %f", pnStat.OTPay)
	}
	if pnStat.TotalPay != 1640 {
		t.Errorf("expected PN TotalPay=1640, got %f", pnStat.TotalPay)
	}
}


