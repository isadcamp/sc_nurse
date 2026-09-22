// Package testfixture contains synthetic data for automated tests only.
package testfixture

import (
	"context"
	"encoding/json"
	"nurse-scheduler/backend/internal/domain"
	"nurse-scheduler/backend/internal/repository"
	"sync"
)

func Roster() domain.Roster {
	return domain.Roster{ID: 1, WardID: "test-ward", Month: 9, Year: 2026, Status: "draft", Version: 1, Timezone: "Asia/Bangkok",
		Staff:       []domain.Staff{{ID: "test-a", Name: "พยาบาลทดสอบ A", Position: "RN", Active: true, Leader: true, Double: true, Allowed: []string{"ช", "บ", "ด", "ชบ", "บด", "Day", "Night"}, Skills: []string{"icu"}}, {ID: "test-b", Name: "พยาบาลทดสอบ B", Position: "PN", Active: true, Double: true, Allowed: []string{"ช", "บ", "ด", "ชบ", "บด", "Day", "Night"}}},
		Shifts:      []domain.RosterShift{{Code: "ช", Name: "เช้า", Periods: []domain.Period{{Start: 480, End: 960}}}, {Code: "บ", Name: "บ่าย", Periods: []domain.Period{{Start: 960, End: 1440}}}, {Code: "ด", Name: "ดึก", Periods: []domain.Period{{Start: 0, End: 480}}}, {Code: "ชบ", Name: "เช้าบ่าย", Double: true, Periods: []domain.Period{{Start: 480, End: 960}, {Start: 960, End: 1440}}}, {Code: "บด", Name: "บ่ายดึก", Double: true, Periods: []domain.Period{{Start: 960, End: 1440}, {Start: 0, End: 480}}}, {Code: "Day", Name: "กลางวัน", Periods: []domain.Period{{Start: 480, End: 1200}}}, {Code: "Night", Name: "กลางคืน", Periods: []domain.Period{{Start: 1200, End: 1920}}}, {Code: "X", Name: "OFF", Periods: []domain.Period{}}, {Code: "L", Name: "ลา", Periods: []domain.Period{}}, {Code: "อบ", Name: "อบรม/ประชุมวิชาการ", Periods: []domain.Period{{Start: 480, End: 960}}}, {Code: "บห", Name: "งานบริหาร/ภารกิจพิเศษ", Periods: []domain.Period{{Start: 480, End: 960}}}},
		Assignments: []domain.Cell{}, Boundary: []domain.Cell{}, Holidays: []domain.DayOff{},
		Policy: domain.Policy{MinRestHours: 8, MaxConsecutiveDays: 6, MaxConsecutiveNights: 3, MaxMonthlyHours: 240, MaxContinuousHours: 16, MaxDoubleShifts: 8, NightStart: 1320, NightEnd: 1800, FairnessHours: 48, Targets: []domain.Target{}, Preferences: []domain.Preference{}, Staffing: []domain.Staffing{}}}
}
func Cell(date, shift string) domain.Cell {
	return domain.Cell{ID: 1, NurseID: "test-a", Date: date, ShiftCode: shift, Version: 1}
}
func Clone(r domain.Roster) domain.Roster {
	b, _ := json.Marshal(r)
	var out domain.Roster
	_ = json.Unmarshal(b, &out)
	out.Leaves = append([]domain.Leave{}, r.Leaves...)
	return out
}

type Memory struct {
	Mu      sync.Mutex
	R       domain.Roster
	Rosters map[int64]domain.Roster
	Audits  []struct {
		ScheduleID *int64
		domain.Audit
	}
}

func (m *Memory) init() {
	if m.Rosters == nil {
		m.Rosters = make(map[int64]domain.Roster)
		if m.R.ID != 0 {
			m.Rosters[m.R.ID] = m.R
		}
	}
}

func (m *Memory) Get(_ context.Context, id int64) (domain.Roster, error) {
	m.Mu.Lock()
	defer m.Mu.Unlock()
	m.init()
	if id == m.R.ID && m.R.ID != 0 {
		return Clone(m.R), nil
	}
	r, exists := m.Rosters[id]
	if !exists {
		return domain.Roster{}, repository.ErrNotFound
	}
	return Clone(r), nil
}
func (m *Memory) List(_ context.Context, w string, month, year int) ([]domain.Roster, error) {
	m.Mu.Lock()
	defer m.Mu.Unlock()
	m.init()
	out := []domain.Roster{}
	for _, r := range m.Rosters {
		if w == r.WardID && (month <= 0 || month == r.Month) && (year <= 0 || year == r.Year) {
			out = append(out, Clone(r))
		}
	}
	if len(out) == 0 && w == m.R.WardID && (month <= 0 || month == m.R.Month) && (year <= 0 || year == m.R.Year) {
		out = append(out, Clone(m.R))
	}
	return out, nil
}
func (m *Memory) Create(_ context.Context, w string, month, year int, a domain.Audit) (domain.Roster, error) {
	m.Mu.Lock()
	defer m.Mu.Unlock()
	m.init()
	for _, r := range m.Rosters {
		if month == r.Month && year == r.Year && r.WardID == w {
			return domain.Roster{}, repository.ErrConflict
		}
	}
	newID := int64(len(m.Rosters) + 1)
	for {
		if _, exists := m.Rosters[newID]; !exists {
			break
		}
		newID++
	}
	newR := Clone(m.R)
	newR.ID = newID
	newR.Month = month
	newR.Year = year
	newR.Status = "draft"
	newR.Assignments = []domain.Cell{}
	m.Rosters[newID] = newR
	m.Audits = append(m.Audits, struct {
		ScheduleID *int64
		domain.Audit
	}{&newID, a})
	return Clone(newR), nil
}
func (m *Memory) Change(_ context.Context, id int64, fn func(*domain.Roster) (domain.Audit, error)) (domain.Roster, error) {
	m.Mu.Lock()
	defer m.Mu.Unlock()
	m.init()
	target, exists := m.Rosters[id]
	if !exists {
		if id == m.R.ID {
			target = m.R
		} else {
			return domain.Roster{}, repository.ErrNotFound
		}
	}
	r := Clone(target)
	a, e := fn(&r)
	if e != nil {
		return domain.Roster{}, e
	}
	for i := range r.Assignments {
		if r.Assignments[i].ID == 0 {
			r.Assignments[i].ID = int64(i + 1)
		}
	}
	m.Rosters[id] = r
	if id == m.R.ID {
		m.R = r
	}
	m.Audits = append(m.Audits, struct {
		ScheduleID *int64
		domain.Audit
	}{&id, a})
	return Clone(r), nil
}
func (m *Memory) SetPolicy(_ context.Context, w string, p domain.Policy, a domain.Audit) error {
	m.Mu.Lock()
	defer m.Mu.Unlock()
	m.init()
	m.R.Policy = p
	for k, r := range m.Rosters {
		if r.WardID == w {
			r.Policy = p
			m.Rosters[k] = r
		}
	}
	m.Audits = append(m.Audits, struct {
		ScheduleID *int64
		domain.Audit
	}{nil, a})
	return nil
}
func (m *Memory) UpdateStatus(_ context.Context, id int64, status string, meta map[string]string, a domain.Audit) error {
	m.Mu.Lock()
	defer m.Mu.Unlock()
	m.init()
	r, exists := m.Rosters[id]
	if !exists {
		if id == m.R.ID {
			r = m.R
		} else {
			return repository.ErrNotFound
		}
	}
	r.Status = status
	if val, ok := meta["submitted_by"]; ok {
		r.SubmittedBy = val
	}
	if val, ok := meta["approved_by"]; ok {
		r.ApprovedBy = val
	}
	if val, ok := meta["published_by"]; ok {
		r.PublishedBy = val
	}
	m.Rosters[id] = r
	if id == m.R.ID {
		m.R = r
	}
	m.Audits = append(m.Audits, struct {
		ScheduleID *int64
		domain.Audit
	}{&id, a})
	return nil
}
func (m *Memory) CreateVersion(_ context.Context, parentID int64, a domain.Audit) (domain.Roster, error) {
	m.Mu.Lock()
	defer m.Mu.Unlock()
	m.init()
	parent, exists := m.Rosters[parentID]
	if !exists {
		if parentID == m.R.ID {
			parent = m.R
		} else {
			return domain.Roster{}, repository.ErrNotFound
		}
	}
	newID := int64(len(m.Rosters) + 10)
	newR := Clone(parent)
	newR.ID = newID
	newR.Version = parent.Version + 1
	newR.ParentID = &parentID
	newR.Status = "draft"
	m.Rosters[newID] = newR
	m.Audits = append(m.Audits, struct {
		ScheduleID *int64
		domain.Audit
	}{&newID, a})
	return Clone(newR), nil
}
func (m *Memory) ListVersions(_ context.Context, wardID string, month, year int) ([]domain.Roster, error) {
	m.Mu.Lock()
	defer m.Mu.Unlock()
	m.init()
	out := []domain.Roster{}
	for _, r := range m.Rosters {
		if wardID == r.WardID && month == r.Month && year == r.Year {
			out = append(out, Clone(r))
		}
	}
	return out, nil
}
func (m *Memory) Delete(_ context.Context, id int64, a domain.Audit) error {
	m.Mu.Lock()
	defer m.Mu.Unlock()
	m.init()
	r, exists := m.Rosters[id]
	if !exists {
		if id == m.R.ID {
			r = m.R
		} else {
			return repository.ErrNotFound
		}
	}
	if r.Status != domain.StatusDraft && r.Status != domain.StatusGenerated {
		return repository.ErrConflict
	}
	delete(m.Rosters, id)
	return nil
}
func (m *Memory) GetAuditLog(_ context.Context, scheduleID int64) ([]domain.AuditEntry, error) {
	m.Mu.Lock()
	defer m.Mu.Unlock()
	out := []domain.AuditEntry{}
	for i, a := range m.Audits {
		if a.ScheduleID != nil && *a.ScheduleID == scheduleID {
			out = append(out, domain.AuditEntry{
				ID:         int64(i + 1),
				ScheduleID: a.ScheduleID,
				WardID:     m.R.WardID,
				Actor:      a.Actor,
				Action:     a.Action,
				Reason:     a.Reason,
				CreatedAt:  a.At.Format("2006-01-02T15:04:05Z"),
			})
		}
	}
	return out, nil
}

func (m *Memory) SaveBoundaryShifts(_ context.Context, scheduleID int64, prevDate string, shifts map[string]string, a domain.Audit) (domain.Roster, error) {
	m.Mu.Lock()
	defer m.Mu.Unlock()
	m.init()
	r, exists := m.Rosters[scheduleID]
	if !exists {
		if scheduleID == m.R.ID {
			r = m.R
		} else {
			return domain.Roster{}, repository.ErrNotFound
		}
	}
	boundaryCells := []domain.Cell{}
	for nid, code := range shifts {
		boundaryCells = append(boundaryCells, domain.Cell{
			NurseID:   nid,
			Date:      prevDate,
			ShiftCode: code,
			Version:   1,
		})
	}
	r.Boundary = boundaryCells
	m.Rosters[scheduleID] = r
	if scheduleID == m.R.ID {
		m.R.Boundary = boundaryCells
	}
	m.Audits = append(m.Audits, struct {
		ScheduleID *int64
		domain.Audit
	}{&scheduleID, a})
	return Clone(r), nil
}

func (m *Memory) ListPayrollOverrides(_ context.Context, scheduleID int64) ([]domain.PayrollOverride, error) {
	return []domain.PayrollOverride{}, nil
}

func (m *Memory) SavePayrollOverride(_ context.Context, o domain.PayrollOverride, _ domain.Audit) (domain.PayrollOverride, error) {
	o.ID = 1
	return o, nil
}

func (m *Memory) DeletePayrollOverride(_ context.Context, _ int64, _ domain.Audit) error {
	return nil
}

func (m *Memory) ListCompensationRates(_ context.Context) ([]domain.CompensationRate, error) {
	return []domain.CompensationRate{}, nil
}

func (m *Memory) SaveCompensationRate(_ context.Context, r domain.CompensationRate) (domain.CompensationRate, error) {
	r.ID = 1
	return r, nil
}
