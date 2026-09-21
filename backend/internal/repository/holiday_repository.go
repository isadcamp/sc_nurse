package repository

import (
	"context"
	"database/sql"
	"nurse-scheduler/backend/internal/domain"
)

type holidayRepo struct {
	db *sql.DB
}

func NewHolidayRepository(db *sql.DB) HolidayRepository {
	return &holidayRepo{db: db}
}

func (r *holidayRepo) FindByYear(ctx context.Context, year int) (domain.HolidayCalendar, error) {
	// Stub implementation – real query should select JSON data by year
	return domain.HolidayCalendar{}, nil
}

func (r *holidayRepo) ListYears(ctx context.Context) ([]int, error) {
	// Stub – return empty slice
	return []int{}, nil
}

func (r *holidayRepo) Save(ctx context.Context, cal domain.HolidayCalendar) error {
	// Stub – insert or update JSON data for a given year
	return nil
}

func (r *holidayRepo) DeleteYear(ctx context.Context, year int) error {
	// Stub – delete row for the given year
	return nil
}

func (r *holidayRepo) CopyYearToDraft(ctx context.Context, srcYear, dstYear int) error {
	// Stub – copy JSON data from srcYear to a new draft for dstYear
	return nil
}
