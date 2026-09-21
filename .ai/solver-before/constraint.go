package scheduler

import (
	"context"
	"math"
	"sort"
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

func (ConstraintSolver) Solve(ctx context.Context, in domain.SolverInput) (domain.SolverOutput, error) {
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
	if duration <= 0 || duration > 5*time.Second {
		duration = 5 * time.Second
	}
	ctx, cancel := context.WithTimeout(ctx, duration)
	defer cancel()
	maxNodes := in.MaxNodes
	if maxNodes <= 0 || maxNodes > 3000 {
		maxNodes = 3000
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
			if !inScope(c, in.Scope) {
				continue
			}
			choices := []string{}
			for _, sh := range r.Shifts {
				if sh.Code == "บด" {
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
		return code == "ด" || code == "N" || code == "Night" || code == "12N" || code == "ชด"
	}
	isMorningShift := func(code string) bool {
		return code == "ช" || code == "Day" || code == "D" || code == "12D" || code == "ชบ" || code == "ชด"
	}
	isEveningShift := func(code string) bool {
		return code == "บ" || code == "ชบ"
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
	rnCount := 0
	pnCount := 0
	for _, n := range staff {
		if n.Active {
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
		// Rule 2: ห้ามจัดเวร บ่าย ต่อด้วย ดึก (Evening cannot be followed by Night on the next day)
		if isEveningShift(prevCode) && isNightShift(nextCode) {
			return false
		}
		// Rule 3: ห้ามจัดเวร ดึก ต่อด้วย บ่าย (Night cannot be followed by Evening on the next day)
		if isNightShift(prevCode) && isEveningShift(nextCode) {
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

	// Sort boundary chronologically so latest day (precedingDate) sets lastShiftCode
	sort.SliceStable(r.Boundary, func(i, j int) bool {
		return r.Boundary[i].Date < r.Boundary[j].Date
	})
	for _, bCell := range r.Boundary {
		lastShiftCode[bCell.NurseID] = bCell.ShiftCode
		if bCell.ShiftCode == "X" || bCell.ShiftCode == "L" || bCell.ShiftCode == "" {
			consecutiveDays[bCell.NurseID] = 0
			consecutiveNights[bCell.NurseID] = 0
		} else {
			consecutiveDays[bCell.NurseID]++
			if isNightShift(bCell.ShiftCode) {
				consecutiveNights[bCell.NurseID]++
			} else {
				consecutiveNights[bCell.NurseID] = 0
			}
		}
	}

	scheduledCells := []domain.Cell{}
	fixedMap := map[string]domain.Cell{}
	for _, c := range fixed {
		fixedMap[cellKey(c)] = c
	}

	// Day by Day Scheduling Pass
	nodesCount := 0
	timedOut := false
	for d := a; d.Before(b); d = d.AddDate(0, 0, 1) {
		if ctx.Err() != nil || nodesCount >= maxNodes {
			timedOut = true
			break
		}
		ds := d.Format("2006-01-02")
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

		// 2. Identify active staffing requirements for this date
		activeStaffing := []domain.Staffing{}
		for _, req := range r.Policy.Staffing {
			if req.Date == ds {
				activeStaffing = append(activeStaffing, req)
			}
		}
		if len(activeStaffing) == 0 {
			for _, req := range r.Policy.Staffing {
				if req.Date == "" {
					activeStaffing = append(activeStaffing, req)
				}
			}
		}

		// If no staffing policy defined, fallback to default 3 shifts
		if len(activeStaffing) == 0 {
			activeStaffing = []domain.Staffing{
				{Start: 480, End: 960, RN: 1, PN: 1, Leaders: 1},
				{Start: 960, End: 1440, RN: 1, PN: 1, Leaders: 1},
				{Start: 0, End: 480, RN: 1, PN: 0, Leaders: 1},
			}
		}

		// Sort requirements so shifts with strictest rest constraints are fulfilled first (Night 0:00 -> Morning 8:00 -> Afternoon 16:00)
		sort.SliceStable(activeStaffing, func(i, j int) bool {
			// Night (0) first, then Morning (480), then Afternoon (960)
			sI, sJ := activeStaffing[i].Start, activeStaffing[j].Start
			return sI < sJ
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
								if neededRN > 0 {
									neededRN--
								}
							} else if n.Position == "PN" {
								if neededPN > 0 {
									neededPN--
								}
							}
							if n.Leader && neededLeaders > 0 {
								neededLeaders--
							}
						}
					}
				}
			}

			maxToAssign := req.RN + req.PN
			if maxToAssign == 0 && req.Leaders > 0 {
				maxToAssign = req.Leaders
			}

			// Helper to find the best candidate for a specific role and leader requirement
			findCandidateForRole := func(targetRole string, requireLeader bool) (domain.Staff, string, bool) {
				type cand struct {
					nurse     domain.Staff
					score     float64
					shiftCode string
				}
				var pool []cand

				for _, n := range staff {
					if !n.Active || dayAssignments[n.ID] != "" {
						continue
					}
					if n.Position != targetRole {
						continue
					}
					if requireLeader && !n.Leader {
						continue
					}

					// Options for this slot: primary standard shift and eligible 16h double shifts
					candidateShiftCodes := []string{shCode}
					if req.Start == 480 && req.End == 960 {
						// Morning slot options: ช (8h), ชบ (16h), ชด (16h)
						for _, allowedCode := range n.Allowed {
							if n.Double && doubleShiftsCount[n.ID] < r.Policy.MaxDoubleShifts {
								if (allowedCode == "ชบ" || allowedCode == "ชด") && !containsCode(candidateShiftCodes, allowedCode) {
									candidateShiftCodes = append(candidateShiftCodes, allowedCode)
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
						totalRoleReq := dailyRoleMorn + dailyRoleEve + dailyRoleNight

						targetDoublesToday := 0
						if totalRoleReq >= roleStaffCount {
							targetDoublesToday = 2
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

						// Leader priority
						if requireLeader || (neededLeaders > 0 && n.Leader) {
							score += 600.0
						}

						// Standard monthly target hours leveling (เกลี่ยชั่วโมงทำงานให้ได้มาตรฐานและเท่าเทียมกัน)
						tTarget := float64(numDays-8) * 8.0
						if t, ok := targetsMap[n.ID]; ok && t.Hours > 0 {
							tTarget = t.Hours
						} else if r.Policy.MaxMonthlyHours > 0 {
							tTarget = r.Policy.MaxMonthlyHours
						}
						hourDeficit := tTarget - monthlyHours[n.ID]
						score += hourDeficit * 20.0

						// Fatigue barrier: stagger OFF days and strictly prevent nurses from reaching 4-6 consecutive days
						cDays := float64(consecutiveDays[n.ID])
						if consecutiveDays[n.ID] >= 4 {
							score -= 2000.0 // Must rest on day 4 or 5
						} else if consecutiveDays[n.ID] >= 3 {
							score -= 800.0
						} else {
							score -= cDays * 150.0
						}

						// Leveling: standard vs 12h/16h shift incentives
						if optShift.Double || optCode == "ชบ" {
							targetDoublesPerNurse := float64(numDays*targetDoublesToday) / float64(roleStaffCount)
							if float64(doubleShiftsCount[n.ID]) >= targetDoublesPerNurse {
								score -= (float64(doubleShiftsCount[n.ID]) - targetDoublesPerNurse + 1.0) * 300.0
							} else {
								score += (targetDoublesPerNurse - float64(doubleShiftsCount[n.ID])) * 120.0
							}

							if alreadyAssignedDoublesToday < targetDoublesToday && eveRemainingDeficit > 0 && doubleShiftsCount[n.ID] < r.Policy.MaxDoubleShifts {
								score += 400.0
							} else {
								score -= 1000.0
							}
						} else if optHours == 12.0 || optCode == "Day" || optCode == "D" || optCode == "Night" || optCode == "N" {
							score += 60.0 - float64(twelveShiftsCount[n.ID])*10.0
						} else {
							score += 35.0 // Standard 8h shift
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
							if float64(nightShiftsCount[n.ID]) >= targetNights {
								score -= (float64(nightShiftsCount[n.ID]) - targetNights + 1.0) * 400.0
							} else {
								score += (targetNights - float64(nightShiftsCount[n.ID])) * 150.0
							}
						}
						if optCode == "บ" {
							if float64(eveShiftsCount[n.ID]) >= targetEves {
								score -= (float64(eveShiftsCount[n.ID]) - targetEves + 1.0) * 100.0
							} else {
								score += (targetEves - float64(eveShiftsCount[n.ID])) * 50.0
							}
						}
						if optCode == "ช" || optCode == "ชบ" || optCode == "Day" || optCode == "D" {
							if float64(morningShiftsCount[n.ID]) >= targetMorns {
								score -= (float64(morningShiftsCount[n.ID]) - targetMorns + 1.0) * 80.0
							} else {
								score += (targetMorns - float64(morningShiftsCount[n.ID])) * 40.0
							}
						}

						// Ergonomic Forward Rotation Bonus
						if lastCode == "ช" {
							if optCode == "ช" || optCode == "Day" || optCode == "D" {
								score += 30.0
							} else if optCode == "ชบ" {
								score += 25.0
							} else if optCode == "บ" {
								score += 35.0
							} else if optCode == "ด" || optCode == "Night" || optCode == "N" {
								score += 60.0 // Morning to Night rotation
							}
						} else if lastCode == "ชบ" {
							if optCode == "บ" {
								score += 60.0 // 16h rest from midnight to 16:00
							} else if optCode == "ช" || optCode == "Day" || optCode == "D" {
								score += 40.0 // 8h rest from midnight to 08:00
							}
						} else if lastCode == "บ" {
							if optCode == "บ" {
								score += 30.0
							} else if optCode == "ช" || optCode == "Day" || optCode == "D" {
								score += 25.0 // 8h rest from midnight to 08:00
							} else if optCode == "ชบ" {
								score += 25.0
							}
						} else if lastCode == "ด" || lastCode == "Night" || lastCode == "N" {
							if optCode == "ด" || optCode == "Night" || optCode == "N" {
								if consecutiveNights[n.ID] < 2 {
									score += 500.0 // Complete standard 2-night block without breaking
								} else {
									score -= 500.0 // Strongly discourage 3rd+ consecutive night
								}
							}
						} else if lastCode == "X" || lastCode == "L" || lastCode == "" {
							if optCode == "ด" || optCode == "Night" || optCode == "N" {
								score += 80.0 // Fresh nurse after OFF can start Night block
							} else if optCode == "ช" || optCode == "Day" || optCode == "D" {
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
								score -= 200.0 // Avoid
							} else {
								score += 80.0 // Preferred
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
						if n.Position != targetRole {
							continue
						}
						if requireLeader && !n.Leader {
							continue
						}

						candidateCodes := []string{shCode}
						if req.Start == 480 && req.End == 960 {
							for _, allowedCode := range n.Allowed {
								if (allowedCode == "Day" || allowedCode == "D" || (allowedCode == "ชบ" && n.Double && doubleShiftsCount[n.ID] < r.Policy.MaxDoubleShifts)) && !containsCode(candidateCodes, allowedCode) {
									candidateCodes = append(candidateCodes, allowedCode)
								}
							}
						} else if req.Start == 0 && req.End == 480 {
							for _, allowedCode := range n.Allowed {
								if (allowedCode == "Night" || allowedCode == "N") && !containsCode(candidateCodes, allowedCode) {
									candidateCodes = append(candidateCodes, allowedCode)
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
							if r.Policy.MaxMonthlyHours > 0 && monthlyHours[n.ID]+shiftHoursMap[fCode] > r.Policy.MaxMonthlyHours {
								continue
							}
							pool = append(pool, cand{nurse: n, score: 10.0, shiftCode: fCode})
						}
					}
				}

				if len(pool) == 0 {
					return domain.Staff{}, "", false
				}

				sort.Slice(pool, func(i, j int) bool {
					return pool[i].score > pool[j].score
				})

				return pool[0].nurse, pool[0].shiftCode, true
			}

			// 1. Assign Leader RNs
			for neededLeaders > 0 {
				selNurse, selCode, found := findCandidateForRole("RN", true)
				if !found {
					break
				}
				dayAssignments[selNurse.ID] = selCode
				neededLeaders--
				if neededRN > 0 {
					neededRN--
				}
			}

			// 2. Assign regular RNs
			for neededRN > 0 {
				selNurse, selCode, found := findCandidateForRole("RN", false)
				if !found {
					break
				}
				dayAssignments[selNurse.ID] = selCode
				neededRN--
				if selNurse.Leader && neededLeaders > 0 {
					neededLeaders--
				}
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
			if code == "X" || code == "L" {
				consecutiveDays[n.ID] = 0
				consecutiveNights[n.ID] = 0
				offDays[n.ID]++
			} else {
				consecutiveDays[n.ID]++
				if isNightShift(code) {
					consecutiveNights[n.ID]++
					nightShiftsCount[n.ID]++
				} else {
					consecutiveNights[n.ID] = 0
				}
				if isEveningShift(code) {
					eveShiftsCount[n.ID]++
				}
				if isMorningShift(code) {
					morningShiftsCount[n.ID]++
				}
				if code == "ชบ" || code == "บด" || code == "ชด" {
					doubleShiftsCount[n.ID]++
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
	}

	testRoster := r
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

	out.Assignments = scheduledCells
	out.Violations = report.Violations
	out.Score = Score(testRoster, original)
	out.Diagnostics.Nodes = nodesCount
	out.Diagnostics.Exhausted = !timedOut

	return out, nil
}
