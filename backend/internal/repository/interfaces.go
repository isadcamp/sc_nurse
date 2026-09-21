package repository

import (
	"context"
	"nurse-scheduler/backend/internal/domain"
)

// Existing repositories
type WardRepository interface {
	FindByID(ctx context.Context, id domain.WardID) (domain.Ward, error)
	FindAll(ctx context.Context) ([]domain.Ward, error)
	Save(ctx context.Context, ward domain.Ward) error
	Update(ctx context.Context, ward domain.Ward) error
	SetStatus(ctx context.Context, id domain.WardID, isActive bool, updatedBy string) error
	Delete(ctx context.Context, id domain.WardID) error
}

type NurseRepository interface {
	FindByID(ctx context.Context, id domain.NurseID) (domain.Nurse, error)
	FindByWard(ctx context.Context, wardID domain.WardID, activeOnly bool) ([]domain.Nurse, error)
	FindActiveNurses(ctx context.Context, wardID domain.WardID) ([]domain.Nurse, error)
	Save(ctx context.Context, nurse domain.Nurse) error
	Update(ctx context.Context, nurse domain.Nurse) error
	Delete(ctx context.Context, id domain.NurseID) error
}

type ShiftTypeRepository interface {
	FindByWard(ctx context.Context, wardID domain.WardID) ([]domain.ShiftType, error)
	FindEnabled(ctx context.Context, wardID domain.WardID) ([]domain.ShiftType, error)
	Save(ctx context.Context, st domain.ShiftType) error
	Update(ctx context.Context, st domain.ShiftType) error
	Delete(ctx context.Context, id domain.ShiftTypeID) error
}

// New repositories for Sprint 2
type HolidayRepository interface {
	FindByYear(ctx context.Context, year int) (domain.HolidayCalendar, error)
	ListYears(ctx context.Context) ([]int, error)
	Save(ctx context.Context, cal domain.HolidayCalendar) error
	DeleteYear(ctx context.Context, year int) error
	CopyYearToDraft(ctx context.Context, srcYear, dstYear int) error
}

type LeaveRequestRepository interface {
	Create(ctx context.Context, req domain.LeaveRequest) (domain.LeaveRequest, error)
	FindByID(ctx context.Context, id int64) (domain.LeaveRequest, error)
	ListByWard(ctx context.Context, wardID domain.WardID) ([]domain.LeaveRequest, error)
	UpdateStatus(ctx context.Context, id int64, status domain.LeaveStatus, approver string) error
}

// New repositories for Sprint 3 (Scheduling)
type ScheduleRepository interface {
	Create(ctx context.Context, s *domain.Schedule) error
	GetByWardMonth(ctx context.Context, wardID string, month, year int) (*domain.Schedule, error)
	ListByWard(ctx context.Context, wardID string) ([]*domain.Schedule, error)
	UpdateStatus(ctx context.Context, id int64, status string) error
}

type AssignmentRepository interface {
	Create(ctx context.Context, a *domain.Assignment) error
	Get(ctx context.Context, id int64) (*domain.Assignment, error)
	UpdateShift(ctx context.Context, id int64, shiftCode string, version int) error
	ListBySchedule(ctx context.Context, scheduleID int64) ([]*domain.Assignment, error)
	Delete(ctx context.Context, id int64) error
}

type LockRepository interface {
	Lock(ctx context.Context, assignmentID int64, user string) error
	Unlock(ctx context.Context, assignmentID int64) error
	IsLocked(ctx context.Context, assignmentID int64) (bool, string, error)
}

type BoundaryRepository interface {
	Save(ctx context.Context, data *domain.BoundaryData) error
	Get(ctx context.Context, scheduleID int64) (*domain.BoundaryData, error)
}

// Place‑holders for future Sprint 2 repos (SchedulingPolicy, Staffing, etc.)
// type PolicyRepository interface { /* ... */ }
// type PolicyVersionRepository interface { /* ... */ }
// type RuleParameterRepository interface { /* ... */ }
// type StaffingTemplateRepository interface { /* ... */ }
// type StaffingRequirementRepository interface { /* ... */ }
// type NurseMonthlyTargetRepository interface { /* ... */ }

type UserRepository interface {
	EnsureDefaultAdmin(ctx context.Context) error
	Authenticate(ctx context.Context, username, password string) (*domain.User, error)
	CreateUser(ctx context.Context, u domain.User, password string) (int, error)
	GetUserByID(ctx context.Context, id int) (*domain.User, error)
	GetUserByUsername(ctx context.Context, username string) (*domain.User, error)
	ListUsers(ctx context.Context) ([]domain.User, error)
	UpdateUser(ctx context.Context, u domain.User) error
	UpdatePassword(ctx context.Context, userID int, newPassword, updatedBy string) error
	SetUserStatus(ctx context.Context, userID int, isActive bool, updatedBy string) error
	DeleteUser(ctx context.Context, userID int) error
	GetUserWards(ctx context.Context, userID int) ([]string, error)
	SetUserWards(ctx context.Context, userID int, wards []string) error
	CreateUserToken(ctx context.Context, token string, userID int, expiresAt domain.UserToken) error
	GetUserByToken(ctx context.Context, token string) (*domain.User, error)
	RevokeToken(ctx context.Context, token string) error
}

