package database_test

import (
	"context"
	"database/sql"
	"fmt"
	mysql "github.com/go-sql-driver/mysql"
	"nurse-scheduler/backend/internal/domain"
	"nurse-scheduler/backend/internal/platform/database"
	"nurse-scheduler/backend/internal/repository"
	"nurse-scheduler/backend/internal/scheduler"
	"nurse-scheduler/backend/internal/testfixture"
	"nurse-scheduler/backend/migrations"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func setupTestDB(t *testing.T) (*sql.DB, func()) {
	t.Helper()
	if os.Getenv("NURSE_MYSQL_TEST") != "1" {
		t.Skip("set NURSE_MYSQL_TEST=1 for isolated MySQL integration")
	}
	cfg := database.NewConfigFromEnv()
	dsn := mysql.NewConfig()
	dsn.User = cfg.User
	dsn.Passwd = cfg.Password
	dsn.Net = "tcp"
	dsn.Addr = cfg.Host + ":" + cfg.Port
	dsn.ParseTime = true
	root, e := sql.Open("mysql", dsn.FormatDSN())
	if e != nil {
		t.Fatal(e)
	}
	name := fmt.Sprintf("nurse_solver_%d_test", time.Now().UnixNano())
	if !strings.HasPrefix(name, "nurse_solver_") || !strings.HasSuffix(name, "_test") {
		t.Fatal("unsafe database name")
	}
	if _, e = root.Exec("CREATE DATABASE " + name + " CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"); e != nil {
		root.Close()
		t.Fatal(e)
	}
	cleanup := func() {
		defer root.Close()
		_, _ = root.Exec("DROP DATABASE " + name)
	}

	dsn.DBName = name
	db, e := sql.Open("mysql", dsn.FormatDSN())
	if e != nil {
		cleanup()
		t.Fatal(e)
	}
	path, e := filepath.Abs("../../../migrations")
	if e != nil {
		db.Close()
		cleanup()
		t.Fatal(e)
	}
	if e = migrations.Apply(db, path); e != nil {
		db.Close()
		cleanup()
		t.Fatal(e)
	}

	return db, func() {
		db.Close()
		cleanup()
	}
}

func TestMySQLSolverStoreLifecycle(t *testing.T) {
	db, cleanup := setupTestDB(t)
	defer cleanup()

	ctx := context.Background()
	store := &database.SolverStore{DB: db}

	// Insert ward and schedule to satisfy foreign keys if any
	_, err := db.Exec("INSERT INTO wards(id,name,timezone) VALUES('test-ward','หน่วยทดสอบ','Asia/Bangkok')")
	if err != nil {
		t.Fatal(err)
	}
	res, err := db.Exec("INSERT INTO schedules(ward_id,month,year,status,version) VALUES('test-ward',9,2026,'draft',1)")
	if err != nil {
		t.Fatal(err)
	}
	schedID, _ := res.LastInsertId()

	r := testfixture.Roster()
	r = testfixture.ReadyRoster(r)
	snap, err := scheduler.Snapshot(r)
	if err != nil {
		t.Fatal(err)
	}

	jobID := "job-lifecycle-1"
	job := domain.SolverJob{
		ID:         jobID,
		ScheduleID: schedID,
		WardID:     "test-ward",
		Status:     "pending",
		Input: domain.SolverInput{
			Snapshot: snap,
			Scope:    domain.SolveScope{},
			Seed:     42,
		},
		CreatedAt: time.Now().UTC(),
		UpdatedAt: time.Now().UTC(),
	}

	// 1. Create Job
	if err := store.CreateJob(ctx, job); err != nil {
		t.Fatalf("CreateJob failed: %v", err)
	}

	// 2. Get Job
	fetched, err := store.GetJob(ctx, jobID)
	if err != nil {
		t.Fatalf("GetJob failed: %v", err)
	}
	if fetched.ID != jobID || fetched.Status != "pending" {
		t.Fatalf("unexpected fetched job: %+v", fetched)
	}

	// 3. Update Job from pending -> running
	job.Status = "running"
	job.UpdatedAt = time.Now().UTC()
	if err := store.UpdateJob(ctx, job, "pending"); err != nil {
		t.Fatalf("UpdateJob to running failed: %v", err)
	}

	// 4. Optimistic concurrency conflict when previous status mismatch
	job.Status = "completed"
	if err := store.UpdateJob(ctx, job, "pending"); err != repository.ErrConflict {
		t.Fatalf("expected ErrConflict on status mismatch, got: %v", err)
	}

	// 5. Update Job from running -> completed with Result & Score
	job.Status = "completed"
	job.Result = &domain.SolverOutput{
		Status:      "complete",
		Assignments: []domain.Cell{{ID: 1, NurseID: "test-a", Date: "2026-09-01", ShiftCode: "ช", Version: 1}},
		Score: domain.FairnessScore{
			Coverage:   100,
			Fairness:   95,
			Preference: 90,
			Stability:  100,
			Total:      96.25,
		},
	}
	job.UpdatedAt = time.Now().UTC()
	if err := store.UpdateJob(ctx, job, "running"); err != nil {
		t.Fatalf("UpdateJob to completed failed: %v", err)
	}

	// Verify completion
	completed, err := store.GetJob(ctx, jobID)
	if err != nil {
		t.Fatalf("GetJob after complete failed: %v", err)
	}
	if completed.Status != "completed" || completed.Result == nil || completed.Result.Score.Total != 96.25 {
		t.Fatalf("unexpected completed job: %+v", completed)
	}

	// Verify schedule_scores table row exists
	var scoreData []byte
	err = db.QueryRow("SELECT data FROM schedule_scores WHERE job_id=?", jobID).Scan(&scoreData)
	if err != nil {
		t.Fatalf("schedule_scores row missing: %v", err)
	}
}

func TestMySQLSolverInterruptJobs(t *testing.T) {
	db, cleanup := setupTestDB(t)
	defer cleanup()

	ctx := context.Background()
	store := &database.SolverStore{DB: db}

	_, _ = db.Exec("INSERT INTO wards(id,name,timezone) VALUES('test-ward','หน่วยทดสอบ','Asia/Bangkok')")
	res, _ := db.Exec("INSERT INTO schedules(ward_id,month,year,status,version) VALUES('test-ward',9,2026,'draft',1)")
	schedID, _ := res.LastInsertId()

	r := testfixture.Roster()
	snap, _ := scheduler.Snapshot(r)

	// Create 2 jobs: 1 running, 1 pending
	for _, id := range []string{"job-running", "job-pending"} {
		_ = store.CreateJob(ctx, domain.SolverJob{
			ID:         id,
			ScheduleID: schedID,
			WardID:     "test-ward",
			Status:     "pending",
			Input: domain.SolverInput{
				Snapshot: snap,
			},
			CreatedAt: time.Now().UTC(),
			UpdatedAt: time.Now().UTC(),
		})
	}

	_ = store.UpdateJob(ctx, domain.SolverJob{
		ID:         "job-running",
		ScheduleID: schedID,
		WardID:     "test-ward",
		Status:     "running",
		Input:      domain.SolverInput{Snapshot: snap},
		UpdatedAt:  time.Now().UTC(),
	}, "pending")

	// Call InterruptJobs (simulates crash/server restart)
	if err := store.InterruptJobs(ctx); err != nil {
		t.Fatalf("InterruptJobs failed: %v", err)
	}

	// Both should now be failed
	for _, id := range []string{"job-running", "job-pending"} {
		j, err := store.GetJob(ctx, id)
		if err != nil {
			t.Fatalf("GetJob failed for %s: %v", id, err)
		}
		if j.Status != "failed" {
			t.Fatalf("expected job %s status to be failed, got %s", id, j.Status)
		}
	}
}
