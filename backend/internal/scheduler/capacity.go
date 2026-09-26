package scheduler

import (
	"fmt"
	"math"
	"nurse-scheduler/backend/internal/domain"
	"sort"
)

// Resolve date overrides per interval, matching validation.Validate.
func staffingForDate(r domain.Roster, date string) []domain.Staffing {
	return domain.StaffingForDate(r.Policy, date)
}

func usableShift(r domain.Roster, n domain.Staff, sh domain.RosterShift) bool {
	if sh.Code == "บด" || sh.Code == "X" || sh.Code == "L" {
		return false
	}
	allowed := false
	for _, code := range n.Allowed {
		if code == sh.Code {
			allowed = true
		}
	}
	if !allowed || (sh.Double && (!n.Double || r.Policy.MaxDoubleShifts == 0)) {
		return false
	}
	periods := append([]domain.Period(nil), sh.Periods...)
	sort.Slice(periods, func(i, j int) bool { return periods[i].Start < periods[j].Start })
	start, end := -1, -1
	for _, p := range periods {
		if p.Start > end {
			start = p.Start
		}
		end = p.End
		if float64(end-start)/60 > r.Policy.MaxContinuousHours {
			return false
		}
	}
	return len(periods) > 0
}

// capacityWarnings performs a multi-dimensional workforce feasibility evaluation:
// checking date-by-date approved leaves, shift permissions, skills, leader status,
// allowed double shifts, and joint monthly hour bounds.
func capacityWarnings(r domain.Roster) []domain.ReadinessIssue {
	out := []domain.ReadinessIssue{}
	a, b := monthRange(r)
	days := int(b.Sub(a).Hours() / 24)

	// Map of shifts by code
	shiftMap := map[string]domain.RosterShift{}
	for _, sh := range r.Shifts {
		shiftMap[sh.Code] = sh
	}

	// 1. Daily & Shift-Level Feasibility Check
	for d := a; d.Before(b); d = d.AddDate(0, 0, 1) {
		ds := d.Format("2006-01-02")
		dailyStaffing := staffingForDate(r, ds)
		if len(dailyStaffing) == 0 {
			continue
		}

		// Available staff on this date (not on approved leave, not locked OFF)
		availRN, availPN, availLeaders := 0, 0, 0
		doubleEligibleRN, doubleEligiblePN := 0, 0
		skillsMap := map[string]int{}
		allowedShiftCount := map[string]int{}

		for _, n := range r.Staff {
			if !n.Active {
				continue
			}
			if approvedLeave(r, n.ID, ds) {
				continue
			}
			// Check if locked off
			lockedOff := false
			for _, c := range r.Assignments {
				if c.NurseID == n.ID && c.Date == ds && c.Locked && (c.ShiftCode == "X" || c.ShiftCode == "L") {
					lockedOff = true
					break
				}
			}
			if lockedOff {
				continue
			}

			if n.Position == "RN" {
				availRN++
				if n.Double && r.Policy.MaxDoubleShifts > 0 {
					doubleEligibleRN++
				}
			} else if n.Position == "PN" {
				availPN++
				if n.Double && r.Policy.MaxDoubleShifts > 0 {
					doubleEligiblePN++
				}
			}
			if n.Leader {
				availLeaders++
			}
			for _, s := range n.Skills {
				skillsMap[s]++
			}
			for _, code := range n.Allowed {
				allowedShiftCount[code]++
			}
		}

		// Check each requirement on this date
		for _, req := range dailyStaffing {
			// Leader check
			if req.Leaders > availLeaders {
				out = append(out, domain.ReadinessIssue{
					Code:     "INSUFFICIENT_LEADERS",
					Field:    "policy.staffing",
					Date:     ds,
					Severity: "warning",
					FixPath:  "/staff",
					Message:  fmt.Sprintf("วันที่ %s หัวหน้าเวรที่มีสิทธิ์ไม่เพียงพอ (ต้องการ %d, ผู้พร้อมปฏิบัติงานมี %d คน)", ds, req.Leaders, availLeaders),
				})
			}
			// Skills check
			for skill, need := range req.Skills {
				if skillsMap[skill] < need {
					out = append(out, domain.ReadinessIssue{
						Code:     "INSUFFICIENT_SKILL",
						Field:    "policy.staffing.skills",
						Date:     ds,
						Severity: "warning",
						FixPath:  "/staff",
						Message:  fmt.Sprintf("วันที่ %s ทักษะไม่เพียงพอ: %s (ต้องการ %d, ผู้พร้อมปฏิบัติงานมี %d คน)", ds, skill, need, skillsMap[skill]),
					})
				}
			}
		}

		// Calculate total distinct staff needed across non-overlapping shifts on this date
		totalReqRN, totalReqPN := 0, 0
		for _, req := range dailyStaffing {
			totalReqRN += req.RN + req.Leaders
			totalReqPN += req.PN
		}

		// If total RN needed exceeds available RN + double shift allowance, it is a structural shortage
		maxCoverableRN := availRN + doubleEligibleRN
		if totalReqRN > maxCoverableRN {
			out = append(out, domain.ReadinessIssue{
				Code:     "CAPACITY_DEFICIT_RN",
				Field:    "policy.staffing",
				Date:     ds,
				Severity: "warning",
				FixPath:  "/staff",
				Message:  fmt.Sprintf("วันที่ %s พยาบาลวิชาชีพ (RN) ไม่เพียงพอจริงตามวันลาและสิทธิ์เวรควบ (ต้องการ %d คน-ผลัด, พร้อมปฏิบัติงานสูงสุด %d คน-ผลัด)", ds, totalReqRN, maxCoverableRN),
			})
		} else if totalReqRN > availRN {
			// Tight: requires double shifts to cover
			out = append(out, domain.ReadinessIssue{
				Code:     "CAPACITY_TIGHT_RN",
				Field:    "policy.staffing",
				Date:     ds,
				Severity: "warning",
				FixPath:  "/staff",
				Message:  fmt.Sprintf("วันที่ %s RN ตึงตัว (ต้องการ %d ผลัด, มีคนว่าง %d คน) ระบบจะใช้เวรควบที่ได้รับอนุญาตในการจัดเวร", ds, totalReqRN, availRN),
			})
		} else if availRN > 0 && float64(totalReqRN)/float64(availRN) >= 0.65 && doubleEligibleRN == 0 {
			// High utilization without double shifts: rotation risk
			out = append(out, domain.ReadinessIssue{
				Code:     "CAPACITY_ROTATION_RISK_RN",
				Field:    "policy.staffing",
				Date:     ds,
				Severity: "warning",
				FixPath:  "/staff",
				Message:  fmt.Sprintf("วันที่ %s สัดส่วน RN ขึ้นเวรสูง (ต้องการ %d จาก %d คน, คิดเป็น %.0f%%) และยังไม่มีพยาบาลที่ได้รับสิทธิ์เวรควบ (ชบ) สุ่มเสี่ยงจัดเวรติดขัดเวลาพัก แนะนำเปิดสิทธิ์เวรควบให้พยาบาลบางท่าน", ds, totalReqRN, availRN, (float64(totalReqRN)/float64(availRN))*100),
			})
		}

		maxCoverablePN := availPN + doubleEligiblePN
		if totalReqPN > maxCoverablePN {
			out = append(out, domain.ReadinessIssue{
				Code:     "CAPACITY_DEFICIT_PN",
				Field:    "policy.staffing",
				Date:     ds,
				Severity: "warning",
				FixPath:  "/staff",
				Message:  fmt.Sprintf("วันที่ %s ผู้ช่วยพยาบาล (PN) ไม่เพียงพอจริง (ต้องการ %d คน-ผลัด, พร้อมปฏิบัติงานสูงสุด %d คน-ผลัด)", ds, totalReqPN, maxCoverablePN),
			})
		}
	}

	// 2. Monthly Hour Capacity Bounds
	for _, role := range []string{"RN", "PN"} {
		demand, capacity := 0.0, 0.0
		for d := a; d.Before(b); d = d.AddDate(0, 0, 1) {
			for _, req := range staffingForDate(r, d.Format("2006-01-02")) {
				need := req.RN
				if role == "RN" {
					need += req.Leaders
				} else if role == "PN" {
					need = req.PN
				}
				demand += float64(need*(req.End-req.Start)) / 60
			}
		}
		for _, n := range r.Staff {
			if !n.Active || n.Position != role {
				continue
			}
			available := days
			for d := a; d.Before(b); d = d.AddDate(0, 0, 1) {
				date := d.Format("2006-01-02")
				unavailable := approvedLeave(r, n.ID, date)
				for _, c := range r.Assignments {
					if c.NurseID == n.ID && c.Date == date && c.Locked && (c.ShiftCode == "X" || c.ShiftCode == "L") {
						unavailable = true
					}
				}
				if unavailable {
					available--
				}
			}
			leaveDays := 0
			for d := a; d.Before(b); d = d.AddDate(0, 0, 1) {
				if approvedLeave(r, n.ID, d.Format("2006-01-02")) {
					leaveDays++
				}
			}
			available = max(0, min(available, days-leaveDays-r.Policy.MinOff))
			regular, long := 0.0, 0.0
			for _, sh := range r.Shifts {
				if !usableShift(r, n, sh) {
					continue
				}
				hours := 0.0
				for _, p := range sh.Periods {
					hours += float64(p.End-p.Start) / 60
				}
				if sh.Double {
					long = math.Max(long, hours)
				} else {
					regular = math.Max(regular, hours)
				}
			}
			hours := float64(available)*regular + float64(min(available, r.Policy.MaxDoubleShifts))*math.Max(0, long-regular)
			capacity += math.Min(hours, r.Policy.MaxMonthlyHours)
		}
		if demand > capacity+0.001 {
			out = append(out, domain.ReadinessIssue{
				Code:     "CAPACITY_INSUFFICIENT_" + role,
				Field:    "policy.staffing",
				Severity: "warning",
				FixPath:  "/staff",
				Message:  fmt.Sprintf("%s ต้องการรวม %.0f คน-ชั่วโมง; กำลังตามวันลา OFF สิทธิ์เวรควบและเพดานชั่วโมง มีได้สูงสุด %.0f คน-ชั่วโมง (ขาดอย่างน้อย %.0f คน-ชั่วโมง) ระบบจะลองจัดภายใต้กฎเดิมและรายงานช่องที่ต้องเสริม", role, demand, capacity, demand-capacity),
			})
		}
	}
	return out
}
