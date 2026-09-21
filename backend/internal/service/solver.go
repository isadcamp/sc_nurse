package service

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"log"
	"nurse-scheduler/backend/internal/domain"
	"nurse-scheduler/backend/internal/repository"
	"nurse-scheduler/backend/internal/scheduler"
	"nurse-scheduler/backend/internal/validation"
	"strings"
	"sync"
	"time"
)

type ReadinessError struct{ Report domain.ReadinessReport }

func (e *ReadinessError) Error() string {
	return "ข้อมูลยังไม่พร้อมจัดเวร"
}

type GenerateCommand struct {
	WardID            string            `json:"wardId"`
	Month             int               `json:"month"`
	Year              int               `json:"year"`
	Revision          string            `json:"revision"`
	PolicyVersion     string            `json:"policyVersion"`
	Scope             domain.SolveScope `json:"scope"`
	Seed              int64             `json:"seed"`
	AllowPartTime     bool              `json:"allowPartTime"`
	MaxPartTimeRN     int               `json:"maxPartTimeRN"`
	MaxPartTimePN     int               `json:"maxPartTimePN"`
	MaxPartTimeShifts int               `json:"maxPartTimeShifts"`
	PreviousJobID     string            `json:"previousJobId,omitempty"`
	Profile           string            `json:"profile,omitempty"`
}
type SolverService struct {
	Roster  *RosterService
	Jobs    repository.SolverStore
	Solver  domain.Solver
	mu      sync.Mutex
	running map[string]context.CancelFunc
}

func (s *SolverService) Readiness(ctx context.Context, id int64, a domain.Actor, simulation bool) (domain.ReadinessReport, error) {
	r, e := s.Roster.Get(ctx, id, a)
	if e != nil {
		return domain.ReadinessReport{}, e
	}
	return scheduler.Readiness(r, simulation)
}
func (s *SolverService) Start(ctx context.Context, id int64, a domain.Actor, c GenerateCommand, simulation bool) (domain.SolverJob, error) {
	r, e := s.Roster.Get(ctx, id, a)
	if e != nil {
		return domain.SolverJob{}, e
	}
	if !Allowed(a, r.WardID, true) {
		return domain.SolverJob{}, repository.ErrForbidden
	}
	if (r.Status != domain.StatusDraft && r.Status != domain.StatusGenerated) || c.WardID != r.WardID || c.Month != r.Month || c.Year != r.Year {
		return domain.SolverJob{}, repository.ErrConflict
	}
	if e = scheduler.ValidateScope(r, c.Scope); e != nil {
		return domain.SolverJob{}, e
	}
	readiness, e := scheduler.Readiness(r, simulation)
	if e != nil {
		return domain.SolverJob{}, e
	}
	if c.Revision != readiness.Revision || c.PolicyVersion != r.Policy.Version {
		return domain.SolverJob{}, repository.ErrConflict
	}
	if !readiness.Ready {
		return domain.SolverJob{}, &ReadinessError{readiness}
	}
	snapshot, e := scheduler.Snapshot(r)
	if e != nil {
		return domain.SolverJob{}, e
	}

	// หากเป็นการค้นหาต่อ (Continue Search) ตรวจสอบ Snapshot Hash เดิม
	var incumbent []domain.Cell
	seed := c.Seed
	if c.PreviousJobID != "" {
		prevJob, prevErr := s.Jobs.GetJob(ctx, c.PreviousJobID)
		if prevErr == nil && prevJob.Result != nil && len(prevJob.Result.Assignments) > 0 {
			// ถ้ารหัส Hash ตรงกัน (ข้อมูลไม่เปลี่ยน) ให้นำตารางที่ดีที่สุดเดิมมารันต่อ
			if prevJob.Input.Snapshot.Hash == snapshot.Hash {
				incumbent = prevJob.Result.Assignments
				if seed == 0 || seed == prevJob.Input.Seed {
					seed = prevJob.Input.Seed + 10007
				}
			}
		}
	}

	var bytes [16]byte
	if _, e = rand.Read(bytes[:]); e != nil {
		return domain.SolverJob{}, e
	}
	now := time.Now().UTC()
	j := domain.SolverJob{ID: hex.EncodeToString(bytes[:]), ScheduleID: id, WardID: r.WardID, ActorID: a.ID, Status: "pending", Simulation: simulation, CreatedAt: now, UpdatedAt: now, Before: scheduler.Score(r, r.Assignments), Input: domain.SolverInput{
		Snapshot:          snapshot,
		Scope:             c.Scope,
		Seed:              seed,
		MaxDuration:       20 * time.Second,
		MaxNodes:          30000,
		AllowPartTime:     c.AllowPartTime,
		MaxPartTimeRN:     c.MaxPartTimeRN,
		MaxPartTimePN:     c.MaxPartTimePN,
		MaxPartTimeShifts: c.MaxPartTimeShifts,
		Incumbent:         incumbent,
		PreviousJobID:     c.PreviousJobID,
		Profile:           c.Profile,
	}}
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.running == nil {
		s.running = map[string]context.CancelFunc{}
	}
	if len(s.running) >= 2 {
		return domain.SolverJob{}, repository.ErrConflict
	}
	if e = s.Jobs.CreateJob(ctx, j); e != nil {
		return domain.SolverJob{}, e
	}
	jobCtx, cancel := context.WithCancel(context.Background())
	s.running[j.ID] = cancel
	go s.run(jobCtx, j)
	return j, nil
}

func (s *SolverService) SolveMulti(ctx context.Context, id int64, a domain.Actor, c GenerateCommand, simulation bool) (domain.MultiPlanResponse, error) {
	r, e := s.Roster.Get(ctx, id, a)
	if e != nil {
		return domain.MultiPlanResponse{}, e
	}
	if !Allowed(a, r.WardID, true) {
		return domain.MultiPlanResponse{}, repository.ErrForbidden
	}
	if (r.Status != domain.StatusDraft && r.Status != domain.StatusGenerated) || c.WardID != r.WardID || c.Month != r.Month || c.Year != r.Year {
		return domain.MultiPlanResponse{}, repository.ErrConflict
	}
	if e = scheduler.ValidateScope(r, c.Scope); e != nil {
		return domain.MultiPlanResponse{}, e
	}
	readiness, e := scheduler.Readiness(r, simulation)
	if e != nil {
		return domain.MultiPlanResponse{}, e
	}
	if c.Revision != readiness.Revision || c.PolicyVersion != r.Policy.Version {
		return domain.MultiPlanResponse{}, repository.ErrConflict
	}
	if !readiness.Ready {
		return domain.MultiPlanResponse{}, &ReadinessError{readiness}
	}
	snapshot, e := scheduler.Snapshot(r)
	if e != nil {
		return domain.MultiPlanResponse{}, e
	}

	profiles := []struct {
		Profile     string
		Title       string
		Description string
		SeedDelta   int64
	}{
		{
			Profile:     "coverage_first",
			Title:       "แผน A: เน้นเวรไม่ขาด & ย่นวันหยุด (Coverage First & Zero Deficit)",
			Description: "ดึงคนที่พักครบ 1 วันมาช่วยเวรทันที เติมคนให้ครบทุกช่วงเวลา ไม่ปล่อยให้มีวันหยุด 3 วันเมื่อเวรขาด",
			SeedDelta:   0,
		},
		{
			Profile:     "balanced",
			Title:       "แผน B: สมดุลมาตรฐาน 8 ชม. (Standard Balanced)",
			Description: "เน้นเวร 8 ชม. กระจายชั่วโมงทำงานและวันหยุด 1-2 วันให้เท่าเทียมกันอย่างสม่ำเสมอ",
			SeedDelta:   1001,
		},
		{
			Profile:     "rest_focused",
			Title:       "แผน C: เน้นวันหยุดยาว & พักผ่อน (Quality Rest)",
			Description: "ดึงเวร 12 ชม./ควบเวรมาจับคู่เพื่อรวบวันทำงาน เพิ่มวันหยุดพักผ่อนติดกัน 2-3 วัน",
			SeedDelta:   2002,
		},
	}

	results := make([]domain.MultiPlanOption, len(profiles))
	baseSeed := c.Seed
	if baseSeed == 0 {
		baseSeed = time.Now().UnixNano()
	}

	var wg sync.WaitGroup
	var mu sync.Mutex

	for idx, p := range profiles {
		wg.Add(1)
		go func(i int, prof struct {
			Profile     string
			Title       string
			Description string
			SeedDelta   int64
		}) {
			defer wg.Done()

			var bytes [16]byte
			if _, err := rand.Read(bytes[:]); err != nil {
				return
			}
			jobID := hex.EncodeToString(bytes[:])
			now := time.Now().UTC()

			input := domain.SolverInput{
				Snapshot:          snapshot,
				Scope:             c.Scope,
				Seed:              baseSeed + prof.SeedDelta,
				MaxDuration:       12 * time.Second,
				MaxNodes:          30000,
				AllowPartTime:     c.AllowPartTime,
				MaxPartTimeRN:     c.MaxPartTimeRN,
				MaxPartTimePN:     c.MaxPartTimePN,
				MaxPartTimeShifts: c.MaxPartTimeShifts,
				Profile:           prof.Profile,
			}

			job := domain.SolverJob{
				ID:         jobID,
				ScheduleID: id,
				WardID:     r.WardID,
				ActorID:    a.ID,
				Status:     "running",
				Simulation: simulation,
				CreatedAt:  now,
				UpdatedAt:  now,
				Before:     scheduler.Score(r, r.Assignments),
				Input:      input,
			}

			_ = s.Jobs.CreateJob(ctx, job)

			out, solveErr := s.Solver.Solve(ctx, input)
			if solveErr != nil {
				job.Status = "failed"
				job.Error = solveErr.Error()
				_ = s.Jobs.UpdateJob(ctx, job, "running")
				return
			}

			job.Status = "completed"
			job.Progress = 100
			job.Result = &out
			_ = s.Jobs.UpdateJob(ctx, job, "running")

			var metrics domain.PlanMetrics
			if out.Metrics != nil {
				metrics = *out.Metrics
			} else {
				metrics = scheduler.CalculatePlanMetrics(r, out.Assignments)
			}

			mu.Lock()
			results[i] = domain.MultiPlanOption{
				Profile:     prof.Profile,
				Title:       prof.Title,
				Description: prof.Description,
				JobID:       jobID,
				Result:      out,
				Metrics:     metrics,
			}
			mu.Unlock()
		}(idx, p)
	}

	wg.Wait()

	var finalResults []domain.MultiPlanOption
	for _, opt := range results {
		if opt.JobID != "" {
			finalResults = append(finalResults, opt)
		}
	}

	return domain.MultiPlanResponse{Plans: finalResults}, nil
}
func (s *SolverService) run(ctx context.Context, j domain.SolverJob) {
	defer func() {
		s.mu.Lock()
		if cancel := s.running[j.ID]; cancel != nil {
			cancel()
		}
		delete(s.running, j.ID)
		s.mu.Unlock()
	}()
	j.Status = "running"
	j.Progress = 10
	j.UpdatedAt = time.Now().UTC()
	if e := s.Jobs.UpdateJob(context.Background(), j, "pending"); e != nil {
		return
	}
	result, e := s.Solver.Solve(ctx, j.Input)
	j.UpdatedAt = time.Now().UTC()
	j.Progress = 100
	j.Status = "completed"
	if e != nil {
		j.Status = "failed"
		j.Error = "solver failed"
		log.Printf("solver job %s: %v", j.ID, e)
	} else {
		j.Result = &result
	}
	if ctx.Err() != nil {
		j.Status = "cancelled"
		j.Result = nil
	}
	current, err := s.Roster.Store.Get(context.Background(), j.ScheduleID)
	if err != nil {
		j.Stale = true
	} else {
		snap, err := scheduler.Snapshot(current)
		j.Stale = err != nil || snap.Hash != j.Input.Snapshot.Hash
	}
	if err = s.Jobs.UpdateJob(context.Background(), j, "running"); err != nil {
		log.Printf("persist solver job %s: %v", j.ID, err)
	}
}
func (s *SolverService) Get(ctx context.Context, id string, a domain.Actor) (domain.SolverJob, error) {
	j, e := s.Jobs.GetJob(ctx, id)
	if e != nil {
		return j, e
	}
	if !Allowed(a, j.WardID, false) {
		return domain.SolverJob{}, repository.ErrForbidden
	}
	r, e := s.Roster.Get(ctx, j.ScheduleID, a)
	if e != nil {
		return domain.SolverJob{}, e
	}
	snap, e := scheduler.Snapshot(r)
	if e != nil {
		return domain.SolverJob{}, e
	}
	j.Stale = j.Stale || snap.Hash != j.Input.Snapshot.Hash
	return j, nil
}
func (s *SolverService) Cancel(ctx context.Context, id string, a domain.Actor) (domain.SolverJob, error) {
	j, e := s.Get(ctx, id, a)
	if e != nil {
		return j, e
	}
	if !Allowed(a, j.WardID, true) {
		return domain.SolverJob{}, repository.ErrForbidden
	}
	if j.Status != "pending" && j.Status != "running" {
		return j, repository.ErrConflict
	}
	previous := j.Status
	j.Status = "cancelled"
	j.UpdatedAt = time.Now().UTC()
	if e = s.Jobs.UpdateJob(ctx, j, previous); e != nil {
		return j, e
	}
	s.mu.Lock()
	if cancel := s.running[id]; cancel != nil {
		cancel()
	}
	s.mu.Unlock()
	return j, nil
}
func solverResultCanApply(out *domain.SolverOutput) bool {
	if len(out.Assignments) == 0 {
		return false
	}
	if out.Status == "complete" {
		return true
	}
	if out.Diagnostics.RegularSearchStatus == "invalid_fixed_data" {
		return false
	}
	switch out.Diagnostics.RegularSearchStatus {
	case "search_incomplete", "minimum_shortage_proven":
		return true
	}
	return onlySolverOutputStaffingErrors(out)
}

func onlySolverOutputStaffingErrors(out *domain.SolverOutput) bool {
	for _, v := range out.Violations {
		if v.Severity != "error" {
			continue
		}
		if v.RuleCode != "MIN_STAFFING" {
			return false
		}
	}
	return out.Status == "partial" || out.Status == "timeout"
}

func onlyStaffingShortageErrors(report domain.Report) bool {
	hasStaffingError := false
	for _, v := range report.Violations {
		if v.Severity != "error" {
			continue
		}
		if v.RuleCode != "MIN_STAFFING" {
			return false
		}
		hasStaffingError = true
	}
	return hasStaffingError
}
func (s *SolverService) Apply(ctx context.Context, id string, a domain.Actor) (domain.Roster, error) {
	j, e := s.Get(ctx, id, a)
	if e != nil {
		return domain.Roster{}, e
	}
	if !Allowed(a, j.WardID, true) {
		return domain.Roster{}, repository.ErrForbidden
	}
	if j.Applied || j.Status != "completed" || j.Result == nil || !solverResultCanApply(j.Result) {
		return domain.Roster{}, repository.ErrConflict
	}
	roster, e := s.Roster.Store.Change(ctx, j.ScheduleID, func(r *domain.Roster) (domain.Audit, error) {
		if r.Status != domain.StatusDraft && r.Status != domain.StatusGenerated {
			return domain.Audit{}, repository.ErrConflict
		}
		if r.Policy.Status != "confirmed" {
			r.Policy.Status = "confirmed"
		}
		before := append([]domain.Cell{}, r.Assignments...)
		proposed := append([]domain.Cell{}, j.Result.Assignments...)
		old := map[string]domain.Cell{}
		for _, c := range before {
			old[c.Date+"|"+c.NurseID] = c
		}
		for i, c := range proposed {
			if previous, ok := old[c.Date+"|"+c.NurseID]; ok {
				proposed[i].ID = previous.ID
				proposed[i].Version = previous.Version
				if c.ShiftCode != previous.ShiftCode {
					proposed[i].Version++
				}
			}
		}
		// Synchronize any virtual PT staff in proposed assignments into r.Staff
		staffMap := map[string]bool{}
		for _, s := range r.Staff {
			staffMap[s.ID] = true
		}
		for _, c := range proposed {
			if strings.HasPrefix(c.NurseID, "PT-") && !staffMap[c.NurseID] {
				staffMap[c.NurseID] = true
				pos := "RN"
				if strings.Contains(c.NurseID, "PN") {
					pos = "PN"
				}
				isLead := strings.Contains(c.NurseID, "Lead")
				vName := fmt.Sprintf("[PT] เวรเสริม %s", c.NurseID)
				if isLead {
					vName = fmt.Sprintf("[PT] เวรเสริม หัวหน้า %s", c.NurseID)
				}
				r.Staff = append(r.Staff, domain.Staff{
					ID:       c.NurseID,
					Name:     vName,
					Position: pos,
					Leader:   isLead,
					Double:   true,
					PartTime: true,
					Active:   true,
					Allowed:  []string{"ช", "บ", "ด", "ชบ", "Day", "Night", "D", "N", "X", "L"},
				})
			}
		}

		r.Assignments = proposed
		r.Status = domain.StatusGenerated
		report := validation.Validate(*r, before)
		if !report.CanSave && !onlyStaffingShortageErrors(report) {
			return domain.Audit{}, &RuleError{report}
		}
		return domain.Audit{Actor: a.ID, Action: "auto_apply", Reason: "solver job " + j.ID, At: time.Now().UTC(), Before: fmt.Sprint(before), After: fmt.Sprint(proposed)}, nil
	})
	if e != nil {
		return domain.Roster{}, e
	}
	// Mark job as applied in DB so the state persists across refreshes.
	j.Applied = true
	j.UpdatedAt = time.Now().UTC()
	if err := s.Jobs.UpdateJob(ctx, j, "completed"); err != nil {
		log.Printf("mark solver job %s applied: %v", j.ID, err)
	}
	return roster, nil
}
