package repository

import (
	"context"
	"database/sql"
	"nurse-scheduler/backend/internal/domain"
)

type leaveRequestRepo struct {
	db *sql.DB
}

func NewLeaveRequestRepository(db *sql.DB) LeaveRequestRepository {
	return &leaveRequestRepo{db: db}
}

func (r *leaveRequestRepo) Create(ctx context.Context, req domain.LeaveRequest) (domain.LeaveRequest, error) {
	// Stub implementation – should insert and return the created record with ID
	return req, nil
}

func (r *leaveRequestRepo) FindByID(ctx context.Context, id int64) (domain.LeaveRequest, error) {
	// Stub – return empty request
	return domain.LeaveRequest{}, nil
}

func (r *leaveRequestRepo) ListByWard(ctx context.Context, wardID domain.WardID) ([]domain.LeaveRequest, error) {
	// Stub – return empty slice
	return []domain.LeaveRequest{}, nil
}

func (r *leaveRequestRepo) UpdateStatus(ctx context.Context, id int64, status domain.LeaveStatus, approver string) error {
	// Stub – update status column
	return nil
}
