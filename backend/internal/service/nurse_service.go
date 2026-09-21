package service

import (
	"context"
	"fmt"
	"nurse-scheduler/backend/internal/domain"
	"nurse-scheduler/backend/internal/repository"
	"time"
)

type NurseService struct {
	repo repository.NurseRepository
}

func NewNurseService(r repository.NurseRepository) *NurseService {
	return &NurseService{repo: r}
}

func (s *NurseService) ListByWard(ctx context.Context, wardID domain.WardID, activeOnly bool) ([]domain.Nurse, error) {
	return s.repo.FindByWard(ctx, wardID, activeOnly)
}

func (s *NurseService) ListNurses(ctx context.Context) ([]domain.Nurse, error) {
	return s.repo.FindByWard(ctx, "", false)
}

func (s *NurseService) CreateNurse(ctx context.Context, n domain.Nurse) error {
	if n.ID == "" {
		n.ID = domain.NurseID(fmt.Sprintf("n-%d", time.Now().UnixNano()))
	}
	if n.Position != domain.PositionRN && n.Position != domain.PositionPN {
		n.Position = domain.PositionRN
	}
	if len(n.AllowedShiftCodes) == 0 {
		n.AllowedShiftCodes = []string{"ช", "บ", "ด", "ชบ", "บด", "Day", "Night", "X", "L"}
	}
	return s.repo.Save(ctx, n)
}

func (s *NurseService) GetNurse(ctx context.Context, id domain.NurseID) (domain.Nurse, error) {
	return s.repo.FindByID(ctx, id)
}

func (s *NurseService) UpdateNurse(ctx context.Context, n domain.Nurse) error {
	return s.repo.Update(ctx, n)
}

func (s *NurseService) SetStatus(ctx context.Context, id domain.NurseID, isActive bool, actor string) error {
	n, err := s.repo.FindByID(ctx, id)
	if err != nil {
		return err
	}
	n.IsActive = isActive
	n.UpdatedBy = actor
	return s.repo.Update(ctx, n)
}

func (s *NurseService) DeleteNurse(ctx context.Context, id domain.NurseID) error {
	return s.repo.Delete(ctx, id)
}
