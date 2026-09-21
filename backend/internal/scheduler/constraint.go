package scheduler

import (
	"context"
	"math"
	"sort"
	"strings"
	"time"

	"nurse-scheduler/backend/internal/domain"
	"nurse-scheduler/backend/internal/repository"
	"nurse-scheduler/backend/internal/validation"
)

// ConstraintSolver searches only immutable input. Node budgets make bounded runs reproducible.
type ConstraintSolver struct{}

var _ domain.Solver = ConstraintSolver{}

func Score(r domain.Roster, original []domain.Cell) domain.FairnessScore {
	report := validation.Validate(r, original)
	shortages := 0
	preferences := 0
	for _, v := range report.Violations {
		if v.RuleCode == "MIN_STAFFING" {
			shortages++
		}
		if v.RuleCode == "PREFERENCE" {
			preferences++
		}
	}
	targets := map[string]float64{}
	for _, t := range r.Policy.Targets {
		targets[t.NurseID] = t.Hours
	}
	holiday := map[string]bool{}
	for _, d := range r.Holidays {
		holiday[d.Date] = true
	}
	holidayHours := map[string]float64{}
	shifts := map[string]domain.RosterShift{}
	for _, s := range r.Shifts {
		shifts[s.Code] = s
	}
	for _, c := range r.Assignments {
		d, e := time.Parse("2006-01-02", c.Date)
		if e != nil {
			continue
		}
		if holiday[c.Date] || d.Weekday() == time.Saturday || d.Weekday() == time.Sunday {
			for _, p := range shifts[c.ShiftCode].Periods {
				holidayHours[c.NurseID] += float64(p.End-p.Start) / 60
			}
		}
	}
	deviation := 0.0
	night, weekend := []float64{}, []float64{}
	for _, n := range r.Staff {
		if !n.Active {
			continue
		}
		for _, h := range report.Hours {
			if h.NurseID == n.ID {
				deviation += math.Abs(h.Monthly - targets[n.ID])
				night = append(night, h.Night)
				weekend = append(weekend, holidayHours[n.ID])
			}
		}
	}
	spread := func(a []float64) float64 {
		if len(a) == 0 {
			return 0
		}
		lo, hi := a[0], a[0]
		for _, v := range a {
			lo = math.Min(lo, v)
			hi = math.Max(hi, v)
		}
		return hi - lo
	}
	if len(night) > 0 {
		deviation /= float64(len(night))
	}
	old := map[string]string{}
	current := map[string]string{}
	for _, c := range original {
		old[cellKey(c)] = c.ShiftCode
	}
	for _, c := range r.Assignments {
		current[cellKey(c)] = c.ShiftCode
	}
	changed := 0
	for key, code := range old {
		if current[key] != code {
			changed++
		}
	}
	s := domain.FairnessScore{Coverage: 100 / (1 + float64(shortages)), Fairness: 100 / (1 + (deviation+spread(night)+spread(weekend))/24), Preference: 100, Stability: 100}
	if len(r.Policy.Preferences) > 0 {
		s.Preference = 100 * math.Max(0, 1-float64(preferences)/float64(len(r.Policy.Preferences)))
	}
	if len(old) > 0 {
		s.Stability = 100 * math.Max(0, 1-float64(changed)/float64(len(old)))
	}
	w := r.Policy.Weights
	total := w.Coverage + w.Fairness + w.Preference + w.Stability
	if total > 0 {
		s.Total = (w.Coverage*s.Coverage + w.Fairness*s.Fairness + w.Preference*s.Preference + w.Stability*s.Stability) / total
	} else {
		s.Total = (s.Coverage + s.Fairness + s.Preference + s.Stability) / 4.0
	}
	return s
}

// During search only MIN_OFF and coverage can be repaired by filling remaining cells.
func irreparable(report domain.Report) bool {
	for _, v := range report.Violations {
		if v.Severity == "error" && v.RuleCode != "MIN_STAFFING" && v.RuleCode != "MIN_OFF" {
			return true
		}
	}
	return false
}

func solveGreedy(ctx context.Context, in domain.SolverInput) (domain.SolverOutput, error) {
	if in.Snapshot.SchemaVersion != 1 {
		return domain.SolverOutput{}, repository.ErrInput
	}
	r := in.Snapshot.Roster
	r.Leaves = in.Snapshot.Leaves
	if !validation.PolicyValid(r.Policy) || r.Month < 1 || r.Month > 12 || r.Year < 2000 || r.Year > 2200 {
		return domain.SolverOutput{}, repository.ErrInput
	}
	if e := ValidateScope(r, in.Scope); e != nil {
		return domain.SolverOutput{}, e
	}
	duration := in.MaxDuration
	if duration <= 0 || duration > 20*time.Second {
		duration = 20 * time.Second
	}
	ctx, cancel := context.WithTimeout(ctx, duration)
	defer cancel()
	maxNodes := in.MaxNodes
	if maxNodes <= 0 || maxNodes > 30000 {
		maxNodes = 30000
	}
	original := append([]domain.Cell{}, r.Assignments...)
	fixed := []domain.Cell{}
	old := map[string]domain.Cell{}
	for _, c := range original {
		old[cellKey(c)] = c
		if !inScope(c, in.Scope) {
			fixed = append(fixed, c)
		}
	}
	type slot struct {
		cell    domain.Cell
		choices []string
	}
	slots := []slot{}
	a, b := monthRange(r)
	staff := append([]domain.Staff{}, r.Staff...)
	sort.Slice(staff, func(i, j int) bool { return staff[i].ID < staff[j].ID })
	for d := a; d.Before(b); d = d.AddDate(0, 0, 1) {
		for _, n := range staff {
			if !n.Active {
				continue
			}
			c := domain.Cell{NurseID: n.ID, Date: d.Format("2006-01-02"), Version: 1}
			if x, ok := old[cellKey(c)]; ok {
				c = x
			}
			// เมื่อ AllowPartTime เป็น false (AUTO flow) บุคลากร Part-time ที่ไม่ได้ถูกล็อกจะไม่ถูกนำมาสร้าง slot
			if !in.AllowPartTime && n.PartTime && !c.Locked {
				continue
			}
			if !inScope(c, in.Scope) {
				continue
			}
			choices := []string{}
			for _, sh := range r.Shifts {
				if sh.Code == "บด" || sh.Code == "อบ" || sh.Code == "บห" {
					continue
				}
				allowed := sh.Code == "X" || sh.Code == "L"
				for _, v := range n.Allowed {
					if v == sh.Code {
						allowed = true
					}
				}
				if allowed && (!sh.Double || n.Double) {
					choices = append(choices, sh.Code)
				}
			}
			sort.Strings(choices)
			slots = append(slots, slot{c, choices})
		}
	}
	out := domain.SolverOutput{Status: "infeasible", Assignments: fixed, Violations: []domain.RuleViolation{}}
	r.Assignments = fixed
	if irreparable(validation.Validate(r, original)) {
		out.Violations = validation.Validate(r, original).Violations
		out.Diagnostics.Exhausted = true
		out.Diagnostics.Reason = "fixed assignments violate a hard constraint"
		return out, nil
	}

	shiftMap := map[string]domain.RosterShift{}
	shiftHoursMap := map[string]float64{}
	for _, sh := range r.Shifts {
		shiftMap[sh.Code] = sh
		totMins := 0
		for _, p := range sh.Periods {
			totMins += (p.End - p.Start)
		}
		shiftHoursMap[sh.Code] = float64(totMins) / 60.0
	}

	targetsMap := map[string]domain.Target{}
	for _, t := range r.Policy.Targets {
		targetsMap[t.NurseID] = t
	}

	prefMap := map[string]map[string]bool{} // nurseID -> date -> avoid
	prefShiftMap := map[string]map[string]string{}
	for _, p := range r.Policy.Preferences {
		if prefMap[p.NurseID] == nil {
			prefMap[p.NurseID] = map[string]bool{}
			prefShiftMap[p.NurseID] = map[string]string{}
		}
		prefMap[p.NurseID][p.Date] = p.Avoid
		prefShiftMap[p.NurseID][p.Date] = p.ShiftCode
	}

	leavesMap := map[string]map[string]bool{}
	for _, l := range r.Leaves {
		if !l.Approved {
			continue
		}
		if leavesMap[l.NurseID] == nil {
			leavesMap[l.NurseID] = map[string]bool{}
		}
		st, e1 := time.Parse("2006-01-02", l.Start)
		en, e2 := time.Parse("2006-01-02", l.End)
		if e1 == nil && e2 == nil {
			for ld := st; !ld.After(en); ld = ld.AddDate(0, 0, 1) {
				leavesMap[l.NurseID][ld.Format("2006-01-02")] = true
			}
		}
	}

	isNightShift := func(code string) bool {
		return code == "ด" || code == "N" || code == "Night" || code == "12N" || code == "ชด" || code == "บด"
	}
	isMorningShift := func(code string) bool {
		return code == "ช" || code == "Day" || code == "D" || code == "12D" || code == "ชบ" || code == "ชด"
	}
	isEveningShift := func(code string) bool {
		return code == "บ" || code == "ชบ" || code == "บด"
	}
	containsCode := func(slice []string, val string) bool {
		for _, s := range slice {
			if s == val {
				return true
			}
		}
		return false
	}


	consecutiveDays := map[string]int{}
	consecutiveNights := map[string]int{}
	consecutiveDoubles := map[string]int{}
	daysSinceLastNight := map[string]int{}
	consecutiveOff := map[string]int{}
	monthlyHours := map[string]float64{}
	offDays := map[string]int{}
	morningShiftsCount := map[string]int{}
	eveShiftsCount := map[string]int{}
	nightShiftsCount := map[string]int{}
	doubleShiftsCount := map[string]int{}
	twelveShiftsCount := map[string]int{}
	lastShiftCode := map[string]string{}

	numDays := 0
	for td := a; td.Before(b); td = td.AddDate(0, 0, 1) {
		numDays++
	}

	nurseLeavesCount := map[string]int{}
	for _, c := range fixed {
		if c.ShiftCode == "L" || c.ShiftCode == "Va" || c.ShiftCode == "V" || c.ShiftCode == "v" {
			nurseLeavesCount[c.NurseID]++
		}
	}
	for nid, lmap := range leavesMap {
		if len(lmap) > nurseLeavesCount[nid] {
			nurseLeavesCount[nid] = len(lmap)
		}
	}

	workingDaysBase := r.Policy.Compensation.WorkingDays
	if workingDaysBase <= 0 {
		wCount := 0
		for td := a; td.Before(b); td = td.AddDate(0, 0, 1) {
			if td.Weekday() != time.Saturday && td.Weekday() != time.Sunday {
				wCount++
			}
		}
		workingDaysBase = wCount
		if workingDaysBase <= 0 {
			workingDaysBase = 22
		}
	}
	baselineTargetHours := float64(workingDaysBase * 8)

	rnCount := 0
	pnCount := 0
	for _, n := range staff {
		if n.Active && (in.AllowPartTime || !n.PartTime) {
			if n.Position == "RN" {
				rnCount++
			} else if n.Position == "PN" {
				pnCount++
			}
		}
	}
	if rnCount == 0 {
		rnCount = 1
	}
	if pnCount == 0 {
		pnCount = 1
	}

	dailyRNMorn, dailyRNEve, dailyRNNight := 0, 0, 0
	dailyPNMorn, dailyPNEve, dailyPNNight := 0, 0, 0
	for _, st := range r.Policy.Staffing {
		if st.Start >= 480 && st.End <= 960 {
			dailyRNMorn += st.RN + st.Leaders
			dailyPNMorn += st.PN
		} else if st.Start >= 960 && st.End <= 1440 {
			dailyRNEve += st.RN + st.Leaders
			dailyPNEve += st.PN
		} else if st.Start == 0 && st.End <= 480 {
			dailyRNNight += st.RN + st.Leaders
			dailyPNNight += st.PN
		}
	}
	if dailyRNMorn == 0 && dailyPNMorn == 0 {
		dailyRNMorn = 1
		dailyPNMorn = 1
	}
	if dailyRNEve == 0 && dailyPNEve == 0 {
		dailyRNEve = 2
	}
	if dailyRNNight == 0 && dailyPNNight == 0 {
		dailyRNNight = 1
	}

	rnTargetMorns := float64(numDays*dailyRNMorn) / float64(rnCount)
	rnTargetEves := float64(numDays*dailyRNEve) / float64(rnCount)
	rnTargetNights := float64(numDays*dailyRNNight) / float64(rnCount)

	pnTargetMorns := float64(numDays*dailyPNMorn) / float64(pnCount)
	pnTargetEves := float64(numDays*dailyPNEve) / float64(pnCount)
	pnTargetNights := float64(numDays*dailyPNNight) / float64(pnCount)

	// Helper to calculate exact rest hours between two shifts across midnight
	isValidRest := func(prevCode, nextCode string) bool {
		if prevCode == "" || prevCode == "X" || prevCode == "L" || prevCode == "OFF" || prevCode == "Va" {
			return true
		}
		if nextCode == "" || nextCode == "X" || nextCode == "L" || nextCode == "OFF" || nextCode == "Va" {
			return true
		}
		// Rule 1: เวรดึกต่อเช้า ไม่สามารถทำได้ (Night shift cannot be followed by Morning shift on the next day)
		if isNightShift(prevCode) && isMorningShift(nextCode) {
			return false
		}
		// Rule 2: ห้ามจัดเวร ดึก ต่อด้วย บ่าย (Night cannot be followed by Evening on the next day)
		if isNightShift(prevCode) && isEveningShift(nextCode) {
			return false
		}
		// Rule 3: ห้ามจัดเวรบ่ายต่อด้วยเวรดึก (เวรบ่ายต่อดึก 00:00-08:00)
		if isEveningShift(prevCode) && (nextCode == "ด" || nextCode == "ชด" || nextCode == "บด") {
			return false
		}

		prevSh, ok1 := shiftMap[prevCode]
		nextSh, ok2 := shiftMap[nextCode]
		if !ok1 || !ok2 || len(prevSh.Periods) == 0 || len(nextSh.Periods) == 0 {
			return true
		}

		latestEnd := 0
		for _, p := range prevSh.Periods {
			if p.End > latestEnd {
				latestEnd = p.End
			}
		}

		earliestStart := 999999
		for _, p := range nextSh.Periods {
			startOnDayD := 1440 + p.Start
			if startOnDayD < earliestStart {
				earliestStart = startOnDayD
			}
		}

		restMinutes := earliestStart - latestEnd
		return float64(restMinutes)/60.0 >= (r.Policy.MinRestHours - 1e-6)
	}

	maxConsecutiveOff := r.Policy.MaxConsecutiveOffDays
	if maxConsecutiveOff <= 0 {
		maxConsecutiveOff = 2
	}

	for _, n := range staff {
		daysSinceLastNight[n.ID] = 999
		consecutiveDoubles[n.ID] = 0
	}

	// Sort boundary chronologically so latest day (precedingDate) sets lastShiftCode
	sort.SliceStable(r.Boundary, func(i, j int) bool {
		return r.Boundary[i].Date < r.Boundary[j].Date
	})
	for _, bCell := range r.Boundary {
		lastShiftCode[bCell.NurseID] = bCell.ShiftCode
		if bCell.ShiftCode == "X" || bCell.ShiftCode == "" {
			consecutiveDays[bCell.NurseID] = 0
			consecutiveNights[bCell.NurseID] = 0
			consecutiveDoubles[bCell.NurseID] = 0
			consecutiveOff[bCell.NurseID]++
			daysSinceLastNight[bCell.NurseID]++
		} else if bCell.ShiftCode == "L" || bCell.ShiftCode == "Va" || bCell.ShiftCode == "V" {
			consecutiveDays[bCell.NurseID] = 0
			consecutiveNights[bCell.NurseID] = 0
			consecutiveDoubles[bCell.NurseID] = 0
			consecutiveOff[bCell.NurseID] = 0
			daysSinceLastNight[bCell.NurseID]++
		} else {
			consecutiveOff[bCell.NurseID] = 0
			consecutiveDays[bCell.NurseID]++
			if isNightShift(bCell.ShiftCode) {
				consecutiveNights[bCell.NurseID]++
				daysSinceLastNight[bCell.NurseID] = 0
			} else {
				consecutiveNights[bCell.NurseID] = 0
				daysSinceLastNight[bCell.NurseID]++
			}
			if bCell.ShiftCode == "ชบ" || bCell.ShiftCode == "บด" || bCell.ShiftCode == "ชด" {
				consecutiveDoubles[bCell.NurseID]++
			} else {
				consecutiveDoubles[bCell.NurseID] = 0
			}
		}
	}

	scheduledCells := []domain.Cell{}
	fixedMap := map[string]domain.Cell{}
	for _, c := range fixed {
		fixedMap[cellKey(c)] = c
	}

	knownStaff := map[string]bool{}
	for _, n := range staff {
		knownStaff[n.ID] = true
	}

	// Day by Day Scheduling Pass
	nodesCount := 0
	timedOut := false
	dayIndex := 0
	for d := a; d.Before(b); d = d.AddDate(0, 0, 1) {
		ds := d.Format("2006-01-02")
		if ctx.Err() != nil {
			timedOut = true
			break
		}
		if nodesCount >= maxNodes {
			timedOut = true
			break
		}
		dayAssignments := map[string]string{}

		// 1. Assign locked cells & out-of-scope cells
		for _, n := range staff {
			if !n.Active {
				continue
			}
			c := domain.Cell{NurseID: n.ID, Date: ds}
			if fCell, ok := fixedMap[cellKey(c)]; ok {
				dayAssignments[n.ID] = fCell.ShiftCode
			} else if leavesMap[n.ID] != nil && leavesMap[n.ID][ds] {
				dayAssignments[n.ID] = "L"
			}
		}

		activeStaffing := staffingForDate(r, ds)

		// If no staffing policy defined, fallback to default 3 shifts
		if len(activeStaffing) == 0 {
			activeStaffing = []domain.Staffing{
				{Start: 480, End: 960, RN: 1, PN: 1, Leaders: 1},
				{Start: 960, End: 1440, RN: 1, PN: 1, Leaders: 1},
				{Start: 0, End: 480, RN: 1, PN: 0, Leaders: 1},
			}
		}

		// Sort requirements so shifts with strictest constraints are fulfilled first (Night top priority, Leaders, Skills)
		sort.SliceStable(activeStaffing, func(i, j int) bool {
			scoreI := 0
			if activeStaffing[i].Start == 0 { scoreI += 50 }
			if activeStaffing[i].Leaders > 0 { scoreI += 20 }
			scoreI += len(activeStaffing[i].Skills) * 5

			scoreJ := 0
			if activeStaffing[j].Start == 0 { scoreJ += 50 }
			if activeStaffing[j].Leaders > 0 { scoreJ += 20 }
			scoreJ += len(activeStaffing[j].Skills) * 5

			if scoreI != scoreJ {
				return scoreI > scoreJ
			}
			return activeStaffing[i].Start < activeStaffing[j].Start
		})

		// 3. Fulfill each staffing requirement
		for _, req := range activeStaffing {
			// Find standard exact single-period shift for this requirement
			var stdShift domain.RosterShift
			foundStd := false
			for _, sh := range r.Shifts {
				if sh.Code == "X" || sh.Code == "L" || sh.Double || len(sh.Periods) != 1 {
					continue
				}
				if sh.Periods[0].Start == req.Start && sh.Periods[0].End == req.End {
					stdShift = sh
					foundStd = true
					break
				}
			}
			if !foundStd {
				for _, sh := range r.Shifts {
					if sh.Code == "X" || sh.Code == "L" {
						continue
					}
					for _, p := range sh.Periods {
						if p.Start <= req.Start && p.End >= req.End {
							stdShift = sh
							foundStd = true
							break
						}
					}
					if foundStd {
						break
					}
				}
			}
			if !foundStd {
				continue
			}

			shCode := stdShift.Code

			// Calculate currently covered staff for this period
			neededRN := req.RN
			neededPN := req.PN
			neededLeaders := req.Leaders
			assignedCount := 0

			for _, n := range staff {
				assignedCode := dayAssignments[n.ID]
				if assignedCode != "" && assignedCode != "X" && assignedCode != "L" {
					if ash, ok := shiftMap[assignedCode]; ok {
						coversPeriod := false
						for _, ap := range ash.Periods {
							if ap.Start <= req.Start && ap.End >= req.End {
								coversPeriod = true
								break
							}
						}
						if coversPeriod {
							assignedCount++
							if n.Position == "RN" {
								if n.Leader && neededLeaders > 0 {
									neededLeaders--
								} else if neededRN > 0 {
									neededRN--
								}
							} else if n.Position == "PN" {
								if neededPN > 0 {
									neededPN--
								}
							}
						}
					}
				}
			}

			// Cross-period 12h coverage integration:
			// A) If req is Night slot [0..480] on date D: check yesterday's Night shifts!
			if req.Start == 0 && req.End <= 480 {
				for _, n := range staff {
					lCode := lastShiftCode[n.ID]
					if lCode == "Night" || lCode == "N" || lCode == "12N" {
						assignedCount++
						if n.Position == "RN" {
							if n.Leader && neededLeaders > 0 {
								neededLeaders--
							} else if neededRN > 0 {
								neededRN--
							}
						} else if n.Position == "PN" {
							if neededPN > 0 {
								neededPN--
							}
						}
					}
				}
			}

			// B) If req is Evening slot [960..1440] on date D: check paired Day (08-20) + Night (20-08) shifts!
			if req.Start >= 960 && req.End <= 1440 {
				dayRNs, nightRNs := 0, 0
				dayPNs, nightPNs := 0, 0
				dayLead, nightLead := 0, 0
				for _, n := range staff {
					aCode := dayAssignments[n.ID]
					if aCode == "Day" || aCode == "D" || aCode == "12D" {
						if n.Position == "RN" {
							dayRNs++
							if n.Leader { dayLead++ }
						} else if n.Position == "PN" {
							dayPNs++
						}
					} else if aCode == "Night" || aCode == "N" || aCode == "12N" {
						if n.Position == "RN" {
							nightRNs++
							if n.Leader { nightLead++ }
						} else if n.Position == "PN" {
							nightPNs++
						}
					}
				}
				pairedRN := dayRNs
				if nightRNs < pairedRN { pairedRN = nightRNs }
				pairedPN := dayPNs
				if nightPNs < pairedPN { pairedPN = nightPNs }
				pairedLead := dayLead
				if nightLead < pairedLead { pairedLead = nightLead }

				for pairedLead > 0 && neededLeaders > 0 {
					neededLeaders--
					pairedLead--
				}
				for pairedRN > 0 && neededRN > 0 {
					neededRN--
					pairedRN--
				}
				for pairedPN > 0 && neededPN > 0 {
					neededPN--
					pairedPN--
				}
			}

			// Helper to find the best candidate for a specific role and leader requirement
			findCandidateForRole := func(targetRole string, requireLeader bool) (domain.Staff, string, bool) {
				type cand struct {
					nurse     domain.Staff
					score     float64
					shiftCode string
				}
				var pool []cand

				totalLeadersNeededToday := 0
				for _, ar := range activeStaffing {
					totalLeadersNeededToday += ar.Leaders
				}
				assignedLeadersToday := 0
				for _, m := range staff {
					if m.Leader && dayAssignments[m.ID] != "" && dayAssignments[m.ID] != "X" && dayAssignments[m.ID] != "L" {
						assignedLeadersToday++
					}
				}
				remainingLeadersNeededToday := totalLeadersNeededToday - assignedLeadersToday

				hasNightCandidateForRole := func(currNurseID, role string) bool {
					maxNights := r.Policy.MaxConsecutiveNights
					if maxNights <= 0 {
						maxNights = 3
					}
					maxDays := r.Policy.MaxConsecutiveDays
					if maxDays <= 0 {
						maxDays = 6
					}
					for _, m := range staff {
						if m.ID == currNurseID || !m.Active || dayAssignments[m.ID] != "" || m.PartTime || m.Position != role {
							continue
						}
						hasNightAllowed := false
						for _, code := range m.Allowed {
							if code == "Night" || code == "N" || code == "12N" {
								hasNightAllowed = true
								break
							}
						}
						if !hasNightAllowed {
							continue
						}
						lastCode := lastShiftCode[m.ID]
						if !isValidRest(lastCode, "Night") {
							continue
						}
						if consecutiveDays[m.ID] >= maxDays {
							continue
						}
						if consecutiveNights[m.ID] >= maxNights {
							continue
						}
						return true
					}
					return false
				}

				for _, n := range staff {
					if !n.Active || dayAssignments[n.ID] != "" {
						continue
					}
					if n.PartTime {
						continue
					}
					if n.Position != targetRole {
						continue
					}
					if requireLeader && !n.Leader {
						continue
					}

					// Options for this slot: primary standard shift, eligible 12h shifts, and 16h double shifts
					candidateShiftCodes := []string{}
					if req.Start == 0 && req.End <= 480 {
						// Night slot [0..480] on date D: ONLY shifts that cover [0..480] like "ด" (NOT "Night" which starts at 20:00 on Day D)
						candidateShiftCodes = append(candidateShiftCodes, shCode)
						for _, allowedCode := range n.Allowed {
							if allowedCode == "ด" || allowedCode == "ชด" {
								if !containsCode(candidateShiftCodes, allowedCode) {
									candidateShiftCodes = append(candidateShiftCodes, allowedCode)
								}
							}
						}
					} else if req.Start >= 960 && req.End <= 1440 {
						// Evening slot [960..1440] on date D:
						// Count Day shifts vs Night shifts already assigned today for this role
						dayCountRole, nightCountRole := 0, 0
						for _, m := range staff {
							if m.Position == targetRole && dayAssignments[m.ID] != "" {
								mCode := dayAssignments[m.ID]
								if mCode == "Day" || mCode == "D" || mCode == "12D" {
									dayCountRole++
								} else if mCode == "Night" || mCode == "N" || mCode == "12N" {
									nightCountRole++
								}
							}
						}

						if nightCountRole < dayCountRole {
							// Need Night shift to pair with Day shift!
							for _, allowedCode := range n.Allowed {
								if allowedCode == "Night" || allowedCode == "N" || allowedCode == "12N" {
									candidateShiftCodes = append(candidateShiftCodes, allowedCode)
								}
							}
							if len(candidateShiftCodes) == 0 {
								candidateShiftCodes = append(candidateShiftCodes, shCode)
							}
						} else {
							candidateShiftCodes = append(candidateShiftCodes, shCode)
						}
					} else if req.Start == 480 && req.End == 960 {
						// Morning slot [480..960] on date D:
						candidateShiftCodes = append(candidateShiftCodes, shCode)
						dayLeadCount := 0
						for _, m := range staff {
							if m.Leader && dayAssignments[m.ID] != "" {
								mCode := dayAssignments[m.ID]
								if mCode == "Day" || mCode == "D" || mCode == "12D" {
									dayLeadCount++
								}
							}
						}
						eveningNeedsLeader := false
						hasEveningReq := false
						for _, ar := range activeStaffing {
							if ar.Start >= 960 && ar.End <= 1440 {
								if ar.RN > 0 || ar.Leaders > 0 || ar.PN > 0 {
									hasEveningReq = true
								}
								if ar.Leaders > 0 {
									eveningNeedsLeader = true
								}
							}
						}
						if hasEveningReq && (n.Leader || dayLeadCount > 0 || !eveningNeedsLeader) && hasNightCandidateForRole(n.ID, n.Position) {
							for _, allowedCode := range n.Allowed {
								if allowedCode == "Day" || allowedCode == "D" || allowedCode == "12D" {
									if !containsCode(candidateShiftCodes, allowedCode) {
										candidateShiftCodes = append(candidateShiftCodes, allowedCode)
									}
								}
							}
						}
					} else {
						candidateShiftCodes = append(candidateShiftCodes, shCode)
					}

					if req.Start == 480 && req.End == 960 {
						for _, allowedCode := range n.Allowed {
							if allowedCode == "ชบ" && (!n.Double || doubleShiftsCount[n.ID] < r.Policy.MaxDoubleShifts) {
								if !containsCode(candidateShiftCodes, "ชบ") {
									candidateShiftCodes = append(candidateShiftCodes, "ชบ")
								}
							}
						}
					}

					for _, optCode := range candidateShiftCodes {
						optShift, hasOpt := shiftMap[optCode]
						if !hasOpt {
							continue
						}
						optHours := shiftHoursMap[optCode]
						if optHours <= 0 {
							optHours = 8.0
						}
						optIsNight := isNightShift(optCode)

						// Check nurse permission for this shift
						allowed := false
						for _, code := range n.Allowed {
							if code == optCode {
								allowed = true
								break
							}
						}
						if !allowed {
							continue
						}
						if optShift.Double && !n.Double {
							continue
						}

						// 1. HARD CONSTRAINT: Rest hours check between yesterday and today
						lastCode := lastShiftCode[n.ID]
						if !isValidRest(lastCode, optCode) {
							continue
						}

						// 2. HARD CONSTRAINT: Rest hours check with tomorrow if tomorrow has leave or locked shift
						tomorrowDate := d.AddDate(0, 0, 1).Format("2006-01-02")
						if leavesMap[n.ID] != nil && leavesMap[n.ID][tomorrowDate] {
							if !isValidRest(optCode, "L") {
								continue
							}
						}
						if fTomCell, ok := fixedMap[cellKey(domain.Cell{NurseID: n.ID, Date: tomorrowDate})]; ok {
							if !isValidRest(optCode, fTomCell.ShiftCode) {
								continue
							}
						}

						// 3. HARD CONSTRAINT: Consecutive days and nights
						maxDays := r.Policy.MaxConsecutiveDays
						if maxDays <= 0 {
							maxDays = 6
						}
						if consecutiveDays[n.ID] >= maxDays {
							continue
						}

						maxNights := r.Policy.MaxConsecutiveNights
						if maxNights <= 0 {
							maxNights = 3
						}
						if optIsNight && consecutiveNights[n.ID] >= maxNights {
							continue
						}

						// 4. HARD CONSTRAINT: Night Cooldown (Strictly BAN "ด ด x ด" / "N N x N")
						// After completing a night shift block, staff must have at least 3 days cooldown before starting a new night block.
						if optIsNight && consecutiveNights[n.ID] == 0 && daysSinceLastNight[n.ID] < 3 {
							continue
						}

						// 5. HARD CONSTRAINT: Consecutive Double Shifts Limit (Max 2 consecutive doubles, e.g. ชบ-ชบ)
						if (optShift.Double || optCode == "ชบ" || optCode == "บด" || optCode == "ชด") && consecutiveDoubles[n.ID] >= 2 {
							continue
						}

						if r.Policy.MaxMonthlyHours > 0 && monthlyHours[n.ID]+optHours > r.Policy.MaxMonthlyHours {
							continue
						}

						// Calculate unmet evening requirement for this role on this date
						eveReqNeeded := 0
						for _, ar := range activeStaffing {
							if ar.Start >= 960 && ar.End <= 1440 {
								if targetRole == "RN" {
									eveReqNeeded += ar.RN + ar.Leaders
								} else if targetRole == "PN" {
									eveReqNeeded += ar.PN
								}
							}
						}
						eveAlreadyCovered := 0
						for _, m := range staff {
							if m.Position == targetRole && dayAssignments[m.ID] != "" {
								if msh, ok := shiftMap[dayAssignments[m.ID]]; ok {
									for _, mp := range msh.Periods {
										if mp.Start <= 960 && mp.End >= 1440 {
											eveAlreadyCovered++
											break
										}
									}
								}
							}
						}
						eveRemainingDeficit := eveReqNeeded - eveAlreadyCovered

						// Calculate target double shifts needed per day for this role to balance capacity and guarantee MinOff
						dailyRoleMorn, dailyRoleEve, dailyRoleNight := dailyRNMorn, dailyRNEve, dailyRNNight
						roleStaffCount := rnCount
						if targetRole == "PN" {
							dailyRoleMorn, dailyRoleEve, dailyRoleNight = dailyPNMorn, dailyPNEve, dailyPNNight
							roleStaffCount = pnCount
						}
						targetDoublesToday := 0
						availDayCapacity := roleStaffCount - (2 * dailyRoleNight)
						dayDemand := dailyRoleMorn + dailyRoleEve
						if availDayCapacity < dayDemand {
							// Day demand strictly exceeds available day capacity! Only use double shifts if capacity is truly insufficient.
							targetDoublesToday = dayDemand - availDayCapacity
						}

						maxAllowableDoubles := dailyRoleMorn
						if dailyRoleEve < maxAllowableDoubles {
							maxAllowableDoubles = dailyRoleEve
						}
						if targetDoublesToday > maxAllowableDoubles {
							targetDoublesToday = maxAllowableDoubles
						}

						alreadyAssignedDoublesToday := 0
						for _, m := range staff {
							if m.Position == targetRole && dayAssignments[m.ID] != "" {
								if dayAssignments[m.ID] == "ชบ" || dayAssignments[m.ID] == "บด" || dayAssignments[m.ID] == "ชด" {
									alreadyAssignedDoublesToday++
								}
							}
						}

						alreadyDoubledFromOff := 0
						for _, m := range staff {
							if m.Position == targetRole && dayAssignments[m.ID] != "" {
								if dayAssignments[m.ID] == "ชบ" {
									lCode := lastShiftCode[m.ID]
									if lCode == "X" || lCode == "L" || lCode == "" {
										alreadyDoubledFromOff++
									}
								}
							}
						}

						score := 100.0

						// Leader scoring:
						if requireLeader {
							if n.Leader {
								score += 600.0
							}
						} else {
							if n.Leader && remainingLeadersNeededToday > 0 {
								score -= 800.0
							}
						}

						// Standard monthly target hours leveling (เกลี่ยชั่วโมงทำงานให้ครบเกณฑ์วันทำการ เช่น 22 วัน = 176 ชม.)
						tTarget := baselineTargetHours
						if t, ok := targetsMap[n.ID]; ok && t.Hours > 0 {
							tTarget = t.Hours
						} else if r.Policy.MaxMonthlyHours > 0 && r.Policy.MaxMonthlyHours < tTarget {
							tTarget = r.Policy.MaxMonthlyHours
						}

						leaveCredit := float64(nurseLeavesCount[n.ID]) * 8.0
						effectiveCredit := monthlyHours[n.ID] + leaveCredit
						hourDeficit := tTarget - effectiveCredit

						if hourDeficit > 0 {
							score += hourDeficit * 35.0
						} else {
							score += hourDeficit * 8.0
						}

						// Uniform Monthly Pacing: Prevent accumulating hours too fast in early weeks (avoid burnout and end-of-month idle clusters)
						if numDays > 0 {
							expectedPacingHours := float64(dayIndex+1) * (tTarget / float64(numDays))
							if effectiveCredit > expectedPacingHours+16.0 {
								score -= (effectiveCredit - expectedPacingHours) * 20.0
							}
						}

						// Tier 1 vs Tier 2: heavily prioritize full-time over part-time staff
						if n.PartTime {
							score -= 10000.0
						}

						// Fatigue barrier: stagger OFF days and prevent excessive consecutive days
						cDays := float64(consecutiveDays[n.ID])
						if consecutiveDays[n.ID] >= 5 {
							score -= 180.0
						} else if consecutiveDays[n.ID] >= 4 {
							score -= 100.0
						} else {
							score -= cDays * 30.0
						}

						// Profile configuration
						profile := in.Profile
						if profile == "" {
							profile = "balanced"
						}
						prefAvoidWeight := 200.0
						prefMatchWeight := 80.0
						stdShiftWeight := 150.0
						pairedNightWeight := 180.0
						twelveShiftWeight := 60.0
						doubleShiftWeight := 650.0

						if profile == "coverage_first" {
							stdShiftWeight = 180.0
							prefMatchWeight = 30.0
							prefAvoidWeight = 100.0
						} else if profile == "preference_focused" {
							prefAvoidWeight = 1600.0
							prefMatchWeight = 600.0
						} else if profile == "rest_focused" {
							pairedNightWeight = 250.0
							twelveShiftWeight = 80.0
							doubleShiftWeight = 950.0
							stdShiftWeight = 100.0
						} else if profile == "balanced" {
							stdShiftWeight = 150.0
						}

						// Dynamic OFF Compression: When compressing OFF on shortage (or profile == coverage_first / balanced),
						// if nurse has had >= 1 day off, boost their score so they can fill shifts instead of sitting on a 2nd/3rd OFF day.
						if r.Policy.CompressOffOnShortage || profile == "coverage_first" || profile == "balanced" {
							if consecutiveOff[n.ID] >= 1 {
								score += float64(consecutiveOff[n.ID]) * 450.0
							}
						} else {
							if consecutiveOff[n.ID] >= maxConsecutiveOff {
								score += float64(consecutiveOff[n.ID]-maxConsecutiveOff+1) * 350.0
							}
						}

						// Leveling: standard vs 12h/16h shift incentives
						if optShift.Double || optCode == "ชบ" {
							targetDoublesPerNurse := float64(numDays*targetDoublesToday) / float64(roleStaffCount)
							if float64(doubleShiftsCount[n.ID]) >= targetDoublesPerNurse {
								score -= (float64(doubleShiftsCount[n.ID]) - targetDoublesPerNurse + 1.0) * 150.0
							} else {
								score += (targetDoublesPerNurse - float64(doubleShiftsCount[n.ID])) * 120.0
							}

							if targetDoublesToday > 0 && alreadyAssignedDoublesToday < targetDoublesToday && eveRemainingDeficit > 0 && doubleShiftsCount[n.ID] < r.Policy.MaxDoubleShifts {
								score += doubleShiftWeight
							} else {
								score -= 5000.0 // Strictly prevent overstaffing evening with unneeded double shifts and avoid excess OT
							}
						} else if optHours == 12.0 || optCode == "Day" || optCode == "D" || optCode == "Night" || optCode == "N" || optCode == "12D" || optCode == "12N" {
							target12Shifts := tTarget / 12.0
							if target12Shifts <= 0 {
								target12Shifts = float64(numDays) / 2.0
							}
							if float64(twelveShiftsCount[n.ID]) < target12Shifts {
								score += twelveShiftWeight + (target12Shifts-float64(twelveShiftsCount[n.ID]))*5.0
							} else {
								score -= (float64(twelveShiftsCount[n.ID]) - target12Shifts + 1.0) * 100.0
							}
							if optIsNight {
								// Pairing bonus: if someone today already has Day assigned, reward Night to complete 24h cycle
								hasDayToday := false
								for _, m := range staff {
									if m.Position == targetRole && (dayAssignments[m.ID] == "Day" || dayAssignments[m.ID] == "D" || dayAssignments[m.ID] == "12D") {
										hasDayToday = true
										break
									}
								}
								if hasDayToday {
									score += pairedNightWeight // Complete 24h paired cycle
								}
							}
						} else {
							score += stdShiftWeight // Standard 8h shift
						}

						// Shift Quota Fairness Penalties (Role-Specific)
						targetMorns := rnTargetMorns
						targetEves := rnTargetEves
						targetNights := rnTargetNights
						if n.Position == "PN" {
							targetMorns = pnTargetMorns
							targetEves = pnTargetEves
							targetNights = pnTargetNights
						}

						if optIsNight {
							// Night block continuity: If nurse is already on Night (and within max nights),
							// strongly encourage continuing the night block to avoid blocking multiple nurses across days.
							if consecutiveNights[n.ID] > 0 && consecutiveNights[n.ID] < maxNights {
								score += 550.0
							}
							// Soft leveling penalty - filling required night shifts ALWAYS takes precedence
							if float64(nightShiftsCount[n.ID]) >= targetNights {
								score -= (float64(nightShiftsCount[n.ID]) - targetNights + 1.0) * 40.0
							} else {
								score += (targetNights - float64(nightShiftsCount[n.ID])) * 120.0
							}
						}
						if optCode == "บ" {
							if float64(eveShiftsCount[n.ID]) >= targetEves {
								score -= (float64(eveShiftsCount[n.ID]) - targetEves + 1.0) * 120.0
							} else {
								score += (targetEves - float64(eveShiftsCount[n.ID])) * 40.0
							}
						}
						if optCode == "ช" || optCode == "ชบ" || optCode == "Day" || optCode == "D" || optCode == "12D" {
							if float64(morningShiftsCount[n.ID]) >= targetMorns {
								score -= (float64(morningShiftsCount[n.ID]) - targetMorns + 1.0) * 80.0
							} else {
								score += (targetMorns - float64(morningShiftsCount[n.ID])) * 40.0
							}
						}

						// Ergonomic Forward Rotation Bonus
						if lastCode == "ช" || lastCode == "Day" || lastCode == "D" || lastCode == "12D" {
							if optCode == "ช" || optCode == "Day" || optCode == "D" || optCode == "12D" {
								score += 30.0
							} else if optCode == "ชบ" {
								score += 25.0
							} else if optCode == "บ" {
								score += 35.0
							} else if optCode == "ด" || optCode == "Night" || optCode == "N" || optCode == "12N" {
								score += 60.0 // Day/Morning to Night rotation
							}
						} else if lastCode == "ชบ" {
							if optCode == "บ" {
								score += 60.0 // 16h rest from midnight to 16:00
							} else if optCode == "ช" || optCode == "Day" || optCode == "D" || optCode == "12D" {
								score += 40.0 // 8h rest from midnight to 08:00
							}
						} else if lastCode == "บ" {
							if optCode == "บ" {
								score += 30.0
							} else if optCode == "ด" || optCode == "Night" || optCode == "N" || optCode == "12N" {
								score += 45.0 // บ่ายต่อดึก
							} else if optCode == "ช" || optCode == "Day" || optCode == "D" || optCode == "12D" {
								score += 25.0 // 8h rest from midnight to 08:00
							} else if optCode == "ชบ" {
								score += 25.0
							}
						} else if lastCode == "ด" || lastCode == "Night" || lastCode == "N" || lastCode == "12N" {
							if optCode == "ด" || optCode == "Night" || optCode == "N" || optCode == "12N" {
								if consecutiveNights[n.ID] < 2 {
									score += 500.0 // Complete standard 2-night block without breaking
								} else {
									score -= 500.0 // Strongly discourage 3rd+ consecutive night
								}
							}
						} else if lastCode == "X" || lastCode == "L" || lastCode == "" {
							if optCode == "ด" || optCode == "Night" || optCode == "N" || optCode == "12N" {
								score += 80.0 // Fresh nurse after OFF can start Night block
							} else if optCode == "ช" || optCode == "Day" || optCode == "D" || optCode == "12D" {
								score += 35.0
							} else if optCode == "ชบ" {
								score += 35.0
							} else {
								score += 20.0
							}
						}

						// Preferences
						if prefShiftMap[n.ID] != nil && prefShiftMap[n.ID][ds] == optCode {
							if prefMap[n.ID][ds] {
								score -= prefAvoidWeight // Avoid
							} else {
								score += prefMatchWeight // Preferred
							}
						}

						pool = append(pool, cand{nurse: n, score: score, shiftCode: optCode})
					}
				}

				if len(pool) == 0 {
					// Fallback: loosen soft quotas to fulfill MIN_STAFFING, but never violate hard constraints (rest hours, max consecutive days/nights)
					for _, n := range staff {
						if !n.Active || dayAssignments[n.ID] != "" {
							continue
						}
						if n.PartTime {
							continue
						}
						if n.Position != targetRole {
							continue
						}
						if requireLeader && !n.Leader {
							continue
						}

						candidateCodes := []string{}
						if req.Start == 0 && req.End <= 480 {
							candidateCodes = append(candidateCodes, shCode)
							for _, allowedCode := range n.Allowed {
								if allowedCode == "ด" || allowedCode == "ชด" {
									if !containsCode(candidateCodes, allowedCode) {
										candidateCodes = append(candidateCodes, allowedCode)
									}
								}
							}
						} else if req.Start >= 960 && req.End <= 1440 {
							dayCountRole, nightCountRole := 0, 0
							for _, m := range staff {
								if m.Position == targetRole && dayAssignments[m.ID] != "" {
									mCode := dayAssignments[m.ID]
									if mCode == "Day" || mCode == "D" || mCode == "12D" {
										dayCountRole++
									} else if mCode == "Night" || mCode == "N" || mCode == "12N" {
										nightCountRole++
									}
								}
							}
							if nightCountRole < dayCountRole {
								for _, allowedCode := range n.Allowed {
									if allowedCode == "Night" || allowedCode == "N" || allowedCode == "12N" {
										candidateCodes = append(candidateCodes, allowedCode)
									}
								}
								if len(candidateCodes) == 0 {
									candidateCodes = append(candidateCodes, shCode)
								}
							} else {
								candidateCodes = append(candidateCodes, shCode)
							}
						} else if req.Start == 480 && req.End == 960 {
							candidateCodes = append(candidateCodes, shCode)
							dayLeadCount := 0
							for _, m := range staff {
								if m.Leader && dayAssignments[m.ID] != "" {
									mCode := dayAssignments[m.ID]
									if mCode == "Day" || mCode == "D" || mCode == "12D" {
										dayLeadCount++
									}
								}
							}
							eveningNeedsLeader := false
							hasEveningReq := false
							for _, ar := range activeStaffing {
								if ar.Start >= 960 && ar.End <= 1440 {
									if ar.RN > 0 || ar.Leaders > 0 || ar.PN > 0 {
										hasEveningReq = true
									}
									if ar.Leaders > 0 {
										eveningNeedsLeader = true
									}
								}
							}
							if hasEveningReq && (n.Leader || dayLeadCount > 0 || !eveningNeedsLeader) && hasNightCandidateForRole(n.ID, n.Position) {
								for _, allowedCode := range n.Allowed {
									if allowedCode == "Day" || allowedCode == "D" || allowedCode == "12D" {
										if !containsCode(candidateCodes, allowedCode) {
											candidateCodes = append(candidateCodes, allowedCode)
										}
									}
								}
							}
						} else {
							candidateCodes = append(candidateCodes, shCode)
						}

						if req.Start == 480 && req.End == 960 {
							for _, allowedCode := range n.Allowed {
								if allowedCode == "ชบ" && (!n.Double || doubleShiftsCount[n.ID] < r.Policy.MaxDoubleShifts) {
									if !containsCode(candidateCodes, "ชบ") {
										candidateCodes = append(candidateCodes, "ชบ")
									}
								}
							}
						}

						for _, fCode := range candidateCodes {
							allowed := false
							for _, code := range n.Allowed {
								if code == fCode {
									allowed = true
									break
								}
							}
							if !allowed {
								continue
							}
							fSh, hasF := shiftMap[fCode]
							if hasF && fSh.Double && !n.Double {
								continue
							}
							lastCode := lastShiftCode[n.ID]
							if !isValidRest(lastCode, fCode) {
								continue
							}
							if r.Policy.MaxConsecutiveDays > 0 && consecutiveDays[n.ID] >= r.Policy.MaxConsecutiveDays {
								continue
							}
							if isNightShift(fCode) && r.Policy.MaxConsecutiveNights > 0 && consecutiveNights[n.ID] >= r.Policy.MaxConsecutiveNights {
								continue
							}
							if isNightShift(fCode) && consecutiveNights[n.ID] == 0 && daysSinceLastNight[n.ID] < 3 {
								continue
							}
							if (fCode == "ชบ" || fCode == "บด" || fCode == "ชด" || (hasF && fSh.Double)) && consecutiveDoubles[n.ID] >= 2 {
								continue
							}
							if r.Policy.MaxMonthlyHours > 0 && monthlyHours[n.ID]+shiftHoursMap[fCode] > r.Policy.MaxMonthlyHours {
								continue
							}
							fScore := 50.0
							if consecutiveOff[n.ID] >= 1 {
								fScore += float64(consecutiveOff[n.ID]) * 200.0
							}
							if fCode == "ชบ" {
								fScore -= 5000.0
							}
							if requireLeader {
								if n.Leader {
									fScore += 600.0
								}
							} else {
								if n.Leader && remainingLeadersNeededToday > 0 {
									fScore -= 800.0
								}
							}
							if n.PartTime {
								fScore = -10000.0
							}
							pool = append(pool, cand{nurse: n, score: fScore, shiftCode: fCode})
						}
					}
				}

				if len(pool) == 0 {
					return domain.Staff{}, "", false
				}

				sort.Slice(pool, func(i, j int) bool {
					return pool[i].score > pool[j].score
				})

				for _, c := range pool {
					if candidateSafe(r, scheduledCells, dayAssignments, fixedMap, c.nurse, ds, c.shiftCode) {
						return c.nurse, c.shiftCode, true
					}
				}

				return domain.Staff{}, "", false
			}

			// 1. Assign Leader RNs
			for neededLeaders > 0 {
				selNurse, selCode, found := findCandidateForRole("RN", true)
				if !found {
					break
				}
				dayAssignments[selNurse.ID] = selCode
				neededLeaders--
			}

			// 2. Assign regular RNs
			for neededRN > 0 {
				selNurse, selCode, found := findCandidateForRole("RN", false)
				if !found {
					break
				}
				dayAssignments[selNurse.ID] = selCode
				neededRN--
			}

			// 3. Assign PNs (strictly separated from RNs)
			for neededPN > 0 {
				selNurse, selCode, found := findCandidateForRole("PN", false)
				if !found {
					break
				}
				dayAssignments[selNurse.ID] = selCode
				neededPN--
			}
		}

		// 3.5 Final Day Pass Optimization: Trim excess "ชบ" -> "ช" when Evening shift is overstaffed
		eveReqRN, eveReqLeaders, eveReqPN := 0, 0, 0
		for _, ar := range activeStaffing {
			if ar.Start >= 960 && ar.End <= 1440 {
				eveReqRN += ar.RN
				eveReqLeaders += ar.Leaders
				eveReqPN += ar.PN
			}
		}
		totalEveReqRN := eveReqRN + eveReqLeaders
		totalEveReqRNFloat := float64(totalEveReqRN)
		eveReqPNFloat := float64(eveReqPN)
		eveReqLeadersFloat := float64(eveReqLeaders)

		currentEveRN := 0.0
		currentEveLeaders := 0.0
		currentEvePN := 0.0

		for _, n := range staff {
			if !n.Active {
				continue
			}
			code := strings.TrimSpace(dayAssignments[n.ID])
			if code == "" || code == "X" || code == "x" || code == "L" || code == "V" || code == "v" || code == "Va" {
				continue
			}
			weight := 0.0
			if code == "บ" || code == "ชบ" || code == "บด" {
				weight = 1.0
			} else if code == "D" || code == "Day" || code == "12D" || code == "N" || code == "Night" || code == "12N" {
				weight = 0.5
			}
			if weight > 0 {
				if n.Position == "RN" {
					currentEveRN += weight
					if n.Leader {
						currentEveLeaders += weight
					}
				} else if n.Position == "PN" {
					currentEvePN += weight
				}
			}
		}

		// Trim excess RN in Evening: downgrade unlocked "ชบ" -> "ช"
		// As per hospital rule: If target is 4, allow 3.5 (do not exceed 4.0).
		// Trim whenever currentEveRN > target (e.g. 4.5 -> 3.5 <= 4.0).
		if currentEveRN > totalEveReqRNFloat + 0.001 {
			// Pass 1: Non-leader RNs
			for _, n := range staff {
				if currentEveRN <= totalEveReqRNFloat + 0.001 {
					break
				}
				if !n.Active || n.Position != "RN" || n.Leader {
					continue
				}
				if dayAssignments[n.ID] != "ชบ" {
					continue
				}
				c := domain.Cell{NurseID: n.ID, Date: ds}
				if fCell, ok := fixedMap[cellKey(c)]; ok && fCell.Locked {
					continue
				}
				dayAssignments[n.ID] = "ช"
				currentEveRN -= 1.0
			}

			// Pass 2: Leader RNs (only if remaining evening leaders >= eveReqLeaders)
			for _, n := range staff {
				if currentEveRN <= totalEveReqRNFloat + 0.001 {
					break
				}
				if !n.Active || n.Position != "RN" || !n.Leader {
					continue
				}
				if dayAssignments[n.ID] != "ชบ" {
					continue
				}
				c := domain.Cell{NurseID: n.ID, Date: ds}
				if fCell, ok := fixedMap[cellKey(c)]; ok && fCell.Locked {
					continue
				}
				if currentEveLeaders > eveReqLeadersFloat + 0.001 {
					dayAssignments[n.ID] = "ช"
					currentEveRN -= 1.0
					currentEveLeaders -= 1.0
				}
			}
		}

		// Trim excess PN in Evening: downgrade unlocked "ชบ" -> "ช"
		if currentEvePN > eveReqPNFloat + 0.001 {
			for _, n := range staff {
				if currentEvePN <= eveReqPNFloat + 0.001 {
					break
				}
				if !n.Active || n.Position != "PN" {
					continue
				}
				if dayAssignments[n.ID] != "ชบ" {
					continue
				}
				c := domain.Cell{NurseID: n.ID, Date: ds}
				if fCell, ok := fixedMap[cellKey(c)]; ok && fCell.Locked {
					continue
				}
				dayAssignments[n.ID] = "ช"
				currentEvePN -= 1.0
			}
		}

		// 4. Assign OFF ("X") to remaining active nurses
		for _, n := range staff {
			if !n.Active {
				continue
			}
			code, ok := dayAssignments[n.ID]
			if !ok || code == "" {
				code = "X"
				dayAssignments[n.ID] = "X"
			}

			// Update state counters for tomorrow
			if code == "X" || code == "x" || code == "อ" {
				consecutiveDays[n.ID] = 0
				consecutiveNights[n.ID] = 0
				consecutiveDoubles[n.ID] = 0
				daysSinceLastNight[n.ID]++
				if leavesMap[n.ID] != nil && leavesMap[n.ID][ds] {
					consecutiveOff[n.ID] = 0
				} else {
					consecutiveOff[n.ID]++
				}
				offDays[n.ID]++
			} else if code == "L" || code == "Va" || code == "V" || code == "v" {
				consecutiveDays[n.ID] = 0
				consecutiveNights[n.ID] = 0
				consecutiveDoubles[n.ID] = 0
				daysSinceLastNight[n.ID]++
				consecutiveOff[n.ID] = 0
				offDays[n.ID]++
			} else {
				consecutiveOff[n.ID] = 0
				consecutiveDays[n.ID]++
				if isNightShift(code) {
					consecutiveNights[n.ID]++
					nightShiftsCount[n.ID]++
					daysSinceLastNight[n.ID] = 0
				} else {
					consecutiveNights[n.ID] = 0
					daysSinceLastNight[n.ID]++
				}
				if isEveningShift(code) {
					eveShiftsCount[n.ID]++
				}
				if isMorningShift(code) {
					morningShiftsCount[n.ID]++
				}
				if code == "ชบ" || code == "บด" || code == "ชด" || (shiftMap[code].Double) {
					doubleShiftsCount[n.ID]++
					consecutiveDoubles[n.ID]++
				} else {
					consecutiveDoubles[n.ID] = 0
				}
				if code == "Day" || code == "D" || code == "Night" || code == "N" {
					twelveShiftsCount[n.ID]++
				}
				monthlyHours[n.ID] += shiftHoursMap[code]
			}
			lastShiftCode[n.ID] = code

			c := domain.Cell{
				NurseID:   n.ID,
				Date:      ds,
				ShiftCode: code,
				Version:   1,
			}
			if fCell, hasFix := fixedMap[cellKey(c)]; hasFix {
				c = fCell
			}
			scheduledCells = append(scheduledCells, c)
			nodesCount++
		}
		dayIndex++
	}

	// Ensure all staff (including any virtual PT staff) have a cell for all days in month
	cellIndex := map[string]bool{}
	for _, c := range scheduledCells {
		cellIndex[c.NurseID+"|"+c.Date] = true
	}
	for _, n := range staff {
		for td := a; td.Before(b); td = td.AddDate(0, 0, 1) {
			dateStr := td.Format("2006-01-02")
			if !cellIndex[n.ID+"|"+dateStr] {
				scheduledCells = append(scheduledCells, domain.Cell{
					NurseID:   n.ID,
					Date:      dateStr,
					ShiftCode: "X",
					Version:   1,
				})
			}
		}
	}

	scheduledCells = guaranteeMinWorkingDays(r, scheduledCells)
	scheduledCells = pruneExcessDoubles(r, scheduledCells)

	testRoster := r
	testRoster.Staff = staff
	testRoster.Assignments = scheduledCells
	report := validation.Validate(testRoster, original)

	hasErrors := false
	for _, v := range report.Violations {
		if v.Severity == "error" {
			hasErrors = true
			break
		}
	}

	if timedOut {
		out.Status = "timeout"
	} else if !hasErrors && report.CanSave {
		out.Status = "complete"
	} else {
		out.Status = "partial"
	}

	// Count total Part-Time shifts assigned (registered + virtual)
	ptShiftsCount := 0
	for _, c := range scheduledCells {
		if c.ShiftCode != "X" && c.ShiftCode != "L" && c.ShiftCode != "" {
			for _, s := range staff {
				if s.ID == c.NurseID && s.PartTime {
					ptShiftsCount++
					break
				}
			}
		}
	}

	out.Assignments = scheduledCells
	out.Violations = report.Violations
	out.Score = Score(testRoster, original)
	out.Diagnostics.Nodes = nodesCount
	out.Diagnostics.Exhausted = !timedOut
	out.Diagnostics.PartTimeShifts = ptShiftsCount
	if in.Profile == "" {
		out.Profile = "balanced"
	} else {
		out.Profile = in.Profile
	}
	metrics := CalculatePlanMetrics(testRoster, scheduledCells)
	out.Metrics = &metrics

	return out, nil
}

// CalculatePlanMetrics computes comparison metrics across alternative plans
func CalculatePlanMetrics(r domain.Roster, assignments []domain.Cell) domain.PlanMetrics {
	fairness := Score(r, assignments)

	cellMap := make(map[string]string)
	nurseHours := make(map[string]float64)
	twelveCount := 0
	doubleCount := 0

	shiftHours := make(map[string]float64)
	for _, s := range r.Shifts {
		h := 0.0
		for _, p := range s.Periods {
			dur := p.End - p.Start
			if dur < 0 {
				dur += 24
			}
			h += float64(dur)
		}
		shiftHours[s.Code] = h
	}
	if _, ok := shiftHours["ช"]; !ok { shiftHours["ช"] = 8 }
	if _, ok := shiftHours["บ"]; !ok { shiftHours["บ"] = 8 }
	if _, ok := shiftHours["ด"]; !ok { shiftHours["ด"] = 8 }
	if _, ok := shiftHours["ชบ"]; !ok { shiftHours["ชบ"] = 16 }
	if _, ok := shiftHours["Day"]; !ok { shiftHours["Day"] = 12 }
	if _, ok := shiftHours["Night"]; !ok { shiftHours["Night"] = 12 }
	if _, ok := shiftHours["D"]; !ok { shiftHours["D"] = 12 }
	if _, ok := shiftHours["N"]; !ok { shiftHours["N"] = 12 }
	if _, ok := shiftHours["12D"]; !ok { shiftHours["12D"] = 12 }
	if _, ok := shiftHours["12N"]; !ok { shiftHours["12N"] = 12 }

	for _, c := range assignments {
		cellMap[c.NurseID+"|"+c.Date] = c.ShiftCode
		if c.ShiftCode == "Day" || c.ShiftCode == "Night" || c.ShiftCode == "D" || c.ShiftCode == "N" || c.ShiftCode == "12D" || c.ShiftCode == "12N" {
			twelveCount++
		}
		if c.ShiftCode == "ชบ" || c.ShiftCode == "บด" || c.ShiftCode == "ชด" {
			doubleCount++
		}
		if h, ok := shiftHours[c.ShiftCode]; ok {
			nurseHours[c.NurseID] += h
		}
	}

	// Preference match rate
	prefTotal := 0
	prefMatch := 0
	for _, p := range r.Policy.Preferences {
		prefTotal++
		cCode := cellMap[p.NurseID+"|"+p.Date]
		if p.Avoid {
			if cCode != p.ShiftCode {
				prefMatch++
			}
		} else {
			if p.ShiftCode == "" {
				if cCode == "X" || cCode == "L" || cCode == "" {
					prefMatch++
				}
			} else if cCode == p.ShiftCode {
				prefMatch++
			}
		}
	}
	prefRate := 100.0
	if prefTotal > 0 {
		prefRate = (float64(prefMatch) / float64(prefTotal)) * 100.0
	}

	// Consecutive OFFs (blocks of >= 2 consecutive off days)
	consecOffBlocks := 0
	start := time.Date(r.Year, time.Month(r.Month), 1, 0, 0, 0, 0, time.UTC)
	end := start.AddDate(0, 1, 0)

	for _, s := range r.Staff {
		if !s.Active || s.PartTime {
			continue
		}
		currentOffRun := 0
		for d := start; d.Before(end); d = d.AddDate(0, 0, 1) {
			ds := d.Format("2006-01-02")
			cCode := cellMap[s.ID+"|"+ds]
			if cCode == "X" || cCode == "L" || cCode == "" {
				currentOffRun++
			} else {
				if currentOffRun >= 2 {
					consecOffBlocks++
				}
				currentOffRun = 0
			}
		}
		if currentOffRun >= 2 {
			consecOffBlocks++
		}
	}

	// Hours stats for full-time active staff
	var hoursList []float64
	minH := 999999.0
	maxH := 0.0
	for _, s := range r.Staff {
		if !s.Active || s.PartTime {
			continue
		}
		h := nurseHours[s.ID]
		hoursList = append(hoursList, h)
		if h < minH {
			minH = h
		}
		if h > maxH {
			maxH = h
		}
	}
	if minH == 999999.0 {
		minH = 0
	}

	stdDev := 0.0
	if len(hoursList) > 0 {
		sum := 0.0
		for _, h := range hoursList {
			sum += h
		}
		mean := sum / float64(len(hoursList))
		varianceSum := 0.0
		for _, h := range hoursList {
			diff := h - mean
			varianceSum += diff * diff
		}
		stdDev = math.Sqrt(varianceSum / float64(len(hoursList)))
	}

	return domain.PlanMetrics{
		FairnessScore:    math.Round(fairness.Total*10) / 10,
		PreferenceRate:   math.Round(prefRate*10) / 10,
		ConsecutiveOffs:  consecOffBlocks,
		TwelveHourShifts: twelveCount,
		DoubleShifts:     doubleCount,
		HoursStdDev:      math.Round(stdDev*10) / 10,
		MaxHours:         maxH,
		MinHours:         minH,
	}
}

// guaranteeMinWorkingDays checks if any active, non-part-time staff member is below their required working days / target hours
// (e.g. 22 shifts / 176 hours, accounting for approved leave credits).
// If so, it scans for safe OFF days where assigning a standard Morning ("ช") or allowable shift does not violate
// rest hours, consecutive constraints, or approved leaves.
func guaranteeMinWorkingDays(r domain.Roster, cells []domain.Cell) []domain.Cell {
	if len(cells) == 0 {
		return cells
	}
	a, b := monthRange(r)
	daysInMonth := int(b.Sub(a).Hours() / 24)
	if daysInMonth < 20 {
		return cells
	}

	out := append([]domain.Cell(nil), cells...)

	workingDaysBase := r.Policy.Compensation.WorkingDays
	if workingDaysBase <= 0 {
		wCount := 0
		for td := a; td.Before(b); td = td.AddDate(0, 0, 1) {
			if td.Weekday() != time.Saturday && td.Weekday() != time.Sunday {
				wCount++
			}
		}
		workingDaysBase = wCount
		if workingDaysBase <= 0 {
			workingDaysBase = 22
		}
	}
	baselineTargetHours := float64(workingDaysBase * 8)

	targetsMap := map[string]domain.Target{}
	for _, t := range r.Policy.Targets {
		targetsMap[t.NurseID] = t
	}

	shiftHoursMap := make(map[string]float64, len(r.Shifts))
	for _, s := range r.Shifts {
		totMins := 0
		for _, p := range s.Periods {
			totMins += (p.End - p.Start)
		}
		shiftHoursMap[s.Code] = float64(totMins) / 60.0
	}

	cellMap := make(map[string]int, len(out))
	nurseAssignments := make(map[string][]domain.Cell)
	for i, c := range out {
		cellMap[c.NurseID+"@"+c.Date] = i
		nurseAssignments[c.NurseID] = append(nurseAssignments[c.NurseID], c)
	}

	getShift := func(nurseID, dateStr string) string {
		if idx, ok := cellMap[nurseID+"@"+dateStr]; ok {
			return out[idx].ShiftCode
		}
		for _, bc := range r.Boundary {
			if bc.NurseID == nurseID && bc.Date == dateStr {
				return bc.ShiftCode
			}
		}
		return ""
	}

	maxConsecutiveDays := r.Policy.MaxConsecutiveDays
	if maxConsecutiveDays <= 0 {
		maxConsecutiveDays = 6
	}

	for _, n := range r.Staff {
		if !n.Active || n.PartTime {
			continue
		}

		tTarget := baselineTargetHours
		if t, ok := targetsMap[n.ID]; ok && t.Hours > 0 {
			tTarget = t.Hours
		}

		// Calculate current total credit hours and off days
		currentHours := 0.0
		leaveDays := 0
		offDays := 0
		for _, c := range nurseAssignments[n.ID] {
			code := out[cellMap[n.ID+"@"+c.Date]].ShiftCode
			if code == "L" || code == "Va" || code == "V" || code == "v" {
				leaveDays++
			} else if code == "X" || code == "x" || code == "อ" || code == "" {
				offDays++
			} else if h, ok := shiftHoursMap[code]; ok && h > 0 {
				currentHours += h
			}
		}
		totalCredit := currentHours + float64(leaveDays*8)

		if totalCredit >= tTarget {
			continue
		}

		minOff := r.Policy.MinOff
		if minOff <= 0 {
			minOff = 4
		}

		neededHours := tTarget - totalCredit
		neededShifts := int(math.Ceil(neededHours / 8.0))

		// Try assigning Morning shift "ช" (or standard shift) on safe OFF ("X") days
		for _, c := range nurseAssignments[n.ID] {
			if neededShifts <= 0 || offDays <= minOff {
				break
			}
			idx := cellMap[n.ID+"@"+c.Date]
			currentCode := out[idx].ShiftCode
			if currentCode != "X" && currentCode != "" {
				continue
			}
			if out[idx].Locked {
				continue
			}
			if r.Policy.MaxMonthlyHours > 0 && currentHours+8.0 > r.Policy.MaxMonthlyHours {
				break
			}

			// Do not overstaff a day that is already fully covered
			dailyAssignedCount := 0
			for _, m := range r.Staff {
				mcode := getShift(m.ID, c.Date)
				if mcode != "" && mcode != "X" && mcode != "x" && mcode != "L" && mcode != "Va" && mcode != "V" && mcode != "v" {
					dailyAssignedCount++
				}
			}
			dailyDemand := 0
			for _, st := range staffingForDate(r, c.Date) {
				dailyDemand += st.RN + st.Leaders + st.PN
			}
			if dailyDemand > 0 && dailyAssignedCount >= dailyDemand {
				continue
			}

			// Check shift permissions
			allowedMorning := false
			for _, allowedCode := range n.Allowed {
				if allowedCode == "ช" {
					allowedMorning = true
					break
				}
			}
			if !allowedMorning {
				continue
			}

			curDate, err := time.Parse("2006-01-02", c.Date)
			if err != nil {
				continue
			}
			prevDateStr := curDate.AddDate(0, 0, -1).Format("2006-01-02")
			prevCode := getShift(n.ID, prevDateStr)

			// Rest hours validation: Night before Morning is illegal
			if prevCode == "ด" || prevCode == "N" || prevCode == "Night" || prevCode == "12N" || prevCode == "บด" || prevCode == "ชด" {
				continue
			}

			// Consecutive days check
			consec := 1
			for b := 1; b <= maxConsecutiveDays; b++ {
				bd := curDate.AddDate(0, 0, -b).Format("2006-01-02")
				bcode := getShift(n.ID, bd)
				if bcode != "" && bcode != "X" && bcode != "L" && bcode != "Va" && bcode != "V" && bcode != "v" {
					consec++
				} else {
					break
				}
			}
			for f := 1; f <= maxConsecutiveDays; f++ {
				fd := curDate.AddDate(0, 0, f).Format("2006-01-02")
				fcode := getShift(n.ID, fd)
				if fcode != "" && fcode != "X" && fcode != "L" && fcode != "Va" && fcode != "V" && fcode != "v" {
					consec++
				} else {
					break
				}
			}

			if consec > maxConsecutiveDays {
				continue
			}

			// Assign Morning shift
			out[idx].ShiftCode = "ช"
			currentHours += 8.0
			offDays--
			neededShifts--
		}
	}

	return out
}

// pruneExcessDoubles scans all dates in the roster and downgrades any unlocked "ชบ" to "ช"
// whenever the Evening shift (16:00-24:00) on that date is overstaffed.
// This preserves 100% of Morning coverage while eliminating Evening overstaffing and excess OT.
func pruneExcessDoubles(r domain.Roster, cells []domain.Cell) []domain.Cell {
	if len(cells) == 0 {
		return cells
	}

	out := append([]domain.Cell(nil), cells...)

	staffMap := make(map[string]domain.Staff, len(r.Staff))
	for _, n := range r.Staff {
		staffMap[n.ID] = n
	}

	shiftMap := make(map[string]domain.RosterShift, len(r.Shifts))
	for _, s := range r.Shifts {
		shiftMap[s.Code] = s
	}

	// Index cell positions by date and nurse@date
	cellMap := make(map[string]int, len(out))
	dateIndices := make(map[string][]int)
	for i, c := range out {
		cellMap[c.NurseID+"@"+c.Date] = i
		dateIndices[c.Date] = append(dateIndices[c.Date], i)
	}

	getShift := func(nurseID, dateStr string) string {
		if idx, ok := cellMap[nurseID+"@"+dateStr]; ok {
			return out[idx].ShiftCode
		}
		for _, bc := range r.Boundary {
			if bc.NurseID == nurseID && bc.Date == dateStr {
				return bc.ShiftCode
			}
		}
		return ""
	}

	isNightShiftCode := func(code string) bool {
		return code == "ด" || code == "N" || code == "Night" || code == "12N" || code == "ชด" || code == "บด"
	}
	isMorningShiftCode := func(code string) bool {
		return code == "ช" || code == "Day" || code == "D" || code == "12D" || code == "ชบ" || code == "ชด"
	}
	isEveningShiftCode := func(code string) bool {
		return code == "บ" || code == "ชบ" || code == "บด"
	}
	isOffOrLeave := func(code string) bool {
		c := strings.TrimSpace(code)
		return c == "" || c == "X" || c == "x" || c == "L" || c == "V" || c == "v" || c == "Va" || c == "OFF" || c == "อ"
	}
	isNurseAllowedShift := func(nurse domain.Staff, code string) bool {
		if len(nurse.Allowed) == 0 {
			return true
		}
		for _, a := range nurse.Allowed {
			if a == code || (code == "N" && (a == "Night" || a == "12N")) || (code == "Night" && (a == "N" || a == "12N")) {
				return true
			}
		}
		return false
	}

	isValidTransition := func(prevCode, nextCode string) bool {
		if prevCode == "" || prevCode == "X" || prevCode == "x" || prevCode == "L" || prevCode == "OFF" || prevCode == "Va" || prevCode == "V" || prevCode == "v" {
			return true
		}
		if nextCode == "" || nextCode == "X" || nextCode == "x" || nextCode == "L" || nextCode == "OFF" || nextCode == "Va" || nextCode == "V" || nextCode == "v" {
			return true
		}
		// Rule 1: เวรดึกต่อเช้า ไม่สามารถทำได้
		if isNightShiftCode(prevCode) && isMorningShiftCode(nextCode) {
			return false
		}
		// Rule 2: ห้ามจัดเวรดึกต่อด้วยเวรบ่าย
		if isNightShiftCode(prevCode) && isEveningShiftCode(nextCode) {
			return false
		}
		// Rule 3: ห้ามจัดเวรบ่ายต่อด้วยเวรดึก (เวรบ่ายต่อดึก 00:00-08:00)
		if isEveningShiftCode(prevCode) && (nextCode == "ด" || nextCode == "ชด" || nextCode == "บด") {
			return false
		}

		prevSh, ok1 := shiftMap[prevCode]
		nextSh, ok2 := shiftMap[nextCode]
		if !ok1 || !ok2 || len(prevSh.Periods) == 0 || len(nextSh.Periods) == 0 {
			return true
		}
		latestEnd := 0
		for _, p := range prevSh.Periods {
			if p.End > latestEnd {
				latestEnd = p.End
			}
		}
		earliestStart := 999999
		for _, p := range nextSh.Periods {
			startOnDayD := 1440 + p.Start
			if startOnDayD < earliestStart {
				earliestStart = startOnDayD
			}
		}
		restMinutes := earliestStart - latestEnd
		minRest := r.Policy.MinRestHours
		if minRest <= 0 {
			minRest = 8.0
		}
		return float64(restMinutes)/60.0 >= (minRest - 1e-6)
	}

	isSafeTransition := func(nurseID, dateStr, newCode string) bool {
		pd, err := time.Parse("2006-01-02", dateStr)
		if err != nil {
			return true
		}
		prevDate := pd.AddDate(0, 0, -1).Format("2006-01-02")
		nextDate := pd.AddDate(0, 0, 1).Format("2006-01-02")

		prevCode := getShift(nurseID, prevDate)
		nextCode := getShift(nurseID, nextDate)

		if !isValidTransition(prevCode, newCode) {
			return false
		}
		if !isValidTransition(newCode, nextCode) {
			return false
		}
		return true
	}

	sortedDates := make([]string, 0, len(dateIndices))
	for d := range dateIndices {
		sortedDates = append(sortedDates, d)
	}
	sort.Strings(sortedDates)

	for _, date := range sortedDates {
		indices := dateIndices[date]
		activeStaffing := staffingForDate(r, date)
		if len(activeStaffing) == 0 {
			continue
		}

		// Calculate Evening requirements (960..1440)
		eveReqRN, eveReqLeaders, eveReqPN := 0, 0, 0
		for _, ar := range activeStaffing {
			if ar.Start >= 960 && ar.End <= 1440 {
				eveReqRN += ar.RN
				eveReqLeaders += ar.Leaders
				eveReqPN += ar.PN
			}
		}
		totalEveReqRN := eveReqRN + eveReqLeaders

		// Count current Evening coverage on this date according to hospital formula:
		// Evening = COUNTIF("บ") + COUNTIF("ชบ") + 0.5*COUNTIF("D") + 0.5*COUNTIF("N")
		currentEveRN := 0.0
		currentEveLeaders := 0.0
		currentEvePN := 0.0

		for _, idx := range indices {
			c := out[idx]
			if c.ShiftCode == "" || c.ShiftCode == "X" || c.ShiftCode == "x" || c.ShiftCode == "L" || c.ShiftCode == "V" || c.ShiftCode == "v" || c.ShiftCode == "Va" {
				continue
			}
			weight := 0.0
			code := strings.TrimSpace(c.ShiftCode)
			if code == "บ" || code == "ชบ" || code == "บด" {
				weight = 1.0
			} else if code == "D" || code == "Day" || code == "12D" || code == "N" || code == "Night" || code == "12N" {
				weight = 0.5
			}
			if weight > 0 {
				nurse, exists := staffMap[c.NurseID]
				if exists && nurse.Active {
					if nurse.Position == "RN" {
						currentEveRN += weight
						if nurse.Leader {
							currentEveLeaders += weight
						}
					} else if nurse.Position == "PN" {
						currentEvePN += weight
					}
				}
			}
		}

		totalEveReqRNFloat := float64(totalEveReqRN)
		eveReqPNFloat := float64(eveReqPN)
		eveReqLeadersFloat := float64(eveReqLeaders)

		// 1. Trim excess RNs in Evening: downgrade unlocked "ชบ" -> "ช"
		// As per hospital rule: If target is 4, allow 3.5 (do not exceed 4.0).
		// Trim whenever currentEveRN > target (e.g. 4.5 -> 3.5 <= 4.0).
		if currentEveRN > totalEveReqRNFloat+0.001 {
			// Pass 1: Non-leader RNs on "ชบ" -> "ช"
			for _, idx := range indices {
				if currentEveRN <= totalEveReqRNFloat+0.001 {
					break
				}
				c := out[idx]
				if c.Locked || c.ShiftCode != "ชบ" {
					continue
				}
				nurse, exists := staffMap[c.NurseID]
				if !exists || !nurse.Active || nurse.Position != "RN" || nurse.Leader {
					continue
				}
				out[idx].ShiftCode = "ช"
				currentEveRN -= 1.0
			}

			// Pass 2: Leader RNs on "ชบ" -> "ช" (only if remaining evening leaders >= eveReqLeaders)
			for _, idx := range indices {
				if currentEveRN <= totalEveReqRNFloat+0.001 {
					break
				}
				c := out[idx]
				if c.Locked || c.ShiftCode != "ชบ" {
					continue
				}
				nurse, exists := staffMap[c.NurseID]
				if !exists || !nurse.Active || nurse.Position != "RN" || !nurse.Leader {
					continue
				}
				if currentEveLeaders > eveReqLeadersFloat+0.001 {
					out[idx].ShiftCode = "ช"
					currentEveRN -= 1.0
					currentEveLeaders -= 1.0
				}
			}
		}

		// 2. Trim excess PNs in Evening: downgrade unlocked "ชบ" -> "ช"
		if currentEvePN > eveReqPNFloat+0.001 {
			// Pass 1: PNs on "ชบ" -> "ช"
			for _, idx := range indices {
				if currentEvePN <= eveReqPNFloat+0.001 {
					break
				}
				c := out[idx]
				if c.Locked || c.ShiftCode != "ชบ" {
					continue
				}
				nurse, exists := staffMap[c.NurseID]
				if !exists || !nurse.Active || nurse.Position != "PN" {
					continue
				}
				out[idx].ShiftCode = "ช"
				currentEvePN -= 1.0
			}
		}

		// 3. Chronological Dynamic Night Shift Cap & Calculations:
		// The shift immediately preceding today's Night shift (00:00 - 08:00) is Yesterday's Evening shift (16:00 - 24:00).
		// If yesterday's Evening shift had a deficit (e.g. Target 4, actual 3.5 => deficit 0.5),
		// today's Night shift is capped at Target + Deficit (e.g. Target 4.0 + 0.5 = 4.5 max, CANNOT be 5.0).
		// If yesterday's Evening shift was fully covered (e.g. 4.0/4.0), cap is 4.0 max.
		yesterdayEveDeficitRN := 0.0
		yesterdayEveDeficitPN := 0.0
		parsedDate, parseErr := time.Parse("2006-01-02", date)
		if parseErr == nil {
			yesterdayStr := parsedDate.AddDate(0, 0, -1).Format("2006-01-02")
			yStaffing := staffingForDate(r, yesterdayStr)
			if len(yStaffing) > 0 {
				yEveReqRN, yEveReqLeaders, yEveReqPN := 0, 0, 0
				for _, ar := range yStaffing {
					if ar.Start >= 960 && ar.End <= 1440 {
						yEveReqRN += ar.RN
						yEveReqLeaders += ar.Leaders
						yEveReqPN += ar.PN
					}
				}
				yTotalEveReqRNFloat := float64(yEveReqRN + yEveReqLeaders)
				yEveReqPNFloat := float64(yEveReqPN)

				yCurrentEveRN := 0.0
				yCurrentEvePN := 0.0
				if yIndices, exists := dateIndices[yesterdayStr]; exists {
					for _, yIdx := range yIndices {
						yc := out[yIdx]
						if yc.ShiftCode == "" || yc.ShiftCode == "X" || yc.ShiftCode == "x" || yc.ShiftCode == "L" || yc.ShiftCode == "V" || yc.ShiftCode == "v" || yc.ShiftCode == "Va" {
							continue
						}
						w := 0.0
						cCode := strings.TrimSpace(yc.ShiftCode)
						if cCode == "บ" || cCode == "ชบ" || cCode == "บด" {
							w = 1.0
						} else if cCode == "D" || cCode == "Day" || cCode == "12D" || cCode == "N" || cCode == "Night" || cCode == "12N" {
							w = 0.5
						}
						if w > 0 {
							nurse, nExists := staffMap[yc.NurseID]
							if nExists && nurse.Active {
								if nurse.Position == "RN" {
									yCurrentEveRN += w
								} else if nurse.Position == "PN" {
									yCurrentEvePN += w
								}
							}
						}
					}
				} else {
					// Fallback to r.Boundary for Day 1 of the month (e.g. 30 Sep for 1 Oct)
					for _, bc := range r.Boundary {
						if bc.Date == yesterdayStr {
							if bc.ShiftCode == "" || bc.ShiftCode == "X" || bc.ShiftCode == "x" || bc.ShiftCode == "L" || bc.ShiftCode == "V" || bc.ShiftCode == "v" || bc.ShiftCode == "Va" {
								continue
							}
							w := 0.0
							cCode := strings.TrimSpace(bc.ShiftCode)
							if cCode == "บ" || cCode == "ชบ" || cCode == "บด" {
								w = 1.0
							} else if cCode == "D" || cCode == "Day" || cCode == "12D" || cCode == "N" || cCode == "Night" || cCode == "12N" {
								w = 0.5
							}
							if w > 0 {
								nurse, nExists := staffMap[bc.NurseID]
								if nExists && nurse.Active {
									if nurse.Position == "RN" {
										yCurrentEveRN += w
									} else if nurse.Position == "PN" {
										yCurrentEvePN += w
									}
								}
							}
						}
					}
				}
				// Deficit from yesterday evening is capped at maximum 0.5 (as per hospital shift compensation rule: 3.5 -> 4.5 max).
				// If yesterday had no evening records (yCurrentEveRN == 0), deficit is 0.0 to prevent false carryover.
				if yCurrentEveRN > 0 {
					yesterdayEveDeficitRN = math.Min(0.5, math.Max(0, yTotalEveReqRNFloat-yCurrentEveRN))
					yesterdayEveDeficitPN = math.Min(0.5, math.Max(0, yEveReqPNFloat-yCurrentEvePN))
				} else {
					yesterdayEveDeficitRN = 0.0
					yesterdayEveDeficitPN = 0.0
				}
			}
		}

		nightReqRN, nightReqLeaders, nightReqPN := 0, 0, 0
		for _, ar := range activeStaffing {
			if (ar.Start == 0 && ar.End <= 480) || (ar.Start >= 1200 && ar.End >= 1920) {
				nightReqRN += ar.RN
				nightReqLeaders += ar.Leaders
				nightReqPN += ar.PN
			}
		}
		totalNightReqRN := nightReqRN + nightReqLeaders
		totalNightReqRNFloat := float64(totalNightReqRN)
		nightReqPNFloat := float64(nightReqPN)
		nightReqLeadersFloat := float64(nightReqLeaders)

		// Max allowed night staffing is strictly bounded by Target + min(0.5, deficit)
		// e.g. Target 4.0 + 0.5 = 4.5 max (MUST NOT exceed 4.5, if 5.0 is assigned, excess 1 nurse is removed).
		maxAllowedNightRN := totalNightReqRNFloat + math.Min(0.5, yesterdayEveDeficitRN)
		maxAllowedNightPN := nightReqPNFloat + math.Min(0.5, yesterdayEveDeficitPN)

		currentNightRN := 0.0
		currentNightLeaders := 0.0
		currentNightPN := 0.0

		// Active staff working during [00:00 - 08:00] on date:
		// 1) Staff with "ด", "ชด", "บด" on this date
		for _, idx := range indices {
			c := out[idx]
			if c.ShiftCode == "" || c.ShiftCode == "X" || c.ShiftCode == "x" || c.ShiftCode == "L" || c.ShiftCode == "V" || c.ShiftCode == "v" || c.ShiftCode == "Va" {
				continue
			}
			code := strings.TrimSpace(c.ShiftCode)
			weight := 0.0
			if code == "ด" || code == "ชด" || code == "บด" {
				weight = 1.0
			}
			if weight > 0 {
				nurse, exists := staffMap[c.NurseID]
				if exists && nurse.Active {
					if nurse.Position == "RN" {
						currentNightRN += weight
						if nurse.Leader {
							currentNightLeaders += weight
						}
					} else if nurse.Position == "PN" {
						currentNightPN += weight
					}
				}
			}
		}

		// 2) Staff with 12h night shift ("Night", "N", "12N") on yesterday
		if parseErr == nil {
			yesterdayStr := parsedDate.AddDate(0, 0, -1).Format("2006-01-02")
			if yIndices, exists := dateIndices[yesterdayStr]; exists {
				for _, yIdx := range yIndices {
					yc := out[yIdx]
					yCode := strings.TrimSpace(yc.ShiftCode)
					if yCode == "Night" || yCode == "N" || yCode == "12N" {
						nurse, nExists := staffMap[yc.NurseID]
						if nExists && nurse.Active {
							if nurse.Position == "RN" {
								currentNightRN += 1.0
								if nurse.Leader {
									currentNightLeaders += 1.0
								}
							} else if nurse.Position == "PN" {
								currentNightPN += 1.0
							}
						}
					}
				}
			} else {
				// Boundary fallback
				for _, bc := range r.Boundary {
					if bc.Date == yesterdayStr {
						yCode := strings.TrimSpace(bc.ShiftCode)
						if yCode == "Night" || yCode == "N" || yCode == "12N" {
							nurse, nExists := staffMap[bc.NurseID]
							if nExists && nurse.Active {
								if nurse.Position == "RN" {
									currentNightRN += 1.0
									if nurse.Leader {
										currentNightLeaders += 1.0
									}
								} else if nurse.Position == "PN" {
									currentNightPN += 1.0
								}
							}
						}
					}
				}
			}
		}

		// Total night staff working during night period of this date:
		// 1) Staff with "ด", "ชด", "บด"
		// 2) Staff with "N", "Night", "12N" assigned today (working night from 20:00)
		totalDayNightRN := 0.0
		for _, idx := range indices {
			c := out[idx]
			if c.ShiftCode == "" || c.ShiftCode == "X" || c.ShiftCode == "x" || c.ShiftCode == "L" || c.ShiftCode == "V" || c.ShiftCode == "v" || c.ShiftCode == "Va" {
				continue
			}
			code := strings.TrimSpace(c.ShiftCode)
			if code == "ด" || code == "ชด" || code == "บด" || code == "N" || code == "Night" || code == "12N" {
				nurse, exists := staffMap[c.NurseID]
				if exists && nurse.Active && nurse.Position == "RN" {
					totalDayNightRN += 1.0
				}
			}
		}

		totalDayNightPN := 0.0
		for _, idx := range indices {
			c := out[idx]
			if c.ShiftCode == "" || c.ShiftCode == "X" || c.ShiftCode == "x" || c.ShiftCode == "L" || c.ShiftCode == "V" || c.ShiftCode == "v" || c.ShiftCode == "Va" {
				continue
			}
			code := strings.TrimSpace(c.ShiftCode)
			if code == "ด" || code == "ชด" || code == "บด" || code == "N" || code == "Night" || code == "12N" {
				nurse, exists := staffMap[c.NurseID]
				if exists && nurse.Active && nurse.Position == "PN" {
					totalDayNightPN += 1.0
				}
			}
		}

		nextDateStr := ""
		if parseErr == nil {
			nextDateStr = parsedDate.AddDate(0, 0, 1).Format("2006-01-02")
		}

		nightReliefCode := "N"
		if _, ok := shiftMap["Night"]; ok {
			nightReliefCode = "Night"
		}
		if _, ok := shiftMap["N"]; ok {
			nightReliefCode = "N"
		}

		// Night Deficit Relief for RN: If night staffing is under-covered on this date,
		// find an RN working Evening ("บ") whose next day is OFF/Leave ("X", "L", "V"),
		// and safely convert their shift to 12h Night ("N") to fulfill the night requirement.
		// (Ran BEFORE trimming excess Evening "บ" -> "X" so that useful nurses are utilized rather than discarded).
		if totalNightReqRNFloat > 0 && totalDayNightRN < totalNightReqRNFloat-0.001 && nextDateStr != "" {
			for _, idx := range indices {
				if totalDayNightRN >= totalNightReqRNFloat-0.001 {
					break
				}
				c := out[idx]
				if c.Locked || c.ShiftCode != "บ" {
					continue
				}
				nurse, exists := staffMap[c.NurseID]
				if !exists || !nurse.Active || nurse.Position != "RN" {
					continue
				}
				if !isNurseAllowedShift(nurse, nightReliefCode) {
					continue
				}
				nextShift := getShift(c.NurseID, nextDateStr)
				if !isOffOrLeave(nextShift) {
					continue
				}
				if !isSafeTransition(c.NurseID, date, nightReliefCode) {
					continue
				}
				// Ensure Evening is not made understaffed below its target
				if totalEveReqRNFloat > 0 && (currentEveRN-0.5) < totalEveReqRNFloat-0.001 {
					continue
				}
				out[idx].ShiftCode = nightReliefCode
				totalDayNightRN += 1.0
				currentNightRN += 1.0
				currentEveRN -= 0.5
				if nurse.Leader {
					currentNightLeaders += 1.0
				}
			}
		}

		// Night Deficit Relief for PN: If night staffing is under-covered on this date,
		// find a PN working Evening ("บ") whose next day is OFF/Leave ("X", "L", "V"),
		// and safely convert their shift to 12h Night ("N") to fulfill the night requirement.
		if nightReqPNFloat > 0 && totalDayNightPN < nightReqPNFloat-0.001 && nextDateStr != "" {
			for _, idx := range indices {
				if totalDayNightPN >= nightReqPNFloat-0.001 {
					break
				}
				c := out[idx]
				if c.Locked || c.ShiftCode != "บ" {
					continue
				}
				nurse, exists := staffMap[c.NurseID]
				if !exists || !nurse.Active || nurse.Position != "PN" {
					continue
				}
				if !isNurseAllowedShift(nurse, nightReliefCode) {
					continue
				}
				nextShift := getShift(c.NurseID, nextDateStr)
				if !isOffOrLeave(nextShift) {
					continue
				}
				if !isSafeTransition(c.NurseID, date, nightReliefCode) {
					continue
				}
				// Ensure Evening is not made understaffed below its target
				if eveReqPNFloat > 0 && (currentEvePN-0.5) < eveReqPNFloat-0.001 {
					continue
				}
				out[idx].ShiftCode = nightReliefCode
				totalDayNightPN += 1.0
				currentNightPN += 1.0
				currentEvePN -= 0.5
			}
		}

		// Evening Pass 3 (RN): Trim remaining excess regular RNs on "บ" -> "X" ONLY if removing 1 full shift still meets target
		if currentEveRN > totalEveReqRNFloat+0.001 {
			for _, idx := range indices {
				if (currentEveRN - 1.0) < totalEveReqRNFloat-0.001 {
					break
				}
				c := out[idx]
				if c.Locked || c.ShiftCode != "บ" {
					continue
				}
				nurse, exists := staffMap[c.NurseID]
				if !exists || !nurse.Active || nurse.Position != "RN" || nurse.Leader {
					continue
				}
				if (currentEveRN - currentEveLeaders - 1.0) >= float64(eveReqRN)-0.001 {
					out[idx].ShiftCode = "X"
					currentEveRN -= 1.0
				}
			}
		}

		// Evening Pass 2 (PN): Trim remaining excess PNs on "บ" -> "X" ONLY if removing 1 full shift still meets target
		if currentEvePN > eveReqPNFloat+0.001 {
			for _, idx := range indices {
				if (currentEvePN - 1.0) < eveReqPNFloat-0.001 {
					break
				}
				c := out[idx]
				if c.Locked || c.ShiftCode != "บ" {
					continue
				}
				nurse, exists := staffMap[c.NurseID]
				if !exists || !nurse.Active || nurse.Position != "PN" {
					continue
				}
				out[idx].ShiftCode = "X"
				currentEvePN -= 1.0
			}
		}

		// Trim excess RNs in Night if exceeding max allowed night cap (e.g. 4 'ด' + 1 'N' = 5.0 -> 4.0 <= maxAllowedNightRN):
		if totalNightReqRNFloat > 0 && (currentNightRN > maxAllowedNightRN+0.001 || totalDayNightRN > maxAllowedNightRN+0.001) {
			// Method 1: If morning shift has a nurse on "ชบ" or "D"/"Day"/"12D", and night shift has a nurse on "N"/"Night"/"12N":
			// Simultaneously adjust 1 morning nurse: "ชบ"/"D" -> "ช"
			// And adjust 1 night nurse: "N"/"Night" -> "บ"
			// This perfectly balances Morning, Evening and Night shifts while reducing night count by 1.
			for totalDayNightRN > maxAllowedNightRN+0.001 {
				mornIdx := -1
				nightIdx := -1

				for _, idx := range indices {
					c := out[idx]
					if c.Locked {
						continue
					}
					nurse, exists := staffMap[c.NurseID]
					if !exists || !nurse.Active || nurse.Position != "RN" {
						continue
					}
					if mornIdx == -1 && (c.ShiftCode == "ชบ" || c.ShiftCode == "D" || c.ShiftCode == "Day" || c.ShiftCode == "12D") {
						if isSafeTransition(c.NurseID, date, "ช") {
							mornIdx = idx
						}
					}
					if nightIdx == -1 && (c.ShiftCode == "N" || c.ShiftCode == "Night" || c.ShiftCode == "12N") {
						if isSafeTransition(c.NurseID, date, "บ") {
							nightIdx = idx
						}
					}
				}

				if mornIdx != -1 && nightIdx != -1 {
					out[mornIdx].ShiftCode = "ช"
					out[nightIdx].ShiftCode = "บ"
					totalDayNightRN -= 1.0
				} else {
					break // No matching pairs for Method 1, proceed to Method 2
				}
			}

			// Method 2 (Fallback): If Method 1 conditions are not met, directly trim excess night shifts:
			// Step 2.1: Downgrade unlocked "ชด" -> "ช" or "บด" -> "บ" for Non-leader RNs
			for _, idx := range indices {
				if totalDayNightRN <= maxAllowedNightRN+0.001 {
					break
				}
				c := out[idx]
				if c.Locked {
					continue
				}
				nurse, exists := staffMap[c.NurseID]
				if !exists || !nurse.Active || nurse.Position != "RN" || nurse.Leader {
					continue
				}
				if c.ShiftCode == "ชด" && isSafeTransition(c.NurseID, date, "ช") {
					out[idx].ShiftCode = "ช"
					totalDayNightRN -= 1.0
					currentNightRN -= 1.0
				} else if c.ShiftCode == "บด" && isSafeTransition(c.NurseID, date, "บ") {
					out[idx].ShiftCode = "บ"
					totalDayNightRN -= 1.0
					currentNightRN -= 1.0
				}
			}

			// Step 2.2: Remove excess "ด" -> "X" for Non-leader RNs (takes out 1 full night shift, strictly preserving Leader RN)
			for _, idx := range indices {
				if totalDayNightRN <= maxAllowedNightRN+0.001 {
					break
				}
				c := out[idx]
				if c.Locked || c.ShiftCode != "ด" {
					continue
				}
				nurse, exists := staffMap[c.NurseID]
				if !exists || !nurse.Active || nurse.Position != "RN" || nurse.Leader {
					continue
				}
				out[idx].ShiftCode = "X"
				totalDayNightRN -= 1.0
				currentNightRN -= 1.0
			}

			// Step 2.3: Remove excess "ด" -> "X" for Leader RNs ONLY IF remaining leaders strictly exceed requirement (preserving at least 1 leader)
			minLeadersRequired := math.Max(1.0, nightReqLeadersFloat)
			for _, idx := range indices {
				if totalDayNightRN <= maxAllowedNightRN+0.001 {
					break
				}
				c := out[idx]
				if c.Locked || c.ShiftCode != "ด" {
					continue
				}
				nurse, exists := staffMap[c.NurseID]
				if !exists || !nurse.Active || nurse.Position != "RN" || !nurse.Leader {
					continue
				}
				if currentNightLeaders > minLeadersRequired+0.001 {
					out[idx].ShiftCode = "X"
					totalDayNightRN -= 1.0
					currentNightRN -= 1.0
					currentNightLeaders -= 1.0
				}
			}
		}

		// Trim excess PNs in Night if exceeding max allowed night cap
		if nightReqPNFloat > 0 && (currentNightPN > maxAllowedNightPN+0.001 || totalDayNightPN > maxAllowedNightPN+0.001) {
			// Method 1 for PN: "ชบ"/"D" -> "ช" and "N" -> "บ"
			for totalDayNightPN > maxAllowedNightPN+0.001 {
				mornIdx := -1
				nightIdx := -1

				for _, idx := range indices {
					c := out[idx]
					if c.Locked {
						continue
					}
					nurse, exists := staffMap[c.NurseID]
					if !exists || !nurse.Active || nurse.Position != "PN" {
						continue
					}
					if mornIdx == -1 && (c.ShiftCode == "ชบ" || c.ShiftCode == "D" || c.ShiftCode == "Day" || c.ShiftCode == "12D") {
						if isSafeTransition(c.NurseID, date, "ช") {
							mornIdx = idx
						}
					}
					if nightIdx == -1 && (c.ShiftCode == "N" || c.ShiftCode == "Night" || c.ShiftCode == "12N") {
						if isSafeTransition(c.NurseID, date, "บ") {
							nightIdx = idx
						}
					}
				}

				if mornIdx != -1 && nightIdx != -1 {
					out[mornIdx].ShiftCode = "ช"
					out[nightIdx].ShiftCode = "บ"
					totalDayNightPN -= 1.0
					currentNightPN -= 1.0
				} else {
					break
				}
			}

			// Method 2 (Fallback) for PN:
			// Step 2.1: Downgrade "ชด" -> "ช", "บด" -> "บ"
			for _, idx := range indices {
				if totalDayNightPN <= maxAllowedNightPN+0.001 {
					break
				}
				c := out[idx]
				if c.Locked {
					continue
				}
				nurse, exists := staffMap[c.NurseID]
				if !exists || !nurse.Active || nurse.Position != "PN" {
					continue
				}
				if c.ShiftCode == "ชด" && isSafeTransition(c.NurseID, date, "ช") {
					out[idx].ShiftCode = "ช"
					totalDayNightPN -= 1.0
					currentNightPN -= 1.0
				} else if c.ShiftCode == "บด" && isSafeTransition(c.NurseID, date, "บ") {
					out[idx].ShiftCode = "บ"
					totalDayNightPN -= 1.0
					currentNightPN -= 1.0
				}
			}

			// Step 2.2: Remove excess "ด" -> "X" for PNs
			for _, idx := range indices {
				if totalDayNightPN <= maxAllowedNightPN+0.001 {
					break
				}
				c := out[idx]
				if c.Locked || c.ShiftCode != "ด" {
					continue
				}
				nurse, exists := staffMap[c.NurseID]
				if !exists || !nurse.Active || nurse.Position != "PN" {
					continue
				}
				out[idx].ShiftCode = "X"
				totalDayNightPN -= 1.0
				currentNightPN -= 1.0
			}
		}

		// 4. Trim excess RNs and PNs in Morning (08:00 - 16:00) if exceeding required staffing:
		mornReqRN, mornReqLeaders, mornReqPN := 0, 0, 0
		for _, ar := range activeStaffing {
			if ar.Start >= 480 && ar.End <= 960 {
				mornReqRN += ar.RN
				mornReqLeaders += ar.Leaders
				mornReqPN += ar.PN
			}
		}
		totalMornReqRN := mornReqRN + mornReqLeaders
		totalMornReqRNFloat := float64(totalMornReqRN)
		mornReqPNFloat := float64(mornReqPN)
		mornReqLeadersFloat := float64(mornReqLeaders)

		currentMornRN := 0.0
		currentMornLeaders := 0.0
		currentMornPN := 0.0

		for _, idx := range indices {
			c := out[idx]
			if c.ShiftCode == "" || c.ShiftCode == "X" || c.ShiftCode == "x" || c.ShiftCode == "L" || c.ShiftCode == "V" || c.ShiftCode == "v" || c.ShiftCode == "Va" {
				continue
			}
			code := strings.TrimSpace(c.ShiftCode)
			weight := 0.0
			if code == "ช" || code == "ชบ" || code == "ชด" {
				weight = 1.0
			} else if code == "D" || code == "Day" || code == "12D" {
				weight = 1.0
			}
			if weight > 0 {
				nurse, exists := staffMap[c.NurseID]
				if exists && nurse.Active {
					if nurse.Position == "RN" {
						currentMornRN += weight
						if nurse.Leader {
							currentMornLeaders += weight
						}
					} else if nurse.Position == "PN" {
						currentMornPN += weight
					}
				}
			}
		}

		// 4.1 Trim excess RNs on Morning: downgrade unlocked "ช" -> "X"
		if totalMornReqRNFloat > 0 && currentMornRN > totalMornReqRNFloat+0.001 {
			// Pass 1: Non-leader RNs on "ช" -> "X"
			for _, idx := range indices {
				if currentMornRN <= totalMornReqRNFloat+0.001 {
					break
				}
				c := out[idx]
				if c.Locked || c.ShiftCode != "ช" {
					continue
				}
				nurse, exists := staffMap[c.NurseID]
				if !exists || !nurse.Active || nurse.Position != "RN" || nurse.Leader {
					continue
				}
				if !isSafeTransition(c.NurseID, date, "X") {
					continue
				}
				out[idx].ShiftCode = "X"
				currentMornRN -= 1.0
			}

			// Pass 2: Leader RNs on "ช" -> "X" (only if remaining morning leaders >= mornReqLeaders)
			minMornLeadersRequired := math.Max(1.0, mornReqLeadersFloat)
			for _, idx := range indices {
				if currentMornRN <= totalMornReqRNFloat+0.001 {
					break
				}
				c := out[idx]
				if c.Locked || c.ShiftCode != "ช" {
					continue
				}
				nurse, exists := staffMap[c.NurseID]
				if !exists || !nurse.Active || nurse.Position != "RN" || !nurse.Leader {
					continue
				}
				if currentMornLeaders > minMornLeadersRequired+0.001 {
					if !isSafeTransition(c.NurseID, date, "X") {
						continue
					}
					out[idx].ShiftCode = "X"
					currentMornRN -= 1.0
					currentMornLeaders -= 1.0
				}
			}
		}

		// 4.2 Trim excess PNs on Morning: downgrade unlocked "ช" -> "X"
		if mornReqPNFloat > 0 && currentMornPN > mornReqPNFloat+0.001 {
			for _, idx := range indices {
				if currentMornPN <= mornReqPNFloat+0.001 {
					break
				}
				c := out[idx]
				if c.Locked || c.ShiftCode != "ช" {
					continue
				}
				nurse, exists := staffMap[c.NurseID]
				if !exists || !nurse.Active || nurse.Position != "PN" {
					continue
				}
				if !isSafeTransition(c.NurseID, date, "X") {
					continue
				}
				out[idx].ShiftCode = "X"
				currentMornPN -= 1.0
			}
		}
	}

	return out
}


