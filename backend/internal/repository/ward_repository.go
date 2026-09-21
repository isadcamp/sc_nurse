package repository

import (
	"context"
	"database/sql"
	"nurse-scheduler/backend/internal/domain"
)

type wardRepo struct {
	db *sql.DB
}

func NewWardRepository(db *sql.DB) WardRepository {
	return &wardRepo{db: db}
}

func (r *wardRepo) FindByID(ctx context.Context, id domain.WardID) (domain.Ward, error) {
	return domain.Ward{}, nil
}
func (r *wardRepo) FindAll(ctx context.Context) ([]domain.Ward, error) {
	return []domain.Ward{}, nil
}
func (r *wardRepo) Save(ctx context.Context, ward domain.Ward) error   { return nil }
func (r *wardRepo) Update(ctx context.Context, ward domain.Ward) error { return nil }
func (r *wardRepo) SetStatus(ctx context.Context, id domain.WardID, isActive bool, updatedBy string) error {
	return nil
}
func (r *wardRepo) Delete(ctx context.Context, id domain.WardID) error { return nil }
