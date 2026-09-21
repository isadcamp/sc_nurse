package service

import (
	"context"
	"fmt"
	"nurse-scheduler/backend/internal/domain"
	"nurse-scheduler/backend/internal/repository"
	"nurse-scheduler/backend/internal/validation"
	"strings"
	"time"
)

type Edit struct {
	AssignmentID             int64
	NurseID, Date, ShiftCode string
	Version                  int
	Reason                   string
	Override                 bool
}
type RosterService struct{ Store repository.RosterStore }
type RuleError struct{ Report domain.Report }

func (e *RuleError) Error() string { return "schedule violates rules" }

func Allowed(a domain.Actor, ward string, write bool) bool {
	if !contains(a.Wards, ward) {
		return false
	}
	return !write || a.Role == "head"
}
func contains(xs []string, x string) bool {
	for _, v := range xs {
		if v == x {
			return true
		}
	}
	return false
}
func (s *RosterService) Get(ctx context.Context, id int64, a domain.Actor) (domain.Roster, error) {
	r, e := s.Store.Get(ctx, id)
	if e != nil {
		return r, e
	}
	if !contains(a.Wards, r.WardID) {
		return domain.Roster{}, repository.ErrForbidden
	}
	return r, nil
}
func (s *RosterService) List(ctx context.Context, w string, m, y int, a domain.Actor) ([]domain.Roster, error) {
	if !contains(a.Wards, w) {
		return nil, repository.ErrForbidden
	}
	return s.Store.List(ctx, w, m, y)
}
func (s *RosterService) Create(ctx context.Context, w string, m, y int, a domain.Actor) (domain.Roster, error) {
	if !Allowed(a, w, true) {
		return domain.Roster{}, repository.ErrForbidden
	}
	if m < 1 || m > 12 || y < 2000 || y > 2200 {
		return domain.Roster{}, repository.ErrInput
	}
	return s.Store.Create(ctx, w, m, y, domain.Audit{Actor: a.ID, Action: "create", At: time.Now().UTC()})
}
func validateEdit(r domain.Roster, e Edit) error {
	d, err := time.Parse("2006-01-02", e.Date)
	if err != nil || d.Year() != r.Year || int(d.Month()) != r.Month {
		return repository.ErrInput
	}
	if e.Version < 0 || e.NurseID == "" {
		return repository.ErrInput
	}
	foundNurse := false
	for _, n := range r.Staff {
		if n.ID == e.NurseID && n.Active {
			foundNurse = true
			break
		}
	}
	if !foundNurse {
		return repository.ErrInput
	}
	if e.ShiftCode != "" {
		foundShift := false
		for _, sh := range r.Shifts {
			if strings.EqualFold(sh.Code, e.ShiftCode) || sh.Code == e.ShiftCode {
				foundShift = true
				break
			}
		}
		if !foundShift && !domain.IsValidShiftCode(e.ShiftCode) {
			return repository.ErrInput
		}
	}
	return nil
}

func (s *RosterService) Edit(ctx context.Context, id int64, a domain.Actor, e Edit) (domain.Roster, error) {
	if !Allowed(a, "", true) && a.Role != "head" { /* ward checked below */
	}
	return s.Store.Change(ctx, id, func(r *domain.Roster) (domain.Audit, error) {
		if !Allowed(a, r.WardID, true) {
			return domain.Audit{}, repository.ErrForbidden
		}
		if !domain.EditableStatuses[r.Status] {
			return domain.Audit{}, repository.ErrConflict
		}
		if err := validateEdit(*r, e); err != nil {
			return domain.Audit{}, err
		}
		old := append([]domain.Cell{}, r.Assignments...)
		found := false
		for i, c := range r.Assignments {
			if c.NurseID == e.NurseID && c.Date == e.Date {
				found = true
				if c.Version != e.Version {
					return domain.Audit{}, repository.ErrConflict
				}
				if c.Locked {
					return domain.Audit{}, repository.ErrForbidden
				}
				r.Assignments[i].ShiftCode = e.ShiftCode
				r.Assignments[i].Version++
				break
			}
		}
		if !found {
			if e.Version != 0 {
				return domain.Audit{}, repository.ErrConflict
			}
			r.Assignments = append(r.Assignments, domain.Cell{NurseID: e.NurseID, Date: e.Date, ShiftCode: e.ShiftCode, Version: 1})
		}
		report := validation.Validate(*r, old)
		if !report.CanSave {
			if !e.Override || len(strings.TrimSpace(e.Reason)) < 3 {
				return domain.Audit{}, &RuleError{Report: report}
			}
			return domain.Audit{Actor: a.ID, Action: "override", Reason: e.Reason, At: time.Now().UTC()}, nil
		}
		return domain.Audit{Actor: a.ID, Action: "edit", Reason: e.Reason, At: time.Now().UTC()}, nil
	})
}
func (s *RosterService) Check(ctx context.Context, id int64, a domain.Actor, e Edit) (domain.Report, error) {
	r, e2 := s.Get(ctx, id, a)
	if e2 != nil {
		return domain.Report{}, e2
	}
	old := append([]domain.Cell{}, r.Assignments...)
	for i, c := range r.Assignments {
		if c.NurseID == e.NurseID && c.Date == e.Date {
			r.Assignments[i].ShiftCode = e.ShiftCode
		}
	}
	return validation.Validate(r, old), nil
}
func (s *RosterService) Lock(ctx context.Context, id, aid int64, version int, lock bool, reason string, a domain.Actor) (domain.Roster, error) {
	return s.Store.Change(ctx, id, func(r *domain.Roster) (domain.Audit, error) {
		if !Allowed(a, r.WardID, true) {
			return domain.Audit{}, repository.ErrForbidden
		}
		if strings.TrimSpace(reason) == "" {
			if lock {
				reason = "ล็อกเวร"
			} else {
				reason = "ปลดล็อกเวร"
			}
		}
		for i := range r.Assignments {
			if r.Assignments[i].ID == aid {
				if r.Assignments[i].Version != version {
					return domain.Audit{}, repository.ErrConflict
				}
				r.Assignments[i].Locked = lock
				r.Assignments[i].Version++
				return domain.Audit{Actor: a.ID, Action: map[bool]string{true: "lock", false: "unlock"}[lock], Reason: reason, At: time.Now().UTC()}, nil
			}
		}
		return domain.Audit{}, repository.ErrNotFound
	})
}
func (s *RosterService) SetPolicy(ctx context.Context, w string, p domain.Policy, a domain.Actor) error {
	if !Allowed(a, w, true) {
		return repository.ErrForbidden
	}
	return s.Store.SetPolicy(ctx, w, p, domain.Audit{Actor: a.ID, Action: "policy", At: time.Now().UTC()})
}
func (s *RosterService) transition(ctx context.Context, id int64, a domain.Actor, to string, meta map[string]string) error {
	r, e := s.Get(ctx, id, a)
	if e != nil {
		return e
	}
	if !Allowed(a, r.WardID, true) {
		return repository.ErrForbidden
	}
	if !domain.ValidTransition(r.Status, to) {
		return repository.ErrConflict
	}
	return s.Store.UpdateStatus(ctx, id, to, meta, domain.Audit{Actor: a.ID, Action: domain.TransitionAction(to), At: time.Now().UTC()})
}
func (s *RosterService) SubmitReview(ctx context.Context, id int64, a domain.Actor) error {
	return s.transition(ctx, id, a, domain.StatusUnderReview, map[string]string{"submitted_by": a.ID})
}
func (s *RosterService) Approve(ctx context.Context, id int64, a domain.Actor, note string) error {
	return s.transition(ctx, id, a, domain.StatusApproved, map[string]string{"approved_by": a.ID})
}
func (s *RosterService) Revise(ctx context.Context, id int64, a domain.Actor, reason string) error {
	return s.transition(ctx, id, a, domain.StatusGenerated, map[string]string{})
}
func (s *RosterService) Publish(ctx context.Context, id int64, a domain.Actor) error {
	return s.transition(ctx, id, a, domain.StatusPublished, map[string]string{"published_by": a.ID})
}
func (s *RosterService) Close(ctx context.Context, id int64, a domain.Actor) error {
	return s.transition(ctx, id, a, domain.StatusClosed, map[string]string{"closed_by": a.ID})
}
func (s *RosterService) Reopen(ctx context.Context, id int64, a domain.Actor, reason string) error {
	if len(strings.TrimSpace(reason)) < 3 {
		return repository.ErrForbidden
	}
	r, e := s.Get(ctx, id, a)
	if e != nil {
		return e
	}
	if !Allowed(a, r.WardID, true) {
		return repository.ErrForbidden
	}
	if r.Status != domain.StatusClosed {
		return repository.ErrConflict
	}
	return s.Store.UpdateStatus(ctx, id, domain.StatusPublished, map[string]string{"closed_by": "", "closed_at": ""}, domain.Audit{
		Actor:  a.ID,
		Action: "reopen",
		Reason: reason,
		At:     time.Now().UTC(),
	})
}
func (s *RosterService) ListPayrollOverrides(ctx context.Context, scheduleID int64, a domain.Actor) ([]domain.PayrollOverride, error) {
	r, e := s.Get(ctx, scheduleID, a)
	if e != nil {
		return nil, e
	}
	if !Allowed(a, r.WardID, false) {
		return nil, repository.ErrForbidden
	}
	return s.Store.ListPayrollOverrides(ctx, scheduleID)
}
func (s *RosterService) SavePayrollOverride(ctx context.Context, o domain.PayrollOverride, a domain.Actor) (domain.PayrollOverride, error) {
	r, e := s.Get(ctx, o.ScheduleID, a)
	if e != nil {
		return domain.PayrollOverride{}, e
	}
	if !Allowed(a, r.WardID, true) {
		return domain.PayrollOverride{}, repository.ErrForbidden
	}
	if r.Status == domain.StatusClosed {
		return domain.PayrollOverride{}, repository.ErrConflict
	}
	o.ApprovedBy = a.ID
	return s.Store.SavePayrollOverride(ctx, o, domain.Audit{
		Actor:  a.ID,
		Action: "payroll_override",
		Reason: fmt.Sprintf("Nurse %s, Field %s, Orig %v -> Override %v: %s", o.NurseID, o.FieldName, o.OriginalValue, o.OverrideValue, o.Reason),
		At:     time.Now().UTC(),
	})
}
func (s *RosterService) DeletePayrollOverride(ctx context.Context, scheduleID, overrideID int64, a domain.Actor) error {
	r, e := s.Get(ctx, scheduleID, a)
	if e != nil {
		return e
	}
	if !Allowed(a, r.WardID, true) {
		return repository.ErrForbidden
	}
	if r.Status == domain.StatusClosed {
		return repository.ErrConflict
	}
	return s.Store.DeletePayrollOverride(ctx, overrideID, domain.Audit{
		Actor:  a.ID,
		Action: "delete_payroll_override",
		Reason: fmt.Sprintf("Deleted override %d on schedule %d", overrideID, scheduleID),
		At:     time.Now().UTC(),
	})
}
func (s *RosterService) ListCompensationRates(ctx context.Context, a domain.Actor) ([]domain.CompensationRate, error) {
	return s.Store.ListCompensationRates(ctx)
}
func (s *RosterService) SaveCompensationRate(ctx context.Context, rate domain.CompensationRate, a domain.Actor) (domain.CompensationRate, error) {
	return s.Store.SaveCompensationRate(ctx, rate)
}
func (s *RosterService) NewVersion(ctx context.Context, id int64, a domain.Actor) (domain.Roster, error) {
	r, e := s.Get(ctx, id, a)
	if e != nil {
		return r, e
	}
	if !Allowed(a, r.WardID, true) {
		return r, repository.ErrForbidden
	}
	return s.Store.CreateVersion(ctx, id, domain.Audit{Actor: a.ID, Action: "new_version", At: time.Now().UTC()})
}
func (s *RosterService) ListVersions(ctx context.Context, id int64, a domain.Actor) ([]domain.Roster, error) {
	r, e := s.Get(ctx, id, a)
	if e != nil {
		return nil, e
	}
	return s.Store.ListVersions(ctx, r.WardID, r.Month, r.Year)
}
func (s *RosterService) CompareVersions(ctx context.Context, id, compare int64, a domain.Actor) (domain.VersionDiff, error) {
	base, e := s.Get(ctx, id, a)
	if e != nil {
		return domain.VersionDiff{}, e
	}
	other, e := s.Get(ctx, compare, a)
	if e != nil {
		return domain.VersionDiff{}, e
	}
	return diff(base, other), nil
}
func diff(a, b domain.Roster) domain.VersionDiff {
	out := domain.VersionDiff{BaseVersion: a.Version, CompareVersion: b.Version, BaseStatus: a.Status, CompareStatus: b.Status}
	am := map[string]domain.Cell{}
	bm := map[string]domain.Cell{}
	for _, c := range a.Assignments {
		am[c.NurseID+"|"+c.Date] = c
	}
	for _, c := range b.Assignments {
		bm[c.NurseID+"|"+c.Date] = c
	}
	for k, c := range am {
		if d, ok := bm[k]; ok {
			if c.ShiftCode != d.ShiftCode {
				out.Changed = append(out.Changed, domain.CellChange{NurseID: c.NurseID, Date: c.Date, OldShiftCode: c.ShiftCode, NewShiftCode: d.ShiftCode})
			}
		} else {
			out.Removed = append(out.Removed, c)
		}
	}
	for k, c := range bm {
		if _, ok := am[k]; !ok {
			out.Added = append(out.Added, c)
		}
	}
	return out
}
func (s *RosterService) GetAuditLog(ctx context.Context, id int64, a domain.Actor) ([]domain.AuditEntry, error) {
	r, e := s.Get(ctx, id, a)
	if e != nil {
		return nil, e
	}
	return s.Store.GetAuditLog(ctx, r.ID)
}

func (s *RosterService) SaveBoundaryShifts(ctx context.Context, id int64, date string, shifts map[string]string, a domain.Actor) (domain.Roster, domain.Report, error) {
	current, err := s.Store.Get(ctx, id)
	if err != nil {
		return domain.Roster{}, domain.Report{}, err
	}
	if !Allowed(a, current.WardID, true) {
		return domain.Roster{}, domain.Report{}, repository.ErrForbidden
	}
	r, err := s.Store.SaveBoundaryShifts(ctx, id, date, shifts, domain.Audit{Actor: a.ID, Action: "save_boundary_shifts", Reason: "date=" + date})
	if err != nil {
		return domain.Roster{}, domain.Report{}, err
	}
	report := validation.Validate(r, r.Assignments)
	return r, report, nil
}

