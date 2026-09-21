package service

import (
	"context"
	"nurse-scheduler/backend/internal/domain"
	"nurse-scheduler/backend/internal/repository"
)

type ShiftTypeService struct {
	repo repository.ShiftTypeRepository
}

func NewShiftTypeService(r repository.ShiftTypeRepository) *ShiftTypeService {
	return &ShiftTypeService{repo: r}
}

func (s *ShiftTypeService) ListShiftTypes(ctx context.Context, wardID domain.WardID) ([]domain.ShiftType, error) {
	return s.repo.FindByWard(ctx, wardID)
}

func (s *ShiftTypeService) CreateShiftType(ctx context.Context, st domain.ShiftType) error {
	return s.repo.Save(ctx, st)
}

func (s *ShiftTypeService) UpdateShiftType(ctx context.Context, st domain.ShiftType) error {
	return s.repo.Update(ctx, st)
}
func (s *ShiftTypeService) DeleteShiftType(ctx context.Context, id domain.ShiftTypeID) error {
	return s.repo.Delete(ctx, id)
}
