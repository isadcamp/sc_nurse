package database

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"nurse-scheduler/backend/internal/domain"
	"time"
)

type HolidayRepository struct {
	db *sql.DB
}

func NewHolidayRepository(db *sql.DB) *HolidayRepository {
	return &HolidayRepository{db: db}
}

type holidayJSON struct {
	Date string `json:"date"`
	Name string `json:"name"`
}

func defaultThaiHolidays(year int) []domain.Holiday {
	defaults := []struct {
		m, d int
		name string
	}{
		{1, 1, "วันขึ้นปีใหม่"},
		{2, 24, "วันมาฆบูชา"},
		{4, 6, "วันจักรี"},
		{4, 13, "วันสงกรานต์"},
		{4, 14, "วันสงกรานต์"},
		{4, 15, "วันสงกรานต์"},
		{5, 1, "วันแรงงานแห่งชาติ"},
		{5, 4, "วันฉัตรมงคล"},
		{5, 22, "วันวิสาขบูชา"},
		{6, 3, "วันเฉลิมพระชนมพรรษาพระราชินี"},
		{7, 20, "วันอาสาฬหบูชา"},
		{7, 28, "วันเฉลิมพระชนมพรรษา ร.10"},
		{8, 12, "วันแม่แห่งชาติ"},
		{10, 13, "วันนวมินทรมหาราช"},
		{10, 23, "วันปิยมหาราช"},
		{12, 5, "วันพ่อแห่งชาติ"},
		{12, 10, "วันรัฐธรรมนูญ"},
		{12, 31, "วันสิ้นปี"},
	}
	res := make([]domain.Holiday, 0, len(defaults))
	for i, def := range defaults {
		t := time.Date(year, time.Month(def.m), def.d, 0, 0, 0, 0, time.UTC)
		res = append(res, domain.Holiday{
			ID:   int64(i + 1),
			Date: t,
			Name: def.name,
		})
	}
	return res
}

func (r *HolidayRepository) FindByYear(ctx context.Context, year int) (domain.HolidayCalendar, error) {
	var raw []byte
	var createdAt, updatedAt time.Time
	err := r.db.QueryRowContext(ctx, "SELECT data, created_at, updated_at FROM holidays WHERE year = ?", year).Scan(&raw, &createdAt, &updatedAt)
	if err != nil {
		if err == sql.ErrNoRows {
			// Return default Thai holidays if not customized
			holidays := defaultThaiHolidays(year)
			return domain.HolidayCalendar{
				Year:      year,
				Holidays:  holidays,
				Draft:     true,
				CreatedAt: time.Now().UTC(),
				UpdatedAt: time.Now().UTC(),
			}, nil
		}
		return domain.HolidayCalendar{}, fmt.Errorf("query holidays: %w", err)
	}

	var items []holidayJSON
	if err := json.Unmarshal(raw, &items); err != nil {
		return domain.HolidayCalendar{}, fmt.Errorf("unmarshal holidays: %w", err)
	}

	holidays := make([]domain.Holiday, 0, len(items))
	for i, it := range items {
		t, _ := time.Parse("2006-01-02", it.Date)
		holidays = append(holidays, domain.Holiday{
			ID:   int64(i + 1),
			Date: t,
			Name: it.Name,
		})
	}

	return domain.HolidayCalendar{
		Year:      year,
		Holidays:  holidays,
		Draft:     false,
		CreatedAt: createdAt,
		UpdatedAt: updatedAt,
	}, nil
}

func (r *HolidayRepository) ListYears(ctx context.Context) ([]int, error) {
	rows, err := r.db.QueryContext(ctx, "SELECT year FROM holidays ORDER BY year")
	if err != nil {
		return nil, fmt.Errorf("list holiday years: %w", err)
	}
	defer rows.Close()
	years := []int{}
	for rows.Next() {
		var y int
		if err := rows.Scan(&y); err != nil {
			return nil, err
		}
		years = append(years, y)
	}
	return years, rows.Err()
}

func (r *HolidayRepository) Save(ctx context.Context, cal domain.HolidayCalendar) error {
	items := make([]holidayJSON, 0, len(cal.Holidays))
	for _, h := range cal.Holidays {
		items = append(items, holidayJSON{
			Date: h.Date.Format("2006-01-02"),
			Name: h.Name,
		})
	}
	raw, err := json.Marshal(items)
	if err != nil {
		return fmt.Errorf("marshal holidays: %w", err)
	}

	query := `INSERT INTO holidays (year, data) VALUES (?, ?) ON DUPLICATE KEY UPDATE data = VALUES(data)`
	_, err = r.db.ExecContext(ctx, query, cal.Year, raw)
	if err != nil {
		return fmt.Errorf("save holidays: %w", err)
	}
	return nil
}

func (r *HolidayRepository) DeleteYear(ctx context.Context, year int) error {
	_, err := r.db.ExecContext(ctx, "DELETE FROM holidays WHERE year = ?", year)
	if err != nil {
		return fmt.Errorf("delete holidays: %w", err)
	}
	return nil
}

func (r *HolidayRepository) CopyYearToDraft(ctx context.Context, srcYear, dstYear int) error {
	srcCal, err := r.FindByYear(ctx, srcYear)
	if err != nil {
		return err
	}

	newHolidays := make([]domain.Holiday, 0, len(srcCal.Holidays))
	for i, h := range srcCal.Holidays {
		newDate := time.Date(dstYear, h.Date.Month(), h.Date.Day(), 0, 0, 0, 0, time.UTC)
		newHolidays = append(newHolidays, domain.Holiday{
			ID:   int64(i + 1),
			Date: newDate,
			Name: h.Name,
		})
	}

	dstCal := domain.HolidayCalendar{
		Year:     dstYear,
		Holidays: newHolidays,
		Draft:    true,
	}
	return r.Save(ctx, dstCal)
}
