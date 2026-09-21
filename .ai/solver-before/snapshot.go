package scheduler

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"sort"
	"time"

	"nurse-scheduler/backend/internal/domain"
	"nurse-scheduler/backend/internal/repository"
	"nurse-scheduler/backend/internal/validation"
)

// Snapshot owns a deep copy, including leave records omitted by roster transport.
func Snapshot(r domain.Roster) (domain.ResolvedPolicySnapshot, error) {
	s := domain.ResolvedPolicySnapshot{SchemaVersion: 1, Roster: r, Leaves: r.Leaves}
	b, err := json.Marshal(s)
	if err != nil {
		return s, err
	}
	if err = json.Unmarshal(b, &s); err != nil {
		return s, err
	}
	sort.Slice(s.Roster.Assignments, func(i, j int) bool { return cellKey(s.Roster.Assignments[i]) < cellKey(s.Roster.Assignments[j]) })
	sort.Slice(s.Roster.Boundary, func(i, j int) bool { return cellKey(s.Roster.Boundary[i]) < cellKey(s.Roster.Boundary[j]) })
	sort.Slice(s.Roster.Staff, func(i, j int) bool { return s.Roster.Staff[i].ID < s.Roster.Staff[j].ID })
	sort.Slice(s.Roster.Shifts, func(i, j int) bool { return s.Roster.Shifts[i].Code < s.Roster.Shifts[j].Code })
	sort.Slice(s.Leaves, func(i, j int) bool {
		a, b := s.Leaves[i], s.Leaves[j]
		return fmt.Sprint(a.NurseID, a.Start, a.End, a.Approved) < fmt.Sprint(b.NurseID, b.Start, b.End, b.Approved)
	})
	b, err = json.Marshal(s)
	if err != nil {
		return s, err
	}
	hash := sha256.Sum256(b)
	s.Hash = hex.EncodeToString(hash[:])
	s.Roster.Leaves = s.Leaves
	return s, nil
}

func cellKey(c domain.Cell) string { return c.Date + "|" + c.NurseID }
func monthRange(r domain.Roster) (time.Time, time.Time) {
	a := time.Date(r.Year, time.Month(r.Month), 1, 0, 0, 0, 0, time.UTC)
	return a, a.AddDate(0, 1, 0)
}

func ValidateScope(r domain.Roster, s domain.SolveScope) error {
	a, b := monthRange(r)
	if (s.Start == "") != (s.End == "") {
		return repository.ErrInput
	}
	if s.Start != "" {
		x, e := time.Parse("2006-01-02", s.Start)
		y, f := time.Parse("2006-01-02", s.End)
		if e != nil || f != nil || x.Before(a) || !y.Before(b) || y.Before(x) {
			return repository.ErrInput
		}
	}
	seen := map[string]bool{}
	for _, id := range s.NurseIDs {
		found := false
		for _, n := range r.Staff {
			if n.ID == id && n.Active {
				found = true
			}
		}
		if !found || seen[id] {
			return repository.ErrInput
		}
		seen[id] = true
	}
	return nil
}
func inScope(c domain.Cell, s domain.SolveScope) bool {
	if c.Locked {
		return false
	}
	if s.Start != "" && (c.Date < s.Start || c.Date > s.End) {
		return false
	}
	if len(s.NurseIDs) == 0 {
		return true
	}
	for _, id := range s.NurseIDs {
		if id == c.NurseID {
			return true
		}
	}
	return false
}

func Readiness(r domain.Roster, simulation bool) (domain.ReadinessReport, error) {
	snap, err := Snapshot(r)
	if err != nil {
		return domain.ReadinessReport{}, err
	}
	out := domain.ReadinessReport{Ready: true, Issues: []domain.ReadinessIssue{}, ExcludedShifts: []string{}, Revision: snap.Hash, PolicyVersion: r.Policy.Version}
	add := func(code, field, date, id, msg, path string) {
		out.Ready = false
		out.Issues = append(out.Issues, domain.ReadinessIssue{Code: code, Field: field, Date: date, NurseID: id, Message: msg, FixPath: path, Severity: "error"})
	}
	if !validation.PolicyValid(r.Policy) {
		add("POLICY_INVALID", "policy", "", "", "ค่ากฎไม่ถูกต้อง", "/settings/roster-policy")
	}
	if r.Policy.Version == "" {
		add("POLICY_VERSION_MISSING", "policy.version", "", "", "ต้องระบุรุ่นชุดตั้งค่า", "/settings/roster-policy")
	}
	if !simulation && r.Policy.Status != "confirmed" {
		add("POLICY_NOT_CONFIRMED", "policy.status", "", "", "ต้องยืนยันชุดตั้งค่าก่อน AUTO", "/settings/roster-policy")
	}
	a, b := monthRange(r)
	if (r.Policy.EffectiveFrom != "" && r.Policy.EffectiveFrom > a.Format("2006-01-02")) ||
		(r.Policy.EffectiveTo != "" && r.Policy.EffectiveTo < b.AddDate(0, 0, -1).Format("2006-01-02")) {
		add("POLICY_DATE_GAP", "policy.effectiveFrom", a.Format("2006-01-02"), "", "ชุดตั้งค่าต้องครอบคลุมเดือนเป้าหมายทั้งหมด", "/settings/roster-policy")
	}
	if _, e := time.LoadLocation(r.Timezone); e != nil {
		add("TIMEZONE_INVALID", "timezone", "", "", "เขตเวลาไม่ถูกต้อง", "/settings/ward")
	}
	targets := map[string]domain.Target{}
	for _, t := range r.Policy.Targets {
		if _, ok := targets[t.NurseID]; ok {
			add("TARGET_DUPLICATE", "policy.targets", "", t.NurseID, "เป้าหมายซ้ำ", "/settings/targets")
		}
		targets[t.NurseID] = t
	}
	active := 0
	for _, n := range r.Staff {
		if !n.Active {
			continue
		}
		active++
		t, ok := targets[n.ID]
		if !ok {
			add("TARGET_MISSING", "policy.targets", "", n.ID, "เป้าหมายรายคนไม่ครบ", "/settings/targets")
			continue
		}
		if t.Off < r.Policy.MinOff {
			add("MIN_OFF_EXCEEDS_TARGET", "policy.targets.off", "", n.ID, "OFF ขั้นต่ำมากกว่าเป้าหมาย", "/settings/targets")
		}
		if t.Hours > r.Policy.MaxMonthlyHours {
			add("TARGET_EXCEEDS_CAP", "policy.targets.hours", "", n.ID, "ชั่วโมงเป้าหมายเกินเพดาน", "/settings/targets")
		}
	}
	if active == 0 {
		add("STAFF_MISSING", "staff", "", "", "ไม่มีบุคลากรที่ใช้งาน", "/staff")
	}
	if len(r.Policy.Staffing) == 0 {
		add("STAFFING_MISSING", "policy.staffing", "", "", "ยังไม่ได้กำหนดอัตรากำลัง", "/settings/staffing")
	}
	for _, req := range r.Policy.Staffing {
		rn, pn, leaders := 0, 0, 0
		skills := map[string]int{}
		for _, n := range r.Staff {
			if !n.Active {
				continue
			}
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
		if rn < req.RN || pn < req.PN || leaders < req.Leaders {
			add("INSUFFICIENT_STAFF", "policy.staffing", req.Date, "", "บุคลากรหรือหัวหน้าที่มีสิทธิ์ไม่เพียงพอ", "/staff")
		}
		for skill, need := range req.Skills {
			if skills[skill] < need {
				add("INSUFFICIENT_SKILL", "policy.staffing.skills", req.Date, "", "ทักษะไม่เพียงพอ: "+skill, "/staff")
			}
		}
	}

	// Monthly Capacity & Feasibility Check
	numDays := 0
	for d := a; d.Before(b); d = d.AddDate(0, 0, 1) {
		numDays++
	}
	minOff := r.Policy.MinOff
	if minOff <= 0 {
		minOff = 8
	}
	activeRN, activePN := 0, 0
	for _, n := range r.Staff {
		if n.Active {
			if n.Position == "RN" {
				activeRN++
			} else if n.Position == "PN" {
				activePN++
			}
		}
	}
	dailyReqRN, dailyReqPN := 0, 0
	for _, req := range r.Policy.Staffing {
		if req.Date == "" {
			dailyReqRN += req.RN
			dailyReqPN += req.PN
		}
	}
	if dailyReqRN > 0 && activeRN > 0 {
		monthlyReqRN := dailyReqRN * numDays
		maxCapacityRN := activeRN * (numDays - minOff)
		if monthlyReqRN > maxCapacityRN {
			add("CAPACITY_INSUFFICIENT_RN", "policy.staffing", "", "",
				fmt.Sprintf("อัตรากำลัง RN ไม่เพียงพอตลอดทั้งเดือน: ต้องการรวม %d เวร แต่บุคลากร RN %d คน สามารถขึ้นเวรได้สูงสุด %d เวร (คิดจากวันหยุดขั้นต่ำ %d วัน) — ขาด %d เวร แนะนำปรับลดความต้องการ RN ในนโยบาย", monthlyReqRN, activeRN, maxCapacityRN, minOff, monthlyReqRN-maxCapacityRN),
				"/settings/roster-policy")
		}
	}
	if dailyReqPN > 0 && activePN > 0 {
		monthlyReqPN := dailyReqPN * numDays
		maxCapacityPN := activePN * (numDays - minOff)
		if monthlyReqPN > maxCapacityPN {
			add("CAPACITY_INSUFFICIENT_PN", "policy.staffing", "", "",
				fmt.Sprintf("อัตรากำลัง PN ไม่เพียงพอตลอดทั้งเดือน: ต้องการรวม %d เวร แต่ผู้ช่วยพยาบาล (PN) %d คน สามารถขึ้นเวรได้สูงสุด %d เวร (คิดจากวันหยุดขั้นต่ำ %d วัน) — ขาด %d เวร แนะนำปรับลดความต้องการ PN ในนโยบาย", monthlyReqPN, activePN, maxCapacityPN, minOff, monthlyReqPN-maxCapacityPN),
				"/settings/roster-policy")
		}
	}
	codes := map[string]bool{}
	for _, sh := range r.Shifts {
		codes[sh.Code] = true
		periods := append([]domain.Period{}, sh.Periods...)
		sort.Slice(periods, func(i, j int) bool { return periods[i].Start < periods[j].Start })
		start, end := -1, -1
		excluded := false
		for _, p := range periods {
			if p.Start < 0 || p.Start >= 1440 || p.End <= p.Start || p.End > 2880 {
				add("SHIFT_PERIOD_INVALID", "shifts.periods", "", "", "ช่วงเวลาเวรไม่ถูกต้อง", "/settings/shifts")
			}
			if p.Start > end {
				start = p.Start
			}
			end = p.End
			if float64(end-start)/60 > r.Policy.MaxContinuousHours {
				excluded = true
			}
		}
		if excluded {
			out.ExcludedShifts = append(out.ExcludedShifts, sh.Code)
		}
	}
	if !codes["X"] || !codes["L"] {
		add("REST_SHIFT_MISSING", "shifts", "", "", "ต้องมีชนิดเวร X และ L", "/settings/shifts")
	}
	for _, l := range r.Leaves {
		if !l.Approved {
			continue
		}
		x, e := time.Parse("2006-01-02", l.Start)
		y, f := time.Parse("2006-01-02", l.End)
		if e != nil || f != nil || y.Before(x) {
			add("LEAVE_INVALID", "leaves", l.Start, l.NurseID, "ข้อมูลวันลาไม่ถูกต้อง", "/leave-requests")
		}
	}
	fixed := r
	fixed.Assignments = []domain.Cell{}
	for _, c := range r.Assignments {
		if c.Locked {
			fixed.Assignments = append(fixed.Assignments, c)
		}
	}
	for _, v := range validation.Validate(fixed, fixed.Assignments).Violations {
		if v.Severity == "error" && v.RuleCode != "MIN_STAFFING" && v.RuleCode != "MIN_OFF" {
			if v.Date != "" {
				d, err := time.Parse("2006-01-02", v.Date)
				if err == nil && (d.Before(a) || !d.Before(b)) {
					continue
				}
			}
			fixPath := "/schedules"
			if v.RuleCode == "STAFF_PERMISSION" || v.RuleCode == "DOUBLE_SHIFT_PERMISSION" {
				fixPath = "/staff"
			} else if v.RuleCode == "NO_LEAVE_OVERLAP" {
				fixPath = "/leave-requests"
			}
			add("LOCKED_"+v.RuleCode, "assignments", v.Date, v.SubjectID, v.Message, fixPath)
		}
	}
	// Unrecorded history defaults to rest days (X) for simulation, or flagged if completely missing for preceding date
	history := map[string]bool{}
	for _, c := range r.Boundary {
		history[cellKey(c)] = true
	}
	precedingDateStr := a.AddDate(0, 0, -1).Format("2006-01-02")
	days := max(7, max(r.Policy.MaxConsecutiveDays, r.Policy.MaxConsecutiveNights)+1)
	for _, n := range r.Staff {
		if !n.Active {
			continue
		}
		if !simulation && len(r.Boundary) == 0 && !history[precedingDateStr+"|"+n.ID] {
			add("BOUNDARY_MISSING", "boundary", precedingDateStr, n.ID, "ยังไม่ได้กำหนดเวรวันก่อนหน้า (รอยต่อเดือน)", "/schedules/boundary")
		}
		for d := a.AddDate(0, 0, -days); d.Before(a); d = d.AddDate(0, 0, 1) {
			date := d.Format("2006-01-02")
			if !history[date+"|"+n.ID] {
				r.Boundary = append(r.Boundary, domain.Cell{
					NurseID:   n.ID,
					Date:      date,
					ShiftCode: "X",
					Version:   1,
				})
				history[date+"|"+n.ID] = true
			}
		}
	}
	sort.Slice(out.Issues, func(i, j int) bool {
		x, y := out.Issues[i], out.Issues[j]
		return x.Code+x.Date+x.NurseID+x.Message < y.Code+y.Date+y.NurseID+y.Message
	})
	return out, nil
}
