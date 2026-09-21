package httpapi

import "nurse-scheduler/backend/internal/service"

type Services struct {
	User         *service.UserService
	Solver       *service.SolverService
	Ward         *service.WardService
	Nurse        *service.NurseService
	ShiftType    *service.ShiftTypeService
	Holiday      *service.HolidayService
	LeaveRequest *service.LeaveRequestService
	Roster       *service.RosterService
	AI           *service.AIService
	Credentials  []Credential
}
