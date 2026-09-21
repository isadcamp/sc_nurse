package testfixture

import (
	"context"
	"nurse-scheduler/backend/internal/domain"
	"nurse-scheduler/backend/internal/repository"
	"sync"
)

type NurseRepo struct {
	mu     sync.RWMutex
	nurses map[domain.NurseID]domain.Nurse
}

func NewNurseRepo() *NurseRepo {
	return &NurseRepo{nurses: map[domain.NurseID]domain.Nurse{
		"test-nurse-1": {ID: "test-nurse-1", WardID: "test-ward", Name: "พยาบาลทดสอบ 1", Position: domain.PositionRN, IsActive: true, CanDoubleShift: true, AllowedShiftCodes: []string{"ช", "บ", "ด", "ชบ", "บด", "L"}, Version: 1},
		"test-nurse-2": {ID: "test-nurse-2", WardID: "test-ward", Name: "พยาบาลทดสอบ 2", Position: domain.PositionPN, IsActive: true, CanDoubleShift: true, AllowedShiftCodes: []string{"ช", "บ", "ด", "L"}, Version: 1},
	}}
}
func (r *NurseRepo) FindByID(_ context.Context, id domain.NurseID) (domain.Nurse, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	n, ok := r.nurses[id]
	if !ok {
		return domain.Nurse{}, repository.ErrNotFound
	}
	return n, nil
}
func (r *NurseRepo) FindByWard(_ context.Context, w domain.WardID, a bool) ([]domain.Nurse, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	out := []domain.Nurse{}
	for _, n := range r.nurses {
		if w != "" && n.WardID != w {
			continue
		}
		if a && !n.IsActive {
			continue
		}
		out = append(out, n)
	}
	return out, nil
}
func (r *NurseRepo) FindActiveNurses(c context.Context, w domain.WardID) ([]domain.Nurse, error) {
	return r.FindByWard(c, w, true)
}
func (r *NurseRepo) Save(_ context.Context, n domain.Nurse) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if _, ok := r.nurses[n.ID]; ok {
		return repository.ErrConflict
	}
	r.nurses[n.ID] = n
	return nil
}
func (r *NurseRepo) Update(_ context.Context, n domain.Nurse) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if _, ok := r.nurses[n.ID]; !ok {
		return repository.ErrNotFound
	}
	r.nurses[n.ID] = n
	return nil
}
func (r *NurseRepo) Delete(_ context.Context, id domain.NurseID) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if _, ok := r.nurses[id]; !ok {
		return repository.ErrNotFound
	}
	delete(r.nurses, id)
	return nil
}
