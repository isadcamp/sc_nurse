package validation

import (
	"fmt"
	"math"
	"nurse-scheduler/backend/internal/domain"
	"sort"
	"strings"
	"time"
	_ "time/tzdata"
)

type interval struct {
	start, end time.Time
	cell       domain.Cell
}

func contains(a []string, b string) bool {
	for _, s := range a {
		if s == b {
			return true
		}
	}
	return false
}
func min(a, b time.Time) time.Time {
	if a.Before(b) {
		return a
	}
	return b
}
func max(a, b time.Time) time.Time {
	if a.After(b) {
		return a
	}
	return b
}
func overlap(a, b, c, d time.Time) float64 {
	s, e := max(a, c), min(b, d)
	if e.After(s) {
		return e.Sub(s).Hours()
	}
	return 0
}
func day(s string, loc *time.Location) time.Time {
	t, _ := time.ParseInLocation("2006-01-02", s, loc)
	return t
}
func Validate(r domain.Roster, original []domain.Cell) domain.Report {
	out := domain.Report{Violations: []domain.RuleViolation{}, Hours: []domain.Hours{}, CanSave: true}
	add := func(code, severity string, c domain.Cell, msg string, meta map[string]any) {
		out.Violations = append(out.Violations, domain.RuleViolation{RuleCode: code, Severity: severity, Date: c.Date, ShiftCode: c.ShiftCode, SubjectID: c.NurseID, Message: msg, Metadata: meta})
		if severity == "error" {
			out.CanSave = false
		}
	}
	if !PolicyValid(r.Policy) || r.Month < 1 || r.Month > 12 || r.Year < 2000 || r.Year > 2200 {
		add("CONFIGURATION", "error", domain.Cell{}, "การตั้งค่ากฎไม่ถูกต้อง", nil)
		return out
	}
	loc, err := time.LoadLocation(r.Timezone)
	if err != nil {
		add("CONFIGURATION", "error", domain.Cell{}, "เขตเวลาไม่ถูกต้อง", nil)
		return out
	}
	start := time.Date(r.Year, time.Month(r.Month), 1, 0, 0, 0, 0, loc)
	end := start.AddDate(0, 1, 0)
	shifts := map[string]domain.RosterShift{}
	for _, s := range r.Shifts {
		shifts[s.Code] = s
	}
	staff := map[string]domain.Staff{}
	for _, n := range r.Staff {
		staff[n.ID] = n
	}
	all := append(append([]domain.Cell{}, r.Boundary...), r.Assignments...)
	periods := map[string][]interval{}
	work := map[string]map[string]bool{}
	offs := map[string]int{}
	doubles := map[string]int{}
	quotas := map[string]map[string]int{}
	seen := map[string]bool{}
	current := map[string]domain.Cell{}
	for _, c := range r.Assignments {
		current[c.NurseID+"|"+c.Date] = c
	}
	for _, c := range original {
		if c.Locked {
			n, ok := current[c.NurseID+"|"+c.Date]
			if !ok || n.ShiftCode != c.ShiftCode {
				add("LOCKED_PRESERVED", "error", c, "เวรที่ล็อกต้องไม่เปลี่ยน", nil)
			}
		}
	}
	for _, c := range all {
		date := day(c.Date, loc)
		inMonth := !date.Before(start) && date.Before(end)
		n, ok := staff[c.NurseID]
		sh, valid := shifts[c.ShiftCode]
		if inMonth {
			isSpecialDuty := c.ShiftCode == "อบ" || c.ShiftCode == "บห"
			isLeaveOrOff := c.ShiftCode == "X" || c.ShiftCode == "x" || c.ShiftCode == "อ" || c.ShiftCode == "L" || c.ShiftCode == "V" || c.ShiftCode == "v" || c.ShiftCode == "Va" || isSpecialDuty
			if !ok || !n.Active || (c.ShiftCode != "" && !isLeaveOrOff && (!valid || !contains(n.Allowed, c.ShiftCode))) {
				add("STAFF_PERMISSION", "error", c, "บุคลากรไม่มีสิทธิ์ในเวรนี้หรือข้อมูลเวรไม่ครบ", nil)
			}
			key := c.NurseID + "|" + c.Date
			if seen[key] {
				add("ONE_ASSIGNMENT_PER_DAY", "error", c, "มีมากกว่าหนึ่งรายการต่อวัน", nil)
			}
			seen[key] = true
			isDouble := sh.Double || c.ShiftCode == "ชบ" || c.ShiftCode == "บด"
			if isDouble && !n.Double {
				add("DOUBLE_SHIFT_PERMISSION", "error", c, "ไม่มีสิทธิ์ขึ้นเวรควบ", nil)
			}
			if quotas[c.NurseID] == nil {
				quotas[c.NurseID] = map[string]int{}
			}
			quotas[c.NurseID][c.ShiftCode]++
			if isDouble {
				doubles[c.NurseID]++
			}
			if c.ShiftCode == "X" {
				offs[c.NurseID]++
			}
		}
		if len(sh.Periods) > 0 {
			if work[c.NurseID] == nil {
				work[c.NurseID] = map[string]bool{}
			}
			work[c.NurseID][c.Date] = true
		}
		approved := false
		for _, l := range r.Leaves {
			if l.NurseID == c.NurseID && l.Approved && c.Date >= l.Start && c.Date <= l.End {
				approved = true
			}
		}
		if c.ShiftCode == "L" && !approved {
			add("NO_LEAVE_OVERLAP", "error", c, "L ต้องมีวันลาที่อนุมัติแล้ว", nil)
		}
		for _, p := range sh.Periods {
			a, b := date.Add(time.Duration(p.Start)*time.Minute), date.Add(time.Duration(p.End)*time.Minute)
			periods[c.NurseID] = append(periods[c.NurseID], interval{a, b, c})
			for _, l := range r.Leaves {
				if l.NurseID != c.NurseID {
					continue
				}
				if overlap(a, b, day(l.Start, loc), day(l.End, loc).AddDate(0, 0, 1)) > 0 {
					if l.Approved {
						add("NO_LEAVE_OVERLAP", "error", c, "เวรทับช่วงลาที่อนุมัติแล้ว", nil)
					} else {
						add("PREFERENCE", "warning", c, "เวรทับคำขอลาที่รออนุมัติ", nil)
					}
				}
			}
		}
	}
	for _, n := range r.Staff {
		list := periods[n.ID]
		sort.SliceStable(list, func(i, j int) bool { return list[i].start.Before(list[j].start) })
		merged := []interval{}
		for _, v := range list {
			if len(merged) == 0 {
				merged = append(merged, v)
				continue
			}
			prev := &merged[len(merged)-1]
			if v.start.Before(prev.end) {
				add("NO_OVERLAP", "error", v.cell, "ช่วงเวลาทำงานซ้อนกัน", nil)
			}
			same := v.cell.Date == prev.cell.Date && v.cell.ShiftCode == prev.cell.ShiftCode
			_ = same
			if v.start.After(prev.end) && v.start.Sub(prev.end).Hours() < r.Policy.MinRestHours {
				add("MIN_REST_HOURS", "error", v.cell, "พักระหว่างเวรต่ำกว่ากำหนด", map[string]any{"hours": math.Max(0, v.start.Sub(prev.end).Hours()), "minimum": r.Policy.MinRestHours})
			}
			// Rule: เวรดึกต่อเช้า / ดึกต่อบ่าย ไม่สามารถทำได้ (อนุญาต บ่ายต่อดึก)
			isPrevNight := prev.cell.ShiftCode == "ด" || prev.cell.ShiftCode == "Night" || prev.cell.ShiftCode == "N" || prev.cell.ShiftCode == "12N" || prev.cell.ShiftCode == "บด" || prev.cell.ShiftCode == "ชด"
			isCurrMorning := v.cell.ShiftCode == "ช" || v.cell.ShiftCode == "Day" || v.cell.ShiftCode == "D" || v.cell.ShiftCode == "12D" || v.cell.ShiftCode == "ชบ" || v.cell.ShiftCode == "ชด"
			isCurrEvening := v.cell.ShiftCode == "บ" || v.cell.ShiftCode == "ชบ" || v.cell.ShiftCode == "บด"

			diffDays := day(v.cell.Date, loc).Sub(day(prev.cell.Date, loc))
			if !same && diffDays >= 0 && diffDays <= 24*time.Hour {
				if isPrevNight && isCurrMorning {
					add("MIN_REST_HOURS", "error", v.cell, "ห้ามจัดเวรดึกต่อด้วยเวรเช้า (เวรดึกต่อเช้า)", map[string]any{"prev": prev.cell.ShiftCode, "current": v.cell.ShiftCode})
				}
				if isPrevNight && isCurrEvening {
					add("MIN_REST_HOURS", "error", v.cell, "ห้ามจัดเวรดึกต่อด้วยเวรบ่าย (เวรดึกต่อบ่าย)", map[string]any{"prev": prev.cell.ShiftCode, "current": v.cell.ShiftCode})
				}
			}
			if !v.start.After(prev.end) {
				prev.end = max(prev.end, v.end)
			} else {
				merged = append(merged, v)
			}
		}
		h := domain.Hours{NurseID: n.ID}
		for _, v := range list {
			if v.cell.Date < start.Format("2006-01-02") {
				h.CarryIn += overlap(v.start, v.end, start, end)
			}
			if v.cell.Date >= start.Format("2006-01-02") && v.cell.Date < end.Format("2006-01-02") {
				h.CarryOut += overlap(v.start, v.end, end, end.AddDate(0, 0, 2))
			}
		}
		nights := map[string]bool{}
		for _, v := range merged {
			if v.end.Sub(v.start).Hours() > r.Policy.MaxContinuousHours {
				add("MAX_CONTINUOUS_HOURS", "error", v.cell, "ชั่วโมงทำงานต่อเนื่องเกินเพดาน", nil)
			}
			h.Monthly += overlap(v.start, v.end, start, end)
			for d := day(v.start.Format("2006-01-02"), loc).AddDate(0, 0, -1); d.Before(v.end); d = d.AddDate(0, 0, 1) {
				ns, ne := d.Add(time.Duration(r.Policy.NightStart)*time.Minute), d.Add(time.Duration(r.Policy.NightEnd)*time.Minute)
				ov := overlap(v.start, v.end, ns, ne)
				if ov > 0 {
					h.Night += overlap(max(v.start, start), min(v.end, end), ns, ne)
				}
			}
			isExplicitNight := v.cell.ShiftCode == "ด" || v.cell.ShiftCode == "Night" || v.cell.ShiftCode == "N" || v.cell.ShiftCode == "12N" || v.cell.ShiftCode == "บด" || v.cell.ShiftCode == "ชด"
			if isExplicitNight && v.cell.Date != "" {
				nights[v.cell.Date] = true
			}
		}
		for d := range nights {
			if d >= start.Format("2006-01-02") && d < end.Format("2006-01-02") {
				h.Nights++
			}
		}
		c := domain.Cell{NurseID: n.ID}
		if n.Active && !n.PartTime && offs[n.ID] < r.Policy.MinOff {
			add("MIN_OFF", "error", c, "วัน OFF ต่ำกว่าขั้นต่ำ", nil)
		}
		// Rolling maxima occur at interval endpoints or endpoints minus the window.
		for _, rule := range []struct {
			code     string
			duration time.Duration
			limit    float64
		}{
			{"MAX_ROLLING_24_HOURS", 24 * time.Hour, r.Policy.MaxRolling24Hours},
			{"MAX_ROLLING_7_DAYS", 7 * 24 * time.Hour, r.Policy.MaxRolling7DaysHours},
		} {
			if rule.limit <= 0 {
				continue
			}
			failed := false
			for _, v := range merged {
				for _, a := range []time.Time{v.start, v.end, v.start.Add(-rule.duration), v.end.Add(-rule.duration)} {
					b := a.Add(rule.duration)
					if !b.After(start) || !a.Before(end) {
						continue
					}
					hours := 0.0
					for _, x := range merged {
						hours += overlap(a, b, x.start, x.end)
					}
					if hours > rule.limit+0.001 {
						add(rule.code, "error", domain.Cell{NurseID: n.ID, Date: a.Format("2006-01-02")}, "ชั่วโมงในช่วงเลื่อนเกินเพดาน", map[string]any{"hours": hours, "maximum": rule.limit})
						failed = true
						break
					}
				}
				if failed {
					break
				}
			}
		}
		if h.Monthly > r.Policy.MaxMonthlyHours {
			add("MAX_MONTHLY_HOURS", "error", c, "ชั่วโมงประจำเดือนเกินเพดาน", map[string]any{"hours": h.Monthly})
		}
		if h.CarryOut > 0 {
			nextHours := 0.0
			for _, v := range merged {
				nextHours += overlap(v.start, v.end, end, end.AddDate(0, 1, 0))
			}
			if nextHours > r.Policy.MaxMonthlyHours {
				add("MAX_MONTHLY_HOURS", "error", domain.Cell{NurseID: n.ID, Date: end.Format("2006-01-02")}, "ชั่วโมงล้ำไปทำให้เดือนถัดไปเกินเพดาน", map[string]any{"hours": nextHours})
			}
		}
		if doubles[n.ID] > r.Policy.MaxDoubleShifts {
			add("MAX_DOUBLE_SHIFTS", "error", c, "จำนวนเวรควบเกินเพดาน", nil)
		}
		for _, rule := range []struct {
			code  string
			days  map[string]bool
			limit int
		}{{"MAX_CONSECUTIVE_DAYS", work[n.ID], r.Policy.MaxConsecutiveDays}, {"MAX_CONSECUTIVE_NIGHTS", nights, r.Policy.MaxConsecutiveNights}} {
			keys := []string{}
			for d := range rule.days {
				keys = append(keys, d)
			}
			sort.Strings(keys)
			run := 0
			prev := ""
			for _, d := range keys {
				if prev != "" && day(prev, loc).AddDate(0, 0, 1).Format("2006-01-02") == d {
					run++
				} else {
					run = 1
				}
				prev = d
				if run > rule.limit {
					add(rule.code, "error", domain.Cell{NurseID: n.ID, Date: d}, "ทำงาน/กลางคืนติดต่อกันเกินกำหนด", map[string]any{"days": run})
				}
			}
		}
		if r.Policy.MaxConsecutiveOffDays > 0 {
			regularOffDays := map[string]bool{}
			for d := start; d.Before(end); d = d.AddDate(0, 0, 1) {
				ds := d.Format("2006-01-02")
				c, ok := current[n.ID+"|"+ds]
				if ok && (c.ShiftCode == "X" || c.ShiftCode == "x" || c.ShiftCode == "อ") {
					isLeave := false
					for _, l := range r.Leaves {
						if l.Approved && l.NurseID == n.ID && l.Start <= ds && l.End >= ds {
							isLeave = true
							break
						}
					}
					if !isLeave {
						regularOffDays[ds] = true
					}
				}
			}
			keys := []string{}
			for d := range regularOffDays {
				keys = append(keys, d)
			}
			sort.Strings(keys)
			run := 0
			prev := ""
			for _, d := range keys {
				if prev != "" && day(prev, loc).AddDate(0, 0, 1).Format("2006-01-02") == d {
					run++
				} else {
					run = 1
				}
				prev = d
				if run > r.Policy.MaxConsecutiveOffDays {
					add("MAX_CONSECUTIVE_OFF", "warning", domain.Cell{NurseID: n.ID, Date: d}, "วันหยุดประจำ (OFF) ติดต่อกันเกินกำหนด", map[string]any{"days": run, "limit": r.Policy.MaxConsecutiveOffDays})
				}
			}
		}
		for _, t := range r.Policy.Targets {
			if t.NurseID != n.ID {
				continue
			}
			if math.Abs(h.Monthly-t.Hours) > 0.001 {
				add("TARGET_HOURS", "warning", c, "ชั่วโมงยังไม่ตรงเป้าหมาย", map[string]any{"actual": h.Monthly, "target": t.Hours, "score": math.Abs(h.Monthly - t.Hours)})
			}
			if offs[n.ID] != t.Off {
				add("TARGET_OFF", "warning", c, "วัน OFF ยังไม่ตรงเป้าหมาย", map[string]any{"actual": offs[n.ID], "target": t.Off, "score": math.Abs(float64(offs[n.ID] - t.Off))})
			}
			codes := []string{}
			for code := range t.Quotas {
				codes = append(codes, code)
			}
			sort.Strings(codes)
			for _, code := range codes {
				q := t.Quotas[code]
				if quotas[n.ID][code] != q {
					add("SHIFT_QUOTA", "warning", domain.Cell{NurseID: n.ID, ShiftCode: code}, "จำนวนเวรยังไม่ตรงโควตา", map[string]any{"actual": quotas[n.ID][code], "target": q, "score": math.Abs(float64(quotas[n.ID][code] - q))})
				}
			}
		}
		out.Hours = append(out.Hours, h)
	}
	for _, p := range r.Policy.Preferences {
		c, ok := current[p.NurseID+"|"+p.Date]
		match := ok && c.ShiftCode == p.ShiftCode
		if (p.Avoid && match) || (!p.Avoid && !match) {
			add("PREFERENCE", "warning", domain.Cell{NurseID: p.NurseID, Date: p.Date, ShiftCode: p.ShiftCode}, "ไม่ตรงความต้องการรายบุคคล", map[string]any{"score": 1})
		}
	}
	if len(out.Hours) > 1 {
		lo, hi := out.Hours[0].Monthly, out.Hours[0].Monthly
		for _, h := range out.Hours {
			lo = math.Min(lo, h.Monthly)
			hi = math.Max(hi, h.Monthly)
		}
		if hi-lo > r.Policy.FairnessHours {
			add("FAIRNESS", "warning", domain.Cell{}, "ชั่วโมงงานกระจายต่างกันเกินเป้าหมาย", map[string]any{"difference": hi - lo, "score": hi - lo - r.Policy.FairnessHours})
		}
	}
	// Sweep every interval boundary: coverage must hold throughout the entire staffing window.
	for d := start; d.Before(end); d = d.AddDate(0, 0, 1) {
		ds := d.Format("2006-01-02")
		for _, req := range r.Policy.Staffing {
			if req.Date != "" && req.Date != ds {
				continue
			}
			if req.Date == "" {
				overridden := false
				for _, specific := range r.Policy.Staffing {
					if specific.Date == ds && specific.Start == req.Start && specific.End == req.End {
						overridden = true
						break
					}
				}
				if overridden {
					continue
				}
			}
			a, b := d.Add(time.Duration(req.Start)*time.Minute), d.Add(time.Duration(req.End)*time.Minute)
			points := []time.Time{a, b}
			for _, list := range periods {
				for _, v := range list {
					if v.start.After(a) && v.start.Before(b) {
						points = append(points, v.start)
					}
					if v.end.After(a) && v.end.Before(b) {
						points = append(points, v.end)
					}
				}
			}
			sort.Slice(points, func(i, j int) bool { return points[i].Before(points[j]) })
			for i := 0; i < len(points)-1; i++ {
				if points[i].Equal(points[i+1]) {
					continue
				}
				rn, pn, leaders := 0, 0, 0
				skills := map[string]int{}
				for id, list := range periods {
					covered := false
					for _, v := range list {
						if v.cell.ShiftCode == "อบ" || v.cell.ShiftCode == "บห" {
							continue
						}
						if !v.start.After(points[i]) && !v.end.Before(points[i+1]) {
							covered = true
							break
						}
					}
					if !covered {
						continue
					}
					n := staff[id]
					if n.Position == "RN" {
						rn++
					}
					if n.Position == "PN" {
						pn++
					}
					if n.Leader {
						leaders++
					}
					for _, s := range n.Skills {
						skills[s]++
					}
				}
				targetRN := req.RN + req.Leaders
				missingRN := rn < targetRN
				missingPN := pn < req.PN
				missingLeaders := leaders < req.Leaders
				missing := missingRN || missingPN || missingLeaders
				for s, count := range req.Skills {
					if skills[s] < count {
						missing = true
					}
				}
				if missing {
					var missingParts []string
					if missingRN {
						missingParts = append(missingParts, fmt.Sprintf("ขาด RN %d คน (ต้องการ %d, จัดได้ %d)", targetRN-rn, targetRN, rn))
					}
					if missingPN {
						missingParts = append(missingParts, fmt.Sprintf("ขาด PN %d คน (ต้องการ %d, จัดได้ %d)", req.PN-pn, req.PN, pn))
					}
					if missingLeaders {
						missingParts = append(missingParts, fmt.Sprintf("ขาดหัวหน้าเวร %d คน (ต้องการ %d, จัดได้ %d)", req.Leaders-leaders, req.Leaders, leaders))
					}
					for s, count := range req.Skills {
						if skills[s] < count {
							missingParts = append(missingParts, fmt.Sprintf("ขาดทักษะ %s %d คน", s, count-skills[s]))
						}
					}
					missingSkills := map[string]int{}
					for skill, need := range req.Skills { if need > skills[skill] { missingSkills[skill] = need-skills[skill] } }
					msg := "อัตรากำลังไม่ครบช่วงเวลา: " + strings.Join(missingParts, ", ")
					add("MIN_STAFFING", "error", domain.Cell{Date: ds}, msg, map[string]any{
						"start": points[i].Format(time.RFC3339),
						"end": points[i+1].Format(time.RFC3339),
						"rn": rn, "reqRN": targetRN,
						"pn": pn, "reqPN": req.PN,
						"leaders": leaders, "reqLeaders": req.Leaders,
						"missingRN": targetRN - rn,
						"missingPN": req.PN - pn,
						"missingLeaders": req.Leaders-leaders,
						"missingSkills": missingSkills,
					})
				}
				targetTotal := targetRN + req.PN
				actualTotal := rn + pn
				if targetTotal > 0 && actualTotal > targetTotal {
					add("OVER_STAFFING", "warning", domain.Cell{Date: ds}, "อัตรากำลังเกินเป้าหมาย (เสี่ยงค่า OT เพิ่ม)", map[string]any{"start": points[i].Format(time.RFC3339), "end": points[i+1].Format(time.RFC3339), "actual": actualTotal, "target": targetTotal, "excess": actualTotal - targetTotal})
				}
			}
		}
	}
	sort.SliceStable(out.Violations, func(i, j int) bool {
		a, b := out.Violations[i], out.Violations[j]
		return fmt.Sprint(a.Date, a.SubjectID, a.RuleCode, a.ShiftCode) < fmt.Sprint(b.Date, b.SubjectID, b.RuleCode, b.ShiftCode)
	})
	return out
}
