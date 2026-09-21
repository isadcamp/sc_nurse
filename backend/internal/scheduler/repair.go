package scheduler

import (
 "context"
 "fmt"
 "math"
 "math/rand"
 "sort"
 "time"

 "nurse-scheduler/backend/internal/domain"
 "nurse-scheduler/backend/internal/validation"
)

// The greedy pass supplies an incumbent; bounded neighbourhood search repairs it.
// A partial/timeout result is never evidence that the problem is infeasible.
func (ConstraintSolver) Solve(ctx context.Context, in domain.SolverInput) (domain.SolverOutput, error) {
 duration := in.MaxDuration
 if duration <= 0 || duration > 20*time.Second { duration = 20*time.Second }
 ctx, cancel := context.WithTimeout(ctx, duration)
 defer cancel()
 budget := in.MaxNodes
 if budget <= 0 || budget > 30000 { budget = 30000 }
 	phase1In := in
	phase1In.AllowPartTime = false
	out, err := solveGreedy(ctx, phase1In)
	constructionTimedOut := out.Status == "timeout"
	fmt.Printf("solveGreedy Phase 1 (Regular staff only) returned status=%s, violations=%d\n", out.Status, len(out.Violations))
	for _, v := range out.Violations {
		if v.Severity == "error" {
			fmt.Printf("solveGreedy Phase 1 ERROR: %s on %s by %s: %s\n", v.RuleCode, v.Date, v.SubjectID, v.Message)
		}
	}
	if err != nil || out.Status == "infeasible" {
		if out.Status == "infeasible" {
			out.Diagnostics.RegularSearchStatus = "invalid_fixed_data"
			out.Diagnostics.CanContinue = false
		}
		return out, err
	}
	r := in.Snapshot.Roster
	r.Leaves = in.Snapshot.Leaves

	// Complete the grid even when the construction pass reaches its budget.
	// บุคลากร PT ที่ไม่ล็อกจะถูกกรองออกใน completeGrid และ mutable()
	cells := completeGrid(r, out.Assignments, in.Scope)
 search := repairSearch{ctx:ctx, roster:r, original:r.Assignments, scope:in.Scope,
  limit:budget, random:rand.New(rand.NewSource(in.Seed)), blockers:map[string]int{}}
 search.staff = map[string]domain.Staff{}
 search.shifts = map[string]domain.RosterShift{}
 for _, n := range r.Staff { search.staff[n.ID] = n }
 for _, sh := range r.Shifts { search.shifts[sh.Code] = sh }
 best := search.evaluate(cells)
 // A rest/leave baseline gives a second independent construction path.
 baseline := search.evaluate(completeGrid(r, nil, in.Scope))
 if baseline.cost.less(best.cost) { best = baseline }
	// หากมี Incumbent จากรอบก่อนหน้า (Continue Search) ให้นำมาประเมินและใช้เป็นฐานเริ่มต้น
	if len(in.Incumbent) > 0 {
		incumbentCells := completeGrid(r, in.Incumbent, in.Scope)
		prevBest := search.evaluate(incumbentCells)
		if prevBest.cost.less(best.cost) {
			best = prevBest
		}
	}
	incumbent := best
	attempts, repairs := 0, 0
	seeds := []int64{in.Seed, in.Seed + 10007, in.Seed + 20011}
	for seedIdx := 0; seedIdx < len(seeds) && search.available(); seedIdx++ {
		if seedIdx > 0 {
			search.random = rand.New(rand.NewSource(seeds[seedIdx]))
			incumbent = best
		}
		seedAttempts := 0
		for seedAttempts < 5 && search.available() {
			attempts++
			seedAttempts++
			current := incumbent
			if seedAttempts > 1 {
				// Rebuild a short problematic window, preserving locks, leave, and scope.
				// เมื่อ attempts > 3 ขยาย window rebuild ให้กว้างขึ้น (ครอบคลุมทั้งเดือน)
				rebuilt := append([]domain.Cell(nil), incumbent.cells...)
				focus := ""
				for _, v := range incumbent.report.Violations {
					if v.Severity == "error" && v.Date != "" { focus = v.Date; break }
				}
				if focus == "" { break }
				fd, _ := time.Parse("2006-01-02", focus)
				windowRadius := seedAttempts
				if windowRadius > 4 {
					windowRadius = 4
				}
				low, high := fd.AddDate(0,0,-windowRadius).Format("2006-01-02"), fd.AddDate(0,0,windowRadius).Format("2006-01-02")
				for i,c := range rebuilt {
					if c.Date >= low && c.Date <= high && search.mutable(c) { rebuilt[i].ShiftCode = "X" }
				}
				refilled := refillWindow(search.roster, rebuilt, low, high, &search)
				current = search.evaluate(refilled)
			}
			for search.available() {
				if current.cost.hard == 0 && current.cost.shortage < 0.001 { break }
				next, changed := search.step(current)
				if !changed { break }
				current = next
				repairs++
				if current.cost.less(best.cost) { best = current }
			}
			if current.cost.less(best.cost) { best = current }
			if best.cost.hard == 0 && best.cost.shortage < 0.001 { break }
		}
		if best.cost.hard == 0 && best.cost.shortage < 0.001 { break }
	}

	// Sprint 5: ไม่เรียก assignCappedPartTimeRelief ใน AUTO flow
	// ระบบจัดคนประจำเท่านั้น — รายงานเวรขาดให้ผู้ใช้ตัดสินใจเอง

	// Prune any excess double shifts (ชบ -> ช) so evening shifts never exceed required headcount and excess OT is eliminated
	best.cells = pruneExcessDoubles(r, best.cells)
	best = search.evaluate(best.cells)

	r.Assignments = best.cells
	out.Assignments, out.Violations = best.cells, best.report.Violations
	out.Score = Score(r, search.original)
	out.Status = "partial"
	if best.report.CanSave && (!constructionTimedOut || attempts > 0) { out.Status = "complete" } else if !search.available() { out.Status = "timeout" }

	// Count part-time shifts and distinct nurses (locked PT ที่ติดมาเดิม)
	ptShifts := 0
	ptNurses := map[string]bool{}
	for _, c := range best.cells {
		if c.ShiftCode != "X" && c.ShiftCode != "L" && c.ShiftCode != "" {
			if s, ok := search.staff[c.NurseID]; ok && s.PartTime {
				ptShifts++
				ptNurses[c.NurseID] = true
			}
		}
	}
	out.Diagnostics.PartTimeShifts = ptShifts
	out.Diagnostics.PartTimeNurses = len(ptNurses)

	shortages, feasibility := buildShortageDiagnostics(r, search.original, best)
	out.Diagnostics.Nodes = search.nodes
	out.Diagnostics.Exhausted = false
	out.Diagnostics.Attempts = attempts
	out.Diagnostics.Repairs = repairs
	out.Diagnostics.BlockingRules = search.blockers
	out.Diagnostics.Shortages = shortages
	out.Diagnostics.Feasibility = feasibility
	out.Diagnostics.Strategies = []string{"greedy", "hardest_first", "shift_change", "same_day_swap", "cross_day_swap", "three_way_rotation", "off_relocation", "allowed_double_shifts", "window_rebuild_extended", "multi_seed_restart"}
	out.Diagnostics.Reason = "search_incomplete"
 if out.Status == "complete" { out.Diagnostics.Reason = "feasible_found"
 } else if feasibility == "proven_infeasible" { out.Diagnostics.Reason = "proven_infeasible"
 } else if !search.available() { out.Diagnostics.Reason = "search_budget_reached" }

 // Sprint 5: คำนวณ RegularSearchStatus และฟิลด์ใหม่
 hasInvalidFixed := detectInvalidFixedData(best)
 regularStatus := computeRegularSearchStatus(out.Status, feasibility, hasInvalidFixed)
 out.Diagnostics.RegularSearchStatus = regularStatus
 // RemainingShortages: แสดงช่องขาดปัจจุบันเสมอเมื่อยังขาด
 if len(shortages) > 0 {
  out.Diagnostics.RemainingShortages = shortages
 }
 // PartTimeRequirements: ส่งเฉพาะเมื่อยืนยันปริมาณขาดต่ำสุดแล้ว
 if regularStatus == "minimum_shortage_proven" {
  out.Diagnostics.PartTimeRequirements = buildPTRequirements(r, best)
 }
 // CanContinue: true เมื่อยังค้นหาต่อได้ (search_incomplete)
 out.Diagnostics.CanContinue = regularStatus == "search_incomplete"

 return out, nil
}

// computeRegularSearchStatus แปลง status และ feasibility เป็น regularSearchStatus ตามแผน Sprint 5
func computeRegularSearchStatus(solveStatus, feasibility string, hasInvalidFixed bool) string {
 if hasInvalidFixed {
  return "invalid_fixed_data"
 }
 if solveStatus == "complete" {
  return "complete"
 }
 if feasibility == "proven_infeasible" {
  return "minimum_shortage_proven"
 }
 return "search_incomplete"
}

// detectInvalidFixedData ตรวจว่ามี locked cells ที่ violate hard rules (ไม่ใช่ MIN_STAFFING)
// ต้องเป็น violation ที่ SubjectID ตรงกับ locked cell ในวันเดียวกันเท่านั้น — ป้องกัน false positive
func detectInvalidFixedData(best repairState) bool {
 // สร้าง set ของ (nurseID|date) ที่ locked จริง
 lockedSet := map[string]bool{}
 for _, c := range best.cells {
  if c.Locked {
   lockedSet[c.NurseID+"|"+c.Date] = true
  }
 }
 if len(lockedSet) == 0 {
  return false // ไม่มี locked cells เลย ไม่มีทางเป็น invalid_fixed_data
 }
 for _, v := range best.report.Violations {
  if v.Severity == "error" && v.RuleCode != "MIN_STAFFING" {
   // ต้องมี SubjectID และ Date และ SubjectID นั้นต้องเป็น locked cell ในวันนั้น
   if v.SubjectID != "" && v.Date != "" && lockedSet[v.SubjectID+"|"+v.Date] {
    return true
   }
  }
 }
 return false
}


// buildPTRequirements สร้างรายการ PTRequirement จาก shortage ที่ยืนยันแล้วว่าขาดต่ำสุด
// ConstraintEvidence ใช้ข้อมูลจริงจาก blockers และเหตุผลของแต่ละพยาบาล
func buildPTRequirements(r domain.Roster, best repairState) []domain.PTRequirement {
 reqs := []domain.PTRequirement{}
 current := map[string]string{}
 for _, c := range best.cells { current[c.NurseID+"|"+c.Date] = c.ShiftCode }

 for _, v := range best.report.Violations {
  if v.RuleCode != "MIN_STAFFING" || v.Date == "" { continue }
  missingRN := int(number(v.Metadata["missingRN"]))
  missingPN := int(number(v.Metadata["missingPN"]))
  missingLeaders := int(number(v.Metadata["missingLeaders"]))
  var missingSkills map[string]int
  if ms, ok := v.Metadata["missingSkills"].(map[string]int); ok { missingSkills = ms }

  // รวบรวม ConstraintEvidence จากพยาบาลที่ว่างแต่ถูกบล็อก (หลักฐานจริงเท่านั้น)
  evidence := []string{}
  evidenceSeen := map[string]bool{}
  for _, n := range r.Staff {
   if !n.Active || n.PartTime { continue }
   assignedShift := current[n.ID+"|"+v.Date]
   if assignedShift != "" && assignedShift != "X" && assignedShift != "L" { continue }
   reason := explainNurseBlocker(r, best.cells, n, v.Date)
   key := n.Name + ": " + reason
   if reason != "" && !evidenceSeen[key] {
    evidenceSeen[key] = true
    evidence = append(evidence, fmt.Sprintf("%s (%s): %s", n.Name, n.ID, reason))
   }
  }
  if len(evidence) == 0 {
   evidence = append(evidence, fmt.Sprintf("บุคลากรประจำทุกคนถูกจัดเวรหรือลาในวันที่ %s ครบแล้ว", v.Date))
  }

  // สร้าง PTRequirement ต่อประเภท
  if missingLeaders > 0 {
   reqs = append(reqs, domain.PTRequirement{
    Date: v.Date, ShiftCode: v.ShiftCode, Position: "RN",
    Missing: missingLeaders, MissingLeader: true,
    MissingSkills: missingSkills, ConstraintEvidence: evidence,
   })
  } else if missingRN > 0 {
   reqs = append(reqs, domain.PTRequirement{
    Date: v.Date, ShiftCode: v.ShiftCode, Position: "RN",
    Missing: missingRN, MissingSkills: missingSkills, ConstraintEvidence: evidence,
   })
  } else if missingPN > 0 {
   reqs = append(reqs, domain.PTRequirement{
    Date: v.Date, ShiftCode: v.ShiftCode, Position: "PN",
    Missing: missingPN, ConstraintEvidence: evidence,
   })
  }
 }
 return reqs
}



func approvedLeave(r domain.Roster, id, date string) bool {
 for _, l := range r.Leaves { if l.Approved && l.NurseID == id && date >= l.Start && date <= l.End { return true } }
 return false
}

func completeGrid(r domain.Roster, proposed []domain.Cell, scope domain.SolveScope) []domain.Cell {
 old, proposals := map[string]domain.Cell{}, map[string]domain.Cell{}
 for _, c := range r.Assignments { old[cellKey(c)] = c }
 for _, c := range proposed { proposals[cellKey(c)] = c }
 // สร้าง set ของ locked cells เพื่อตรวจสอบ PT ที่ถูก lock
 lockedKeys := map[string]bool{}
 for _, c := range r.Assignments { if c.Locked { lockedKeys[cellKey(c)] = true } }
 cells := []domain.Cell{}
 a,b := monthRange(r)
 staff := append([]domain.Staff(nil), r.Staff...)
 sort.Slice(staff,func(i,j int) bool {return staff[i].ID < staff[j].ID})
 for d:=a; d.Before(b); d=d.AddDate(0,0,1) {
  for _, n := range staff {
   if !n.Active { continue }
   c := domain.Cell{NurseID:n.ID, Date:d.Format("2006-01-02"), ShiftCode:"X", Version:1}
   // บุคลากร PT ที่ไม่มี locked cell ในขอบเขตจัดใหม่ — ข้ามไป ไม่สร้างแถว
   if n.PartTime && inScope(c, scope) && !lockedKeys[cellKey(c)] { continue }
   if previous,ok:=old[cellKey(c)]; ok { c=previous }
   if inScope(c,scope) {
    c.ShiftCode="X"
    if p,ok:=proposals[cellKey(c)];ok { c.ShiftCode=p.ShiftCode }
    if approvedLeave(r,c.NurseID,c.Date) { c.ShiftCode="L" }
   }
   // Do not create assignments outside the requested scope.
   if _,exists:=old[cellKey(c)]; !exists && !inScope(c,scope) { continue }
   cells=append(cells,c)
  }
 }
 // Preserve even invalid fixed data so validation reports it, rather than dropping it.
 for _, c := range r.Assignments {
  found:=false
  for _, x:=range cells {if cellKey(c)==cellKey(x) {found=true;break}}
  if !found && !inScope(c,scope) {cells=append(cells,c)}
 }
 return cells
}

type repairCost struct { hard int; shortage, ptCost, doubles, soft float64 }
func (a repairCost) less(b repairCost) bool {
	if a.hard != b.hard { return a.hard < b.hard }
	if math.Abs(a.shortage-b.shortage)>0.001 {return a.shortage<b.shortage}
	if math.Abs(a.ptCost-b.ptCost)>0.001 {return a.ptCost<b.ptCost}
	if a.doubles != b.doubles {return a.doubles<b.doubles}
	return a.soft < b.soft-0.001
}
type repairState struct {cells []domain.Cell; report domain.Report; cost repairCost}
type repairSearch struct {
 ctx context.Context
 roster domain.Roster
 original []domain.Cell
 scope domain.SolveScope
 staff map[string]domain.Staff
 shifts map[string]domain.RosterShift
 limit,nodes int
 random *rand.Rand
 blockers map[string]int
}
func (s *repairSearch) available() bool {return s.ctx.Err()==nil && s.nodes<s.limit}
func (s *repairSearch) mutable(c domain.Cell) bool {
 n := s.staff[c.NurseID]
 if n.PartTime { return false } // PT ไม่ถูก mutate ในขั้นจัดคนประจำ
 return inScope(c,s.scope) && n.Active && !approvedLeave(s.roster,c.NurseID,c.Date)
}
func number(v any) float64 {
 switch x:=v.(type) {case int:return float64(x);case float64:return x}
 return 0
}
func (s *repairSearch) evaluate(cells []domain.Cell) repairState {
 s.nodes++
 r:=s.roster;r.Assignments=cells
 report:=validation.Validate(r,s.original)
 cost:=repairCost{}
 for _,v:=range report.Violations {
  if v.Severity=="error" {
   if v.RuleCode=="MIN_STAFFING" {
    missing:=math.Max(0,number(v.Metadata["missingRN"]))+math.Max(0,number(v.Metadata["missingPN"]))
    missing=math.Max(missing,number(v.Metadata["missingLeaders"]))
    if skills,ok:=v.Metadata["missingSkills"].(map[string]int);ok {for _,need:=range skills {missing=math.Max(missing,float64(need))}}
    start,_:=time.Parse(time.RFC3339,fmt.Sprint(v.Metadata["start"]))
    end,_:=time.Parse(time.RFC3339,fmt.Sprint(v.Metadata["end"]))
    cost.shortage+=math.Max(1,missing)*math.Max(0.01,end.Sub(start).Hours())
   } else {cost.hard++}
  } else {
   weight:=1.0
   switch v.RuleCode {
   case "PREFERENCE":weight=s.roster.Policy.Weights.Preference
   case "TARGET_HOURS","TARGET_OFF","SHIFT_QUOTA","FAIRNESS":weight=s.roster.Policy.Weights.Fairness
   }
   cost.soft+=weight*math.Max(1,number(v.Metadata["score"]))
  }
 }
 old:=map[string]string{}
 for _,c:=range s.original {old[cellKey(c)]=c.ShiftCode}
 for _,c:=range cells {
  if s.shifts[c.ShiftCode].Double {cost.doubles++}
  if s.staff[c.NurseID].PartTime && c.ShiftCode != "X" && c.ShiftCode != "L" && c.ShiftCode != "" {
   cost.ptCost++
  }
  if previous,ok:=old[cellKey(c)];ok && previous!=c.ShiftCode {cost.soft+=s.roster.Policy.Weights.Stability}
 }
 return repairState{cells:cells,report:report,cost:cost}
}
func (s *repairSearch) allowed(c domain.Cell,code string) bool {
 if code=="X" {return true}
 sh,ok:=s.shifts[code]
 if !ok || code=="L" || code=="บด" {return false}
 n:=s.staff[c.NurseID]
 if sh.Double && !n.Double {return false}
 for _,a:=range n.Allowed {if a==code {return true}}
 return false
}
type repairMove struct {i,j,k int; a,b,c string}
func (s *repairSearch) moves(state repairState) []repairMove {
 targets:=map[int]bool{}
 // Work on scarce gaps first, not on a fixed night/morning/evening order.
 violations:=append([]domain.RuleViolation(nil),state.report.Violations...)
 candidates:=func(v domain.RuleViolation) int {
  count:=0
  for _,c:=range state.cells {if s.mutable(c) && (v.Date=="" || c.Date==v.Date) && (v.SubjectID=="" || c.NurseID==v.SubjectID) {count++}}
  return count
 }
 sort.SliceStable(violations,func(i,j int) bool {return candidates(violations[i])<candidates(violations[j])})
 for _,v:=range violations {
  if v.Severity!="error" {continue}
  for i,c:=range state.cells {
   if s.mutable(c) && (v.Date=="" || c.Date==v.Date) && (v.SubjectID=="" || c.NurseID==v.SubjectID) {targets[i]=true}
  }
 }
 moves:=[]repairMove{}
 seen:=map[repairMove]bool{}
 add:=func(m repairMove) {if !seen[m] {seen[m]=true;moves=append(moves,m)}}
 codes:=[]string{"X"}
 for code:=range s.shifts {if code!="X" {codes=append(codes,code)}}
 sort.Strings(codes)
 for i,c:=range state.cells {
  if !targets[i] {continue}
  // Move 1: Direct shift change (including allowed double shifts)
  for _,code:=range codes {
   if code!=c.ShiftCode && s.allowed(c,code) {add(repairMove{i:i,j:-1,k:-1,a:code})}
  }
  // Move 2: Same-day swap, same-nurse cross-day swap, and Smart OFF Relocation
  for j,d:=range state.cells {
   if j==i || !s.mutable(d) || c.ShiftCode==d.ShiftCode {continue}
   if c.Date==d.Date || c.NurseID==d.NurseID {
    if s.allowed(c,d.ShiftCode) && s.allowed(d,c.ShiftCode) {
     add(repairMove{i:i,j:j,k:-1,a:d.ShiftCode,b:c.ShiftCode})
    }
   }
   // Move 3: Smart OFF Relocation (ย้ายวัน OFF)
   if c.NurseID==d.NurseID && c.ShiftCode=="X" && d.ShiftCode!="X" {
    for _,code:=range codes {
     if code!="X" && s.allowed(c,code) {add(repairMove{i:i,j:j,k:-1,a:code,b:"X"})}
    }
   }
   if c.NurseID==d.NurseID && c.ShiftCode!="X" && d.ShiftCode=="X" {
    for _,code:=range codes {
     if code!="X" && s.allowed(d,code) {add(repairMove{i:i,j:j,k:-1,a:"X",b:code})}
    }
   }
  }
 }
 // Move 4: Cross-day pairwise swaps between different nurses on nearby dates (within 7 days)
 for i,c:=range state.cells {
  if !targets[i] || c.ShiftCode=="X" {continue}
  di,errI:=time.Parse("2006-01-02",c.Date)
  if errI!=nil {continue}
  for j,d:=range state.cells {
   if j<=i || !s.mutable(d) || c.NurseID==d.NurseID || d.ShiftCode=="X" || c.ShiftCode==d.ShiftCode {continue}
   dj,errJ:=time.Parse("2006-01-02",d.Date)
   if errJ!=nil {continue}
   diffDays:=int(math.Abs(di.Sub(dj).Hours()/24))
   if diffDays>0 && diffDays<=7 {
    if s.allowed(c,d.ShiftCode) && s.allowed(d,c.ShiftCode) {
     add(repairMove{i:i,j:j,k:-1,a:d.ShiftCode,b:c.ShiftCode})
    }
   }
  }
 }
 // Move 5: Multi-nurse 3-way rotation swap on the same date (A->B->C->A and A->C->B->A)
 for i,c:=range state.cells {
  if c.ShiftCode=="X" {continue}
  for j,d:=range state.cells {
   if j<=i || !s.mutable(d) || c.Date!=d.Date || c.NurseID==d.NurseID || d.ShiftCode=="X" || c.ShiftCode==d.ShiftCode {continue}
   for k,e:=range state.cells {
    if k<=j || !s.mutable(e) || d.Date!=e.Date || c.NurseID==e.NurseID || d.NurseID==e.NurseID || e.ShiftCode=="X" || e.ShiftCode==c.ShiftCode || e.ShiftCode==d.ShiftCode {continue}
    if !targets[i] && !targets[j] && !targets[k] {continue}
    // Rotation 1: i takes d's shift, j takes e's shift, k takes c's shift
    if s.allowed(c,d.ShiftCode) && s.allowed(d,e.ShiftCode) && s.allowed(e,c.ShiftCode) {
     add(repairMove{i:i,j:j,k:k,a:d.ShiftCode,b:e.ShiftCode,c:c.ShiftCode})
    }
    // Rotation 2: i takes e's shift, j takes c's shift, k takes d's shift
    if s.allowed(c,e.ShiftCode) && s.allowed(d,c.ShiftCode) && s.allowed(e,d.ShiftCode) {
     add(repairMove{i:i,j:j,k:k,a:e.ShiftCode,b:c.ShiftCode,c:d.ShiftCode})
    }
   }
  }
 }
 return moves
}
func (s *repairSearch) trial(state repairState,m repairMove) repairState {
 cells:=append([]domain.Cell(nil),state.cells...)
 cells[m.i].ShiftCode=m.a
 if m.j>=0 {cells[m.j].ShiftCode=m.b}
 if m.k>=0 {cells[m.k].ShiftCode=m.c}
 return s.evaluate(cells)
}
func (s *repairSearch) step(state repairState) (repairState,bool) {
 moves:=s.moves(state)
 // Seeded order varies ties and the sequence used to rebuild damaged windows.
 s.random.Shuffle(len(moves),func(i,j int){moves[i],moves[j]=moves[j],moves[i]})
 best:=state
 beam:=[]repairState{}
 for _,m:=range moves {
  if !s.available() {break}
  next:=s.trial(state,m)
  if next.cost.less(best.cost) {best=next}
  if next.cost.hard>state.cost.hard {
   for _,v:=range next.report.Violations {if v.Severity=="error" && v.RuleCode!="MIN_STAFFING" {s.blockers[v.RuleCode]++}}
  }
  // Retain a few alternatives for a two-move repair across a local plateau.
  beam=append(beam,next)
  sort.SliceStable(beam,func(i,j int)bool{return beam[i].cost.less(beam[j].cost)})
  if len(beam)>4 {beam=beam[:4]}
 }
 if best.cost.less(state.cost) {return best,true}
 for _,alternative:=range beam {
  for _,m:=range s.moves(alternative) {
   if !s.available() {return best,best.cost.less(state.cost)}
   next:=s.trial(alternative,m)
   if next.cost.less(state.cost) {return next,true}
  }
 }
 return state,false
}

// refillWindow performs a targeted constructive fill for the rebuilt window [low, high]
func refillWindow(r domain.Roster, cells []domain.Cell, low, high string, s *repairSearch) []domain.Cell {
 res:=append([]domain.Cell(nil),cells...)
 cellMap:=map[string]int{}
 for idx,c:=range res {cellMap[c.NurseID+"|"+c.Date]=idx}
 a,errA:=time.Parse("2006-01-02",low)
 b,errB:=time.Parse("2006-01-02",high)
 if errA!=nil || errB!=nil {return res}
 for d:=a;!d.After(b);d=d.AddDate(0,0,1) {
  ds:=d.Format("2006-01-02")
  staffing:=staffingForDate(r,ds)
  sort.SliceStable(staffing,func(i,j int)bool{return staffing[i].Start<staffing[j].Start})
  for _,req:=range staffing {
   matchCode:=""
   for _,sh:=range r.Shifts {
    if sh.Code=="X" || sh.Code=="L" || sh.Code=="บด" {continue}
    for _,p:=range sh.Periods {
     if p.Start<=req.Start && p.End>=req.End {matchCode=sh.Code;break}
    }
    if matchCode!="" {break}
   }
   if matchCode=="" {continue}
   reqRole:="RN"
   if req.RN==0 && req.Leaders==0 && req.PN>0 {reqRole="PN"}
   needed:=req.RN+req.PN+req.Leaders
   for _,n:=range r.Staff {
    if needed<=0 {break}
    if n.Position!=reqRole {continue}
    idx,ok:=cellMap[n.ID+"|"+ds]
    if !ok || res[idx].ShiftCode!="X" || !s.mutable(res[idx]) || !s.allowed(res[idx],matchCode) {continue}
    if candidateSafe(r,res,nil,nil,n,ds,matchCode) {
     res[idx].ShiftCode=matchCode
     needed--
    }
   }
  }
 }
 return res
}

func explainNurseBlocker(r domain.Roster, cells []domain.Cell, n domain.Staff, date string) string {
 if approvedLeave(r,n.ID,date) {return "ติดวันลาพักผ่อนที่อนุมัติแล้ว"}
 for _,c:=range cells {
  if c.NurseID==n.ID && c.Date==date && c.Locked {return fmt.Sprintf("ติดเวรล็อก (%s)",c.ShiftCode)}
 }
 t,err:=time.Parse("2006-01-02",date)
 if err==nil {
  prevDate:=t.AddDate(0,0,-1).Format("2006-01-02")
  nextDate:=t.AddDate(0,0,1).Format("2006-01-02")
  prevShift,nextShift:="",""
  for _,c:=range r.Boundary {if c.NurseID==n.ID && c.Date==prevDate {prevShift=c.ShiftCode}}
  for _,c:=range cells {
   if c.NurseID==n.ID {
    if c.Date==prevDate {prevShift=c.ShiftCode} else if c.Date==nextDate {nextShift=c.ShiftCode}
   }
  }
  if prevShift=="ด" || prevShift=="Night" || prevShift=="N" || prevShift=="บด" {
   return fmt.Sprintf("ติดกฎเวลาพัก: วันก่อนหน้าขึ้นเวรดึก (%s)",prevShift)
  }
  if nextShift=="ช" || nextShift=="Day" || nextShift=="D" || nextShift=="ชบ" {
   return fmt.Sprintf("ติดกฎเวลาพัก: วันถัดไปขึ้นเวรเช้า (%s)",nextShift)
  }
 }
 return "ติดเงื่อนไขการกระจายวันหยุดหรือเพดานชั่วโมงสะสม"
}

func buildShortageDiagnostics(r domain.Roster, original []domain.Cell, best repairState) ([]domain.ShortageDetail, string) {
 shortages:=[]domain.ShortageDetail{}
 if best.cost.hard==0 && best.cost.shortage<0.001 {return shortages,"feasible"}
 current:=map[string]string{}
 for _,c:=range best.cells {current[c.NurseID+"|"+c.Date]=c.ShiftCode}
 for _,v:=range best.report.Violations {
  if v.RuleCode!="MIN_STAFFING" || v.Date=="" {continue}
  missingRN:=int(number(v.Metadata["missingRN"]))
  missingPN:=int(number(v.Metadata["missingPN"]))
  missingLeaders:=int(number(v.Metadata["missingLeaders"]))
  var missingSkills map[string]int
  if ms,ok:=v.Metadata["missingSkills"].(map[string]int);ok {missingSkills=ms}
  pos:="RN"
  missingCount:=missingRN
  reqCount:=int(number(v.Metadata["reqRN"]))
  assignedCount:=int(number(v.Metadata["rn"]))
  if missingPN>0 && missingRN==0 {
   pos="PN"
   missingCount=missingPN
   reqCount=int(number(v.Metadata["reqPN"]))
   assignedCount=int(number(v.Metadata["pn"]))
  } else if missingLeaders>0 && missingCount==0 {
   pos="หัวหน้าเวร (Leader)"
   missingCount=missingLeaders
   reqCount=int(number(v.Metadata["reqLeaders"]))
   assignedCount=int(number(v.Metadata["leaders"]))
  }
  blockers:=[]string{}
  blockerSeen:=map[string]bool{}
  suggestions:=[]string{}
  for _,n:=range r.Staff {
   if !n.Active || (pos=="RN" && n.Position!="RN") || (pos=="PN" && n.Position!="PN") {continue}
   assignedShift:=current[n.ID+"|"+v.Date]
   if assignedShift!="" && assignedShift!="X" && assignedShift!="L" {continue}
   reason:=explainNurseBlocker(r,best.cells,n,v.Date)
   if reason!="" && !blockerSeen[n.Name+": "+reason] {
    blockerSeen[n.Name+": "+reason]=true
    blockers=append(blockers,fmt.Sprintf("%s (%s): %s",n.Name,n.ID,reason))
   }
   if !n.Double && r.Policy.MaxDoubleShifts>0 {
    suggestions=append(suggestions,fmt.Sprintf("หากเปิดสิทธิ์เวรควบให้ %s (%s) จะสามารถช่วยขึ้นเวรวันที่ %s ได้",n.Name,n.ID,v.Date))
   }
  }
  suggestions=append(suggestions,fmt.Sprintf("ขออัตรากำลังเสริม %s จำนวน %d คน สำหรับวันที่ %s",pos,missingCount,v.Date))
  shortages=append(shortages,domain.ShortageDetail{
   Date:v.Date,
   ShiftCode:v.ShiftCode,
   Position:pos,
   Required:reqCount,
   Assigned:assignedCount,
   Missing:missingCount,
   MissingSkills:missingSkills,
   BlockingRules:blockers,
   Suggestions:suggestions,
  })
 }
	provenInfeasible := false
	for _, s := range shortages {
		availForDate := 0
		for _, n := range r.Staff {
			if !n.Active || n.PartTime || approvedLeave(r, n.ID, s.Date) {
				continue
			}
			if s.Position == "PN" && n.Position != "PN" {
				continue
			}
			if s.Position == "RN" && n.Position != "RN" {
				continue
			}
			if s.Position == "หัวหน้าเวร (Leader)" && (!n.Leader || n.Position != "RN") {
				continue
			}
			availForDate++
		}
		if s.Required > availForDate {
			provenInfeasible = true
			break
		}
	}
	feasibility := "search_incomplete"
	if provenInfeasible {
		feasibility = "proven_infeasible"
	}
	return shortages, feasibility
}

// candidateSafe uses the same validator as save/apply, with the nurse's complete
// month (future unlocked cells remain OFF). It reserves OFF and accounts for
// locked future work, approved leave, rolling hours and month boundaries.
func candidateSafe(r domain.Roster, scheduled []domain.Cell, day map[string]string, fixed map[string]domain.Cell, n domain.Staff, date, code string) bool {
 one:=r
 one.Staff=[]domain.Staff{n}
 one.Policy.Staffing=nil
 one.Policy.Preferences=nil
 one.Policy.Targets=nil
 one.Assignments=nil
 one.Boundary=nil
 for _,c:=range r.Boundary {if c.NurseID==n.ID {one.Boundary=append(one.Boundary,c)}}
 previous:=map[string]domain.Cell{}
 for _,c:=range scheduled {if c.NurseID==n.ID {previous[c.Date]=c}}
 a,b:=monthRange(r)
 for d:=a;d.Before(b);d=d.AddDate(0,0,1) {
  ds:=d.Format("2006-01-02")
  c:=domain.Cell{NurseID:n.ID,Date:ds,ShiftCode:"X",Version:1}
  if approvedLeave(r,n.ID,ds) {c.ShiftCode="L"}
  if p,ok:=previous[ds];ok {c=p}
  if p,ok:=fixed[cellKey(c)];ok {c=p}
  if ds==date {c.ShiftCode=code}
  one.Assignments=append(one.Assignments,c)
 }
 return validation.Validate(one,nil).CanSave
}

func assignCappedPartTimeRelief(ctx context.Context, in domain.SolverInput, r domain.Roster, best repairState, search *repairSearch) (repairState, domain.Roster) {
	maxRN := in.MaxPartTimeRN
	if maxRN <= 0 {
		maxRN = 2 // default cap 2 RNs
	}
	maxPN := in.MaxPartTimePN
	if maxPN <= 0 {
		maxPN = 1 // default cap 1 PN
	}
	maxShifts := in.MaxPartTimeShifts

	var reliefStaff []domain.Staff
	if maxRN >= 1 {
		reliefStaff = append(reliefStaff, domain.Staff{
			ID:       "PT-Lead-1",
			Name:     "[PT] เวรเสริม หัวหน้า 1",
			Position: "RN",
			Leader:   true,
			Double:   true,
			PartTime: true,
			Active:   true,
			Allowed:  []string{"ช", "บ", "ด", "ชบ", "Day", "Night", "D", "N", "X", "L"},
		})
	}
	for i := 2; i <= maxRN; i++ {
		reliefStaff = append(reliefStaff, domain.Staff{
			ID:       fmt.Sprintf("PT-RN-%d", i),
			Name:     fmt.Sprintf("[PT] เวรเสริม RN %d", i),
			Position: "RN",
			Leader:   false,
			Double:   true,
			PartTime: true,
			Active:   true,
			Allowed:  []string{"ช", "บ", "ด", "ชบ", "Day", "Night", "D", "N", "X", "L"},
		})
	}
	for i := 1; i <= maxPN; i++ {
		reliefStaff = append(reliefStaff, domain.Staff{
			ID:       fmt.Sprintf("PT-PN-%d", i),
			Name:     fmt.Sprintf("[PT] เวรเสริม PN %d", i),
			Position: "PN",
			Leader:   false,
			Double:   true,
			PartTime: true,
			Active:   true,
			Allowed:  []string{"ช", "บ", "ด", "ชบ", "Day", "Night", "D", "N", "X", "L"},
		})
	}

	for _, s := range reliefStaff {
		r.Staff = append(r.Staff, s)
		search.staff[s.ID] = s
	}
	search.roster = r

	a, b := monthRange(r)
	cellMap := map[string]int{}
	for idx, c := range best.cells {
		cellMap[c.NurseID+"|"+c.Date] = idx
	}
	for _, s := range reliefStaff {
		for d := a; d.Before(b); d = d.AddDate(0, 0, 1) {
			ds := d.Format("2006-01-02")
			key := s.ID + "|" + ds
			if _, exists := cellMap[key]; !exists {
				cellMap[key] = len(best.cells)
				best.cells = append(best.cells, domain.Cell{
					NurseID:   s.ID,
					Date:      ds,
					ShiftCode: "X",
					Version:   1,
				})
			}
		}
	}

	findStandardShift := func(startMin, endMin int) string {
		for _, sh := range r.Shifts {
			if sh.Code == "X" || sh.Code == "L" || sh.Double || len(sh.Periods) != 1 {
				continue
			}
			if sh.Periods[0].Start == startMin && sh.Periods[0].End == endMin {
				return sh.Code
			}
		}
		for _, sh := range r.Shifts {
			if sh.Code == "X" || sh.Code == "L" {
				continue
			}
			for _, p := range sh.Periods {
				if p.Start <= startMin && p.End >= endMin {
					return sh.Code
				}
			}
		}
		if startMin == 0 {
			return "ด"
		}
		if startMin == 480 {
			return "ช"
		}
		if startMin == 960 {
			return "บ"
		}
		return ""
	}

	canAssignPT := func(s domain.Staff, d time.Time, ds, shCode string) bool {
		cIdx, exists := cellMap[s.ID+"|"+ds]
		if !exists || best.cells[cIdx].ShiftCode != "X" {
			return false
		}
		prevDate := d.AddDate(0, 0, -1).Format("2006-01-02")
		if pIdx, ok := cellMap[s.ID+"|"+prevDate]; ok {
			if !isValidRestShift(best.cells[pIdx].ShiftCode, shCode, r) {
				return false
			}
		}
		nextDate := d.AddDate(0, 0, 1).Format("2006-01-02")
		if nIdx, ok := cellMap[s.ID+"|"+nextDate]; ok {
			if !isValidRestShift(shCode, best.cells[nIdx].ShiftCode, r) {
				return false
			}
		}
		consecDays := 1
		for back := 1; back <= 6; back++ {
			bd := d.AddDate(0, 0, -back).Format("2006-01-02")
			if bIdx, ok := cellMap[s.ID+"|"+bd]; ok && best.cells[bIdx].ShiftCode != "X" && best.cells[bIdx].ShiftCode != "L" && best.cells[bIdx].ShiftCode != "" {
				consecDays++
			} else {
				break
			}
		}
		for fwd := 1; fwd <= 6; fwd++ {
			fd := d.AddDate(0, 0, fwd).Format("2006-01-02")
			if fIdx, ok := cellMap[s.ID+"|"+fd]; ok && best.cells[fIdx].ShiftCode != "X" && best.cells[fIdx].ShiftCode != "L" && best.cells[fIdx].ShiftCode != "" {
				consecDays++
			} else {
				break
			}
		}
		if consecDays > 6 {
			return false
		}
		if isNight(shCode) {
			consecNights := 1
			for back := 1; back <= 3; back++ {
				bd := d.AddDate(0, 0, -back).Format("2006-01-02")
				if bIdx, ok := cellMap[s.ID+"|"+bd]; ok && isNight(best.cells[bIdx].ShiftCode) {
					consecNights++
				} else {
					break
				}
			}
			for fwd := 1; fwd <= 3; fwd++ {
				fd := d.AddDate(0, 0, fwd).Format("2006-01-02")
				if fIdx, ok := cellMap[s.ID+"|"+fd]; ok && isNight(best.cells[fIdx].ShiftCode) {
					consecNights++
				} else {
					break
				}
			}
			if consecNights > 3 {
				return false
			}
		}
		return true
	}

	assignedPTShifts := 0
	violations := append([]domain.RuleViolation(nil), best.report.Violations...)
	sort.SliceStable(violations, func(i, j int) bool {
		return violations[i].Date < violations[j].Date
	})

	for _, v := range violations {
		if v.Severity != "error" || v.RuleCode != "MIN_STAFFING" {
			continue
		}
		if maxShifts > 0 && assignedPTShifts >= maxShifts {
			break
		}
		d, err := time.Parse("2006-01-02", v.Date)
		if err != nil {
			continue
		}
		ds := v.Date

		st, _ := time.Parse(time.RFC3339, fmt.Sprint(v.Metadata["start"]))
		en, _ := time.Parse(time.RFC3339, fmt.Sprint(v.Metadata["end"]))
		startMin := st.Hour()*60 + st.Minute()
		endMin := en.Hour()*60 + en.Minute()
		if endMin == 0 && (en.Day() > st.Day() || en.Sub(st) > 0) {
			endMin = 1440
		}
		shCode := findStandardShift(startMin, endMin)
		if shCode == "" {
			continue
		}

		missingLead := int(number(v.Metadata["missingLeaders"]))
		missingRN := int(number(v.Metadata["missingRN"]))
		missingPN := int(number(v.Metadata["missingPN"]))

		for missingLead > 0 && (maxShifts <= 0 || assignedPTShifts < maxShifts) {
			assigned := false
			for _, s := range reliefStaff {
				if !s.Leader {
					continue
				}
				if canAssignPT(s, d, ds, shCode) {
					best.cells[cellMap[s.ID+"|"+ds]].ShiftCode = shCode
					assignedPTShifts++
					missingLead--
					if missingRN > 0 {
						missingRN--
					}
					assigned = true
					break
				}
			}
			if !assigned {
				break
			}
		}

		for missingRN > 0 && (maxShifts <= 0 || assignedPTShifts < maxShifts) {
			assigned := false
			for _, s := range reliefStaff {
				if s.Position != "RN" {
					continue
				}
				if canAssignPT(s, d, ds, shCode) {
					best.cells[cellMap[s.ID+"|"+ds]].ShiftCode = shCode
					assignedPTShifts++
					missingRN--
					assigned = true
					break
				}
			}
			if !assigned {
				break
			}
		}

		for missingPN > 0 && (maxShifts <= 0 || assignedPTShifts < maxShifts) {
			assigned := false
			for _, s := range reliefStaff {
				if s.Position != "PN" {
					continue
				}
				if canAssignPT(s, d, ds, shCode) {
					best.cells[cellMap[s.ID+"|"+ds]].ShiftCode = shCode
					assignedPTShifts++
					missingPN--
					assigned = true
					break
				}
			}
			if !assigned {
				break
			}
		}
	}

	best = search.evaluate(best.cells)
	for attempts := 0; attempts < 2 && search.available(); attempts++ {
		if best.cost.hard == 0 && best.cost.shortage < 0.001 {
			break
		}
		next, changed := search.step(best)
		if !changed {
			break
		}
		best = next
	}

	usedStaff := map[string]bool{}
	for _, c := range best.cells {
		if c.ShiftCode != "X" && c.ShiftCode != "L" && c.ShiftCode != "" {
			if s, ok := search.staff[c.NurseID]; ok && s.PartTime {
				usedStaff[c.NurseID] = true
			}
		}
	}

	var finalStaff []domain.Staff
	for _, s := range r.Staff {
		if !s.PartTime || usedStaff[s.ID] {
			finalStaff = append(finalStaff, s)
		}
	}
	r.Staff = finalStaff

	var finalCells []domain.Cell
	for _, c := range best.cells {
		if s, ok := search.staff[c.NurseID]; !ok || !s.PartTime || usedStaff[c.NurseID] {
			finalCells = append(finalCells, c)
		}
	}
	best.cells = finalCells
	best = search.evaluate(best.cells)

	return best, r
}

func isValidRestShift(prevCode, nextCode string, r domain.Roster) bool {
	if prevCode == "" || prevCode == "X" || prevCode == "L" || prevCode == "OFF" || prevCode == "Va" {
		return true
	}
	if nextCode == "" || nextCode == "X" || nextCode == "L" || nextCode == "OFF" || nextCode == "Va" {
		return true
	}
	if isNight(prevCode) && isMorning(nextCode) {
		return false
	}
	if isEvening(prevCode) && isNight(nextCode) {
		return false
	}
	if isNight(prevCode) && isEvening(nextCode) {
		return false
	}
	shiftMap := map[string]domain.RosterShift{}
	for _, sh := range r.Shifts {
		shiftMap[sh.Code] = sh
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
		minRest = 11.0
	}
	return float64(restMinutes)/60.0 >= (minRest - 1e-6)
}

func isNight(code string) bool {
	return code == "ด" || code == "N" || code == "Night" || code == "12N" || code == "ชด"
}
func isMorning(code string) bool {
	return code == "ช" || code == "M" || code == "Morning" || code == "12D" || code == "Day" || code == "D" || code == "ชบ" || code == "ชด"
}
func isEvening(code string) bool {
	return code == "บ" || code == "E" || code == "Evening" || code == "บด" || code == "ชบ"
}
