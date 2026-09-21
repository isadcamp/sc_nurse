package testfixture

import (
	"context"
	"nurse-scheduler/backend/internal/domain"
	"nurse-scheduler/backend/internal/repository"
)

type WardRepo struct{}

func (WardRepo) FindByID(_ context.Context, id domain.WardID) (domain.Ward, error) {
	if id != "test-ward" {
		return domain.Ward{}, repository.ErrNotFound
	}
	return Ward(), nil
}
func (WardRepo) FindAll(_ context.Context) ([]domain.Ward, error) { return []domain.Ward{Ward()}, nil }
func (WardRepo) Save(context.Context, domain.Ward) error          { return nil }
func (WardRepo) Update(context.Context, domain.Ward) error        { return nil }
func (WardRepo) Delete(context.Context, domain.WardID) error      { return nil }
func (WardRepo) SetStatus(context.Context, domain.WardID, bool, string) error { return nil }
func Ward() domain.Ward {
	return domain.Ward{ID: "test-ward", Name: "หอผู้ป่วยทดสอบ", Timezone: "Asia/Bangkok", Version: 1}
}
