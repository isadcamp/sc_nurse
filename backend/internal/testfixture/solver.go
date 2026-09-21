package testfixture

import (
	"context"
	"nurse-scheduler/backend/internal/domain"
	"nurse-scheduler/backend/internal/repository"
	"sync"
)

type SolverStore struct {
	mu   sync.RWMutex
	jobs map[string]domain.SolverJob
}

func NewSolverStore() *SolverStore { return &SolverStore{jobs: map[string]domain.SolverJob{}} }
func (s *SolverStore) CreateJob(_ context.Context, j domain.SolverJob) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.jobs[j.ID] = j
	return nil
}
func (s *SolverStore) GetJob(_ context.Context, id string) (domain.SolverJob, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	j, ok := s.jobs[id]
	if !ok {
		return domain.SolverJob{}, repository.ErrNotFound
	}
	return j, nil
}
func (s *SolverStore) UpdateJob(_ context.Context, j domain.SolverJob, _ string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.jobs[j.ID]; !ok {
		return repository.ErrNotFound
	}
	s.jobs[j.ID] = j
	return nil
}
func (s *SolverStore) InterruptJobs(_ context.Context) error { return nil }
