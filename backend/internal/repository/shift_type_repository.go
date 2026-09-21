package repository

import (
	"context"
	"database/sql"
	"nurse-scheduler/backend/internal/domain"
)

type shiftRepo struct {
	db *sql.DB
}

func NewShiftTypeRepository(db *sql.DB) ShiftTypeRepository {
	return &shiftRepo{db: db}
}

func (r *shiftRepo) FindByWard(ctx context.Context, wardID domain.WardID) ([]domain.ShiftType, error) {
	return []domain.ShiftType{}, nil
}
func (r *shiftRepo) FindEnabled(ctx context.Context, wardID domain.WardID) ([]domain.ShiftType, error) {
	return []domain.ShiftType{}, nil
}
func (r *shiftRepo) Save(ctx context.Context, st domain.ShiftType) error     { return nil }
func (r *shiftRepo) Update(ctx context.Context, st domain.ShiftType) error   { return nil }
func (r *shiftRepo) Delete(ctx context.Context, id domain.ShiftTypeID) error { return nil }
