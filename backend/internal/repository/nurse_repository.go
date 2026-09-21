package repository

import (
	"context"
	"database/sql"
	"nurse-scheduler/backend/internal/domain"
)

type nurseRepo struct {
	db *sql.DB
}

func NewNurseRepository(db *sql.DB) NurseRepository {
	return &nurseRepo{db: db}
}

func (r *nurseRepo) FindByID(ctx context.Context, id domain.NurseID) (domain.Nurse, error) {
	return domain.Nurse{}, nil
}
func (r *nurseRepo) FindByWard(ctx context.Context, wardID domain.WardID, activeOnly bool) ([]domain.Nurse, error) {
	return []domain.Nurse{}, nil
}
func (r *nurseRepo) FindActiveNurses(ctx context.Context, wardID domain.WardID) ([]domain.Nurse, error) {
	return []domain.Nurse{}, nil
}
func (r *nurseRepo) Save(ctx context.Context, nurse domain.Nurse) error   { return nil }
func (r *nurseRepo) Update(ctx context.Context, nurse domain.Nurse) error { return nil }
func (r *nurseRepo) Delete(ctx context.Context, id domain.NurseID) error  { return nil }
