package testfixture

import (
	"context"
	"nurse-scheduler/backend/internal/domain"
	"nurse-scheduler/backend/internal/repository"
	"sync"
	"time"
)

type HolidayRepo struct {
	mu        sync.RWMutex
	calendars map[int]domain.HolidayCalendar
}

func NewHolidayRepo() *HolidayRepo {
	return &HolidayRepo{calendars: map[int]domain.HolidayCalendar{2026: {Year: 2026, Holidays: []domain.Holiday{{ID: 1, Date: time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC), Name: "วันขึ้นปีใหม่"}}, Draft: false}}}
}
func (r *HolidayRepo) FindByYear(_ context.Context, y int) (domain.HolidayCalendar, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	c, ok := r.calendars[y]
	if !ok {
		return domain.HolidayCalendar{Year: y, Holidays: []domain.Holiday{}, Draft: true}, nil
	}
	return c, nil
}
func (r *HolidayRepo) ListYears(_ context.Context) ([]int, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	out := []int{}
	for y := range r.calendars {
		out = append(out, y)
	}
	return out, nil
}
func (r *HolidayRepo) Save(_ context.Context, c domain.HolidayCalendar) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.calendars[c.Year] = c
	return nil
}
func (r *HolidayRepo) DeleteYear(_ context.Context, y int) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	delete(r.calendars, y)
	return nil
}
func (r *HolidayRepo) CopyYearToDraft(_ context.Context, src, dst int) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	c, ok := r.calendars[src]
	if !ok {
		return repository.ErrNotFound
	}
	c.Year = dst
	c.Draft = true
	r.calendars[dst] = c
	return nil
}
