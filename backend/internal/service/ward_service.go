package service

import (
	"context"
	"fmt"
	"nurse-scheduler/backend/internal/domain"
	"nurse-scheduler/backend/internal/repository"
)

type WardService struct {
	repo repository.WardRepository
}

func NewWardService(r repository.WardRepository) *WardService {
	return &WardService{repo: r}
}

func (s *WardService) GetWard(ctx context.Context, id domain.WardID) (domain.Ward, error) {
	return s.repo.FindByID(ctx, id)
}

func (s *WardService) ListWards(ctx context.Context) ([]domain.Ward, error) {
	return s.repo.FindAll(ctx)
}

func (s *WardService) CreateWard(ctx context.Context, w domain.Ward) error {
	if w.ID == "" {
		return fmt.Errorf("ward ID cannot be empty")
	}
	if w.Name == "" {
		return fmt.Errorf("ward name cannot be empty")
	}
	if w.Timezone == "" {
		w.Timezone = "Asia/Bangkok"
	}
	if w.Version == 0 {
		w.Version = 1
	}
	return s.repo.Save(ctx, w)
}

func (s *WardService) UpdateWard(ctx context.Context, w domain.Ward) error {
	return s.repo.Update(ctx, w)
}

func (s *WardService) SetStatus(ctx context.Context, id domain.WardID, isActive bool, updatedBy string) error {
	return s.repo.SetStatus(ctx, id, isActive, updatedBy)
}

func (s *WardService) DeleteWard(ctx context.Context, id domain.WardID) error {
	return s.repo.Delete(ctx, id)
}
