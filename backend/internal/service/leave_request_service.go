package service

import (
	"context"
	"nurse-scheduler/backend/internal/domain"
	"nurse-scheduler/backend/internal/repository"
)

type LeaveRequestService struct {
	repo repository.LeaveRequestRepository
}

func NewLeaveRequestService(r repository.LeaveRequestRepository) *LeaveRequestService {
	return &LeaveRequestService{repo: r}
}

// Create a new leave request
func (s *LeaveRequestService) Create(ctx context.Context, req domain.LeaveRequest) (domain.LeaveRequest, error) {
	return s.repo.Create(ctx, req)
}

// List leave requests for a ward
func (s *LeaveRequestService) ListByWard(ctx context.Context, wardID domain.WardID) ([]domain.LeaveRequest, error) {
	return s.repo.ListByWard(ctx, wardID)
}

// Approve a leave request
func (s *LeaveRequestService) Approve(ctx context.Context, id int64, approver string) error {
	return s.repo.UpdateStatus(ctx, id, domain.LeaveApproved, approver)
}

// Reject a leave request
func (s *LeaveRequestService) Reject(ctx context.Context, id int64, approver string) error {
	return s.repo.UpdateStatus(ctx, id, domain.LeaveRejected, approver)
}
