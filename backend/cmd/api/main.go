package main

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"time"

	"nurse-scheduler/backend/internal/httpapi"
	"nurse-scheduler/backend/internal/platform/database"
	"nurse-scheduler/backend/internal/scheduler"
	"nurse-scheduler/backend/internal/service"
	"nurse-scheduler/backend/migrations"
)

func main() {
	var credentials []httpapi.Credential
	if rawCreds := os.Getenv("ROSTER_CREDENTIALS"); rawCreds != "" {
		if err := json.Unmarshal([]byte(rawCreds), &credentials); err != nil {
			log.Printf("warning: could not parse ROSTER_CREDENTIALS: %v", err)
		}
	}
	// Load DB configuration from environment variables (with defaults)
	cfg := database.NewConfigFromEnv()
	db, err := database.NewConnection(cfg)
	if err != nil {
		log.Fatalf("failed to connect to DB: %v", err)
	}

	// Apply database migrations
	if err := migrations.Apply(db, env("MIGRATIONS_DIR", "migrations")); err != nil {
		log.Fatalf("migration error: %v", err)
	}

	// Instantiate repositories
	userRepo := database.NewUserRepository(db)
	wardRepo := database.NewWardRepository(db)
	nurseRepo := database.NewNurseRepository(db)
	shiftRepo := database.NewShiftTypeRepository(db)
	holidayRepo := database.NewHolidayRepository(db)
	leaveRepo := database.NewLeaveRequestRepository(db)

	// Instantiate services
	userSvc := service.NewUserService(userRepo)
	if err := userSvc.EnsureDefaultAdmin(context.Background()); err != nil {
		log.Printf("warning: ensure default admin error: %v", err)
	}
	wardSvc := service.NewWardService(wardRepo)
	nurseSvc := service.NewNurseService(nurseRepo)
	shiftSvc := service.NewShiftTypeService(shiftRepo)
	holidaySvc := service.NewHolidayService(holidayRepo)
	leaveSvc := service.NewLeaveRequestService(leaveRepo)

	// Bundle services for the HTTP layer
	services := httpapi.Services{
		User:         userSvc,
		Roster:       &service.RosterService{Store: &database.RosterStore{DB: db}},
		Credentials:  credentials,
		Ward:         wardSvc,
		Nurse:        nurseSvc,
		ShiftType:    shiftSvc,
		Holiday:      holidaySvc,
		LeaveRequest: leaveSvc,
	}

	addr := env("HTTP_ADDR", ":8080")
	jobs := &database.SolverStore{DB: db}
	if err := jobs.InterruptJobs(context.Background()); err != nil {
		log.Fatalf("recover solver jobs: %v", err)
	}
	services.Solver = &service.SolverService{Roster: services.Roster, Jobs: jobs, Solver: scheduler.ConstraintSolver{}}
	services.AI = service.NewAIService(services.Roster)
	router := httpapi.NewRouter(services, env("FRONTEND_ORIGIN", "http://localhost:3000"))
	server := &http.Server{Addr: addr, Handler: router, ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 10 * time.Second, WriteTimeout: 30 * time.Second, IdleTimeout: 60 * time.Second}
	log.Printf("API listening on %s", addr)
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatal(err)
	}
}

func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
