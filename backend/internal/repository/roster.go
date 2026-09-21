package repository

import (
	"context"
	"errors"
	"nurse-scheduler/backend/internal/domain"
)

var ErrNotFound = errors.New("not found")
var ErrConflict = errors.New("conflict")
var ErrForbidden = errors.New("forbidden")
var ErrInput = errors.New("invalid input")
var ErrPolicy = errors.New("policy not configured")

type RosterStore interface {
	Get(context.Context, int64) (domain.Roster, error)
	List(context.Context, string, int, int) ([]domain.Roster, error)
	Create(context.Context, string, int, int, domain.Audit) (domain.Roster, error)
	Change(context.Context, int64, func(*domain.Roster) (domain.Audit, error)) (domain.Roster, error)
	SetPolicy(context.Context, string, domain.Policy, domain.Audit) error
	UpdateStatus(ctx context.Context, id int64, status string, meta map[string]string, a domain.Audit) error
	CreateVersion(ctx context.Context, parentID int64, a domain.Audit) (domain.Roster, error)
	ListVersions(ctx context.Context, wardID string, month, year int) ([]domain.Roster, error)
	GetAuditLog(ctx context.Context, scheduleID int64) ([]domain.AuditEntry, error)
	SaveBoundaryShifts(ctx context.Context, scheduleID int64, date string, shifts map[string]string, a domain.Audit) (domain.Roster, error)
	ListPayrollOverrides(ctx context.Context, scheduleID int64) ([]domain.PayrollOverride, error)
	SavePayrollOverride(ctx context.Context, o domain.PayrollOverride, a domain.Audit) (domain.PayrollOverride, error)
	DeletePayrollOverride(ctx context.Context, overrideID int64, a domain.Audit) error
	ListCompensationRates(ctx context.Context) ([]domain.CompensationRate, error)
	SaveCompensationRate(ctx context.Context, r domain.CompensationRate) (domain.CompensationRate, error)
}
