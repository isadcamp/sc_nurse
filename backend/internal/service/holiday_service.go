package service

import (
	"context"
	"nurse-scheduler/backend/internal/domain"
	"nurse-scheduler/backend/internal/repository"
)

type HolidayService struct {
	repo repository.HolidayRepository
}

func NewHolidayService(r repository.HolidayRepository) *HolidayService {
	return &HolidayService{repo: r}
}

// List all years that have a holiday calendar
func (s *HolidayService) ListYears(ctx context.Context) ([]int, error) {
	return s.repo.ListYears(ctx)
}

// Get holiday calendar for a specific year
func (s *HolidayService) GetByYear(ctx context.Context, year int) (domain.HolidayCalendar, error) {
	return s.repo.FindByYear(ctx, year)
}

// Save (create or update) a holiday calendar
func (s *HolidayService) Save(ctx context.Context, cal domain.HolidayCalendar) error {
	return s.repo.Save(ctx, cal)
}

// Delete a calendar for a given year
func (s *HolidayService) DeleteYear(ctx context.Context, year int) error {
	return s.repo.DeleteYear(ctx, year)
}

// Copy a source year calendar to a destination (draft) year
func (s *HolidayService) CopyYearToDraft(ctx context.Context, srcYear, dstYear int) error {
	return s.repo.CopyYearToDraft(ctx, srcYear, dstYear)
}
