package service

import (
	"context"
	"fmt"
	"nurse-scheduler/backend/internal/domain"
	"nurse-scheduler/backend/internal/validation"
	"strings"
	"time"
)

var thaiDays = []string{"อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."}

// Summary calculates the complete shared ScheduleSummary for a given schedule ID.
func (s *RosterService) Summary(ctx context.Context, id int64, a domain.Actor) (domain.ScheduleSummary, error) {
	roster, err := s.Get(ctx, id, a)
	if err != nil {
		return domain.ScheduleSummary{}, err
	}
	overrides, _ := s.Store.ListPayrollOverrides(ctx, id)
	return ComputeSummaryWithOverrides(roster, overrides), nil
}

// ComputeSummary builds the ScheduleSummary from a domain.Roster instance without overrides.
func ComputeSummary(r domain.Roster) domain.ScheduleSummary {
	return ComputeSummaryWithOverrides(r, nil)
}

// ComputeSummaryWithOverrides builds the ScheduleSummary incorporating manual payroll overrides.
func ComputeSummaryWithOverrides(r domain.Roster, overrides []domain.PayrollOverride) domain.ScheduleSummary {
	report := validation.Validate(r, r.Assignments)

	loc, err := time.LoadLocation(r.Timezone)
	if err != nil {
		loc = time.UTC
	}

	daysInMonth := time.Date(r.Year, time.Month(r.Month)+1, 0, 0, 0, 0, 0, loc).Day()

	// Build shift lookup
	shiftMap := map[string]domain.RosterShift{}
	for _, sh := range r.Shifts {
		shiftMap[sh.Code] = sh
	}

	// Build hours lookup from report
	hoursMap := map[string]domain.Hours{}
	for _, h := range report.Hours {
		hoursMap[h.NurseID] = h
	}

	// Build target lookup from policy
	targetMap := map[string]domain.Target{}
	for _, t := range r.Policy.Targets {
		targetMap[t.NurseID] = t
	}

	// Map assignments by nurse and date
	nurseAssignments := map[string]map[string]domain.Cell{}
	dateAssignments := map[string][]domain.Cell{}
	for _, c := range r.Assignments {
		if nurseAssignments[c.NurseID] == nil {
			nurseAssignments[c.NurseID] = map[string]domain.Cell{}
		}
		nurseAssignments[c.NurseID][c.Date] = c
		dateAssignments[c.Date] = append(dateAssignments[c.Date], c)
	}

	// Default compensation settings
	workingDays := r.Policy.Compensation.WorkingDays
	if workingDays <= 0 {
		// Calculate weekdays in month as baseline
		wCount := 0
		for d := 1; d <= daysInMonth; d++ {
			t := time.Date(r.Year, time.Month(r.Month), d, 0, 0, 0, 0, loc)
			if t.Weekday() != time.Saturday && t.Weekday() != time.Sunday {
				wCount++
			}
		}
		workingDays = wCount
		if workingDays == 0 {
			workingDays = 22
		}
	}

	hasCompConfig := r.Policy.Compensation.WorkingDays > 0 || r.Policy.Compensation.RNEveNightRate > 0 || r.Policy.Compensation.RNOTRate > 0 || r.Policy.Compensation.PNEveNightRate > 0 || r.Policy.Compensation.PNOTRate > 0
	rnEveRate := 240.0
	pnEveRate := 180.0
	rnOtHourlyRate := 100.0
	pnOtHourlyRate := 75.0

	if hasCompConfig {
		rnEveRate = r.Policy.Compensation.RNEveNightRate
		pnEveRate = r.Policy.Compensation.PNEveNightRate
		rnOtHourlyRate = getHourlyOTRate(r.Policy.Compensation.RNOTRate, 0)
		pnOtHourlyRate = getHourlyOTRate(r.Policy.Compensation.PNOTRate, 0)
	}

	// 1. Calculate Nurse Stats
	nurseStats := make([]domain.NurseMonthStat, 0, len(r.Staff))
	var totalPlannedHours, totalNightHours float64
	var totalWorkShifts, totalDoubleShifts int
	var totalEveNightPay, totalOTPay, grandTotalPay float64
	activeCount := 0

	baselineHours := float64(workingDays * 8)

	allowanceCap := r.Policy.Compensation.AllowanceCap

	overrideMap := map[string][]domain.PayrollOverride{}
	for _, o := range overrides {
		overrideMap[o.NurseID] = append(overrideMap[o.NurseID], o)
	}

	for _, nurse := range r.Staff {
		if nurse.Active {
			activeCount++
		}

		h := hoursMap[nurse.ID]
		shiftCounts := map[string]int{}
		offDays := 0
		leaveDays := 0
		workDays := 0
		doubles := 0
		calculatedEveNightShifts := 0.0

		cells := nurseAssignments[nurse.ID]
		for _, c := range cells {
			if c.ShiftCode == "" {
				continue
			}
			shiftCounts[c.ShiftCode]++
			if c.ShiftCode == "X" || c.ShiftCode == "x" || c.ShiftCode == "อ" {
				offDays++
			} else if c.ShiftCode == "L" || c.ShiftCode == "Va" || c.ShiftCode == "V" || c.ShiftCode == "v" {
				leaveDays++
			} else {
				workDays++
				totalWorkShifts++
				if sh, ok := shiftMap[c.ShiftCode]; ok && sh.Double {
					doubles++
					totalDoubleShifts++
				}

				// Count Eve / Night allowance units
				code := c.ShiftCode
				if code == "บ" || code == "ด" {
					calculatedEveNightShifts += 1.0
				} else if code == "D" || code == "Day" {
					// 12-hour Day shift (08:00-20:00) crosses 16:00-20:00 (4 hrs = 0.5 afternoon unit)
					calculatedEveNightShifts += 0.5
				} else if code == "N" || code == "Night" {
					// 12-hour Night shift (20:00-08:00) crosses afternoon (4 hrs) + night (8 hrs) = 1.5 units
					calculatedEveNightShifts += 1.5
				} else if code == "ชบ" {
					calculatedEveNightShifts += 1.0
				} else if code == "บด" {
					calculatedEveNightShifts += 2.0
				} else if code == "ชด" {
					calculatedEveNightShifts += 1.0
				}
			}
		}

		actualWorkHours := h.Monthly
		leaveCreditHours := float64(leaveDays) * 8.0
		creditHours := actualWorkHours + leaveCreditHours

		targetHours := baselineHours
		if nurse.StartDate != "" || nurse.EndDate != "" {
			// Prorate standard working days within active date window
			proratedWorkingDays := 0
			daysInMonth := time.Date(r.Year, time.Month(r.Month)+1, 0, 0, 0, 0, 0, time.UTC).Day()
			for d := 1; d <= daysInMonth; d++ {
				dateStr := fmt.Sprintf("%04d-%02d-%02d", r.Year, r.Month, d)
				if (nurse.StartDate == "" || dateStr >= nurse.StartDate) && (nurse.EndDate == "" || dateStr <= nurse.EndDate) {
					tDate := time.Date(r.Year, time.Month(r.Month), d, 0, 0, 0, 0, time.UTC)
					if tDate.Weekday() != time.Saturday && tDate.Weekday() != time.Sunday {
						proratedWorkingDays++
					}
				}
			}
			if proratedWorkingDays > 0 {
				targetHours = float64(proratedWorkingDays * 8)
			}
		}

		varianceHours := creditHours - targetHours
		otHours := 0.0
		shortageHours := 0.0
		if varianceHours > 0 {
			otHours = varianceHours
		} else if varianceHours < 0 {
			shortageHours = -varianceHours
		}
		otShifts := otHours / 8.0

		// Handle Allowance Cap
		payableEveNightShifts := calculatedEveNightShifts
		excessEveNightShifts := 0.0
		if allowanceCap > 0 {
			if calculatedEveNightShifts > allowanceCap {
				payableEveNightShifts = allowanceCap
				excessEveNightShifts = calculatedEveNightShifts - allowanceCap
			} else {
				payableEveNightShifts = calculatedEveNightShifts
				excessEveNightShifts = 0.0
			}
		}

		// Role-based rates
		posUpper := strings.ToUpper(nurse.Position)
		isPN := posUpper == "PN" || strings.Contains(posUpper, "PN") || strings.Contains(nurse.Position, "ผู้ช่วย") || strings.Contains(posUpper, "PRACTICAL")
		eveRate := rnEveRate
		otHourlyRate := rnOtHourlyRate
		if isPN {
			eveRate = pnEveRate
			otHourlyRate = pnOtHourlyRate
		}

		eveNightPay := payableEveNightShifts * eveRate
		otPay := otHours * otHourlyRate
		totalPay := eveNightPay + otPay

		// Apply manual payroll overrides if present
		nurseOverrides := overrideMap[nurse.ID]
		hasOverride := len(nurseOverrides) > 0
		if hasOverride {
			for _, o := range nurseOverrides {
				switch o.FieldName {
				case "eve_night_shifts":
					payableEveNightShifts = o.OverrideValue
					eveNightPay = payableEveNightShifts * eveRate
					totalPay = eveNightPay + otPay
				case "ot_hours":
					otHours = o.OverrideValue
					otShifts = otHours / 8.0
					otPay = otHours * otHourlyRate
					totalPay = eveNightPay + otPay
				case "ot_shifts":
					otShifts = o.OverrideValue
					otHours = otShifts * 8.0
					otPay = otHours * otHourlyRate
					totalPay = eveNightPay + otPay
				case "eve_night_pay":
					eveNightPay = o.OverrideValue
					totalPay = eveNightPay + otPay
				case "ot_pay":
					otPay = o.OverrideValue
					totalPay = eveNightPay + otPay
				case "total_pay":
					totalPay = o.OverrideValue
				}
			}
		}

		totalEveNightPay += eveNightPay
		totalOTPay += otPay
		grandTotalPay += totalPay

		stat := domain.NurseMonthStat{
			NurseID:                  nurse.ID,
			NurseName:                nurse.Name,
			Position:                 nurse.Position,
			PlannedHours:             h.Monthly,
			ActualWorkHours:          actualWorkHours,
			LeaveCreditHours:         leaveCreditHours,
			CreditHours:              creditHours,
			TargetHours:              targetHours,
			VarianceHours:            varianceHours,
			ShortageHours:            shortageHours,
			OTHours:                  otHours,
			OffDays:                  offDays,
			LeaveDays:                leaveDays,
			WorkDays:                 workDays,
			DoubleShifts:             doubles,
			NightHours:               h.Night,
			NightShifts:              h.Nights,
			CarryInHours:             h.CarryIn,
			CarryOutHours:            h.CarryOut,
			ShiftCounts:              shiftCounts,
			CalculatedEveNightShifts: calculatedEveNightShifts,
			AllowanceCap:             allowanceCap,
			PayableEveNightShifts:    payableEveNightShifts,
			ExcessEveNightShifts:     excessEveNightShifts,
			EveNightShifts:           payableEveNightShifts,
			OTShifts:                 otShifts,
			EveNightPay:              eveNightPay,
			OTPay:                    otPay,
			TotalPay:                 totalPay,
			HasOverride:              hasOverride,
			Overrides:                nurseOverrides,
		}

		totalPlannedHours += actualWorkHours
		totalNightHours += h.Night
		nurseStats = append(nurseStats, stat)
	}

	// 2. Calculate Daily Staffing (4 standard intervals)
	standardIntervals := []struct {
		name     string
		startMin int
		endMin   int
	}{
		{"00:00-08:00", 0, 480},
		{"08:00-16:00", 480, 960},
		{"16:00-20:00", 960, 1200},
		{"20:00-24:00", 1200, 1440},
	}

	staffMap := map[string]domain.Staff{}
	for _, n := range r.Staff {
		staffMap[n.ID] = n
	}

	holidayMap := map[string]string{}
	for _, hol := range r.Holidays {
		holidayMap[hol.Date] = hol.Name
	}

	dailyStaffing := make([]domain.DailyStaffingStat, 0, daysInMonth)

	for dayIdx := 1; dayIdx <= daysInMonth; dayIdx++ {
		dateStr := fmt.Sprintf("%04d-%02d-%02d", r.Year, r.Month, dayIdx)
		t := time.Date(r.Year, time.Month(r.Month), dayIdx, 0, 0, 0, 0, loc)
		dayOfWeek := thaiDays[t.Weekday()]

		holName, isHol := holidayMap[dateStr]
		intervals := make([]domain.IntervalStaffing, 0, len(standardIntervals))

		prevDateStr := t.AddDate(0, 0, -1).Format("2006-01-02")
		// Find policy requirement for this date/intervals if specified
		for _, si := range standardIntervals {
			actualRN := 0
			actualPN := 0
			leaders := 0
			countedNurse := map[string]bool{}

			// 1. Check same-day shifts
			for _, c := range dateAssignments[dateStr] {
				if c.ShiftCode == "X" || c.ShiftCode == "x" || c.ShiftCode == "L" || c.ShiftCode == "V" || c.ShiftCode == "v" || c.ShiftCode == "Va" || c.ShiftCode == "" {
					continue
				}
				sh, ok := shiftMap[c.ShiftCode]
				if !ok {
					continue
				}
				nurse, nok := staffMap[c.NurseID]
				if !nok {
					continue
				}

				// Check if shift periods cover this interval
				covers := false
				for _, p := range sh.Periods {
					oStart := maxInt(p.Start, si.startMin)
					oEnd := minInt(p.End, si.endMin)
					if oEnd > oStart {
						covers = true
						break
					}
				}

				if covers && !countedNurse[nurse.ID] {
					countedNurse[nurse.ID] = true
					if nurse.Position == "RN" {
						actualRN++
					} else if nurse.Position == "PN" {
						actualPN++
					}
					if nurse.Leader {
						leaders++
					}
				}
			}

			// 2. Check carry-over shifts from yesterday (e.g. 12-hour Night shifts 20:00-08:00 ending at 1920)
			for _, c := range dateAssignments[prevDateStr] {
				if c.ShiftCode == "X" || c.ShiftCode == "x" || c.ShiftCode == "L" || c.ShiftCode == "V" || c.ShiftCode == "v" || c.ShiftCode == "Va" || c.ShiftCode == "" {
					continue
				}
				sh, ok := shiftMap[c.ShiftCode]
				if !ok {
					continue
				}
				nurse, nok := staffMap[c.NurseID]
				if !nok || countedNurse[nurse.ID] {
					continue
				}

				covers := false
				for _, p := range sh.Periods {
					if p.End > 1440 {
						yesterdayStartInToday := maxInt(0, p.Start-1440)
						yesterdayEndInToday := p.End - 1440
						oStart := maxInt(yesterdayStartInToday, si.startMin)
						oEnd := minInt(yesterdayEndInToday, si.endMin)
						if oEnd > oStart {
							covers = true
							break
						}
					}
				}

				if covers {
					countedNurse[nurse.ID] = true
					if nurse.Position == "RN" {
						actualRN++
					} else if nurse.Position == "PN" {
						actualPN++
					}
					if nurse.Leader {
						leaders++
					}
				}
			}

			// Required from policy staffing
			reqRN, reqPN, reqLeaders := findPolicyRequirement(domain.StaffingForDate(r.Policy, dateStr), dateStr, si.startMin, si.endMin)
			actualTotal := actualRN + actualPN
			reqTotal := reqRN + reqPN + reqLeaders

			deficit := 0
			if actualTotal < reqTotal {
				deficit = reqTotal - actualTotal
			}

			intervals = append(intervals, domain.IntervalStaffing{
				Interval:      si.name,
				StartMin:      si.startMin,
				EndMin:        si.endMin,
				ActualRN:      actualRN,
				ActualPN:      actualPN,
				ActualTotal:   actualTotal,
				RequiredRN:    reqRN + reqLeaders,
				RequiredPN:    reqPN,
				RequiredTotal: reqTotal,
				Deficit:       deficit,
				Leaders:       leaders,
			})
			_ = reqLeaders // reserved for future supervisor deficit check
		}

		dailyStaffing = append(dailyStaffing, domain.DailyStaffingStat{
			Date:        dateStr,
			DayOfWeek:   dayOfWeek,
			IsHoliday:   isHol,
			HolidayName: holName,
			Intervals:   intervals,
		})
	}

	// 3. Count violations
	hardViolations := 0
	softViolations := 0
	for _, v := range report.Violations {
		if v.Severity == "error" {
			hardViolations++
		} else {
			softViolations++
		}
	}

	totals := domain.ScheduleTotals{
		TotalStaff:        len(r.Staff),
		ActiveStaff:       activeCount,
		TotalAssignments:  len(r.Assignments),
		TotalWorkShifts:   totalWorkShifts,
		TotalPlannedHours: totalPlannedHours,
		TotalNightHours:   totalNightHours,
		TotalDoubleShifts: totalDoubleShifts,
		TotalEveNightPay:  totalEveNightPay,
		TotalOTPay:        totalOTPay,
		GrandTotalPay:     grandTotalPay,
		HardViolations:    hardViolations,
		SoftViolations:    softViolations,
	}

	return domain.ScheduleSummary{
		ScheduleID:      r.ID,
		WardID:          r.WardID,
		Month:           r.Month,
		Year:            r.Year,
		ScheduleVersion: r.Version,
		ScheduleStatus:  r.Status,
		Timezone:        r.Timezone,
		GeneratedAt:     time.Now().UTC(),
		NurseStats:      nurseStats,
		DailyStaffing:   dailyStaffing,
		Totals:          totals,
		Violations:      report.Violations,
	}
}

func findPolicyRequirement(staffing []domain.Staffing, dateStr string, startMin, endMin int) (rn, pn, leaders int) {
	// 1. Look for specific date match
	for _, s := range staffing {
		if s.Date == dateStr && ((s.Start <= startMin && s.End >= endMin) || (s.Start == startMin && s.End == endMin)) {
			return s.RN, s.PN, s.Leaders
		}
	}
	// 2. Look for default (date == "") match
	for _, s := range staffing {
		if s.Date == "" && ((s.Start <= startMin && s.End >= endMin) || (s.Start == startMin && s.End == endMin)) {
			return s.RN, s.PN, s.Leaders
		}
	}
	// 3. Fallback for 12h night shifts (20:00-08:00 => 1200-1920) covering 00:00-08:00
	if startMin == 0 && endMin <= 480 {
		for _, s := range staffing {
			if s.Date == dateStr && s.Start >= 1200 && s.End >= 1920 {
				return s.RN, s.PN, s.Leaders
			}
		}
		for _, s := range staffing {
			if s.Date == "" && s.Start >= 1200 && s.End >= 1920 {
				return s.RN, s.PN, s.Leaders
			}
		}
	}
	return 0, 0, 0
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// getHourlyOTRate parses OT rate, handling both hourly rate (e.g. 100 ฿/hr, 75 ฿/hr)
// and legacy 8-hour shift rate (e.g. 800 ฿/8h -> 100 ฿/hr, 600 ฿/8h -> 75 ฿/hr).
func getHourlyOTRate(rate float64, defaultHourly float64) float64 {
	if rate < 0 || (rate == 0 && defaultHourly > 0) {
		return defaultHourly
	}
	if rate > 250 {
		return rate / 8.0
	}
	return rate
}
