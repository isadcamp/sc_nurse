package repository

import (
	"context"
	"nurse-scheduler/backend/internal/domain"
)

type SolverStore interface {
	CreateJob(context.Context, domain.SolverJob) error
	GetJob(context.Context, string) (domain.SolverJob, error)
	UpdateJob(context.Context, domain.SolverJob, string) error
	InterruptJobs(context.Context) error
}
