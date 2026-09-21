package database_test

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	mysql "github.com/go-sql-driver/mysql"
	"nurse-scheduler/backend/internal/domain"
	"nurse-scheduler/backend/internal/platform/database"
	"nurse-scheduler/backend/internal/repository"
	"nurse-scheduler/backend/internal/service"
	"nurse-scheduler/backend/internal/testfixture"
	"nurse-scheduler/backend/migrations"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestMySQLRosterTransactions(t *testing.T) {
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
	defer root.Close()
	name := fmt.Sprintf("nurse_s3_%d_test", time.Now().UnixNano())
	if !strings.HasPrefix(name, "nurse_s3_") || !strings.HasSuffix(name, "_test") {
		t.Fatal("unsafe database name")
	}
	if _, e = root.Exec("CREATE DATABASE " + name + " CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"); e != nil {
		t.Fatal(e)
	}
	defer func() {
		if _, e := root.Exec("DROP DATABASE " + name); e != nil {
			t.Errorf("cleanup %s: %v", name, e)
		}
	}()
	dsn.DBName = name
	db, e := sql.Open("mysql", dsn.FormatDSN())
	if e != nil {
		t.Fatal(e)
	}
	defer db.Close()
	path, e := filepath.Abs("../../../migrations")
	if e != nil {
		t.Fatal(e)
	}
	if e = migrations.Apply(db, path); e != nil {
		t.Fatal(e)
	}
	if e = migrations.Apply(db, path); e != nil {
		t.Fatal("migration not idempotent", e)
	}
	exec := func(q string, args ...any) {
		t.Helper()
		if _, e := db.Exec(q, args...); e != nil {
			t.Fatal(e)
		}
	}
	r := testfixture.Roster()
	exec("INSERT INTO wards(id,name,timezone) VALUES(?,?,?)", r.WardID, "หน่วยทดสอบ", r.Timezone)
	for _, n := range r.Staff {
		skills, _ := json.Marshal(n.Skills)
		allowed, _ := json.Marshal(n.Allowed)
		exec("INSERT INTO nurses(id,ward_id,name,position,is_charge_eligible,can_double_shift,is_part_time,is_active,skills,allowed_shift_codes) VALUES(?,?,?,?,?,?,?,?,?,?)", n.ID, r.WardID, n.Name, n.Position, n.Leader, n.Double, n.PartTime, n.Active, skills, allowed)
	}
	for i, sh := range r.Shifts {
		p, _ := json.Marshal(sh.Periods)
		exec("INSERT INTO shift_types(id,ward_id,code,name,is_double,is_off,total_hours,is_enabled,periods) VALUES(?,?,?,?,?,?,0,1,?)", fmt.Sprintf("test-shift-%d", i), r.WardID, sh.Code, sh.Name, sh.Double, len(sh.Periods) == 0, p)
	}
	holidays, _ := json.Marshal([]domain.DayOff{{Date: "2026-09-09", Name: "วันหยุดทดสอบ"}})
	exec("INSERT INTO holidays(year,data) VALUES(?,?)", 2026, holidays)
	store := &database.RosterStore{DB: db}
	svc := &service.RosterService{Store: store}
	ctx := context.Background()
	actor := domain.Actor{ID: "test-head", Role: "head", Wards: []string{r.WardID}}
	if e = svc.SetPolicy(ctx, r.WardID, r.Policy, actor); e != nil {
		t.Fatal(e)
	}
	august, e := svc.Create(ctx, r.WardID, 8, 2026, actor)
	if e != nil {
		t.Fatal(e)
	}
	_, e = svc.Edit(ctx, august.ID, actor, service.Edit{NurseID: "test-a", Date: "2026-08-31", ShiftCode: "Night"})
	if e != nil {
		t.Fatal(e)
	}
	september, e := svc.Create(ctx, r.WardID, 9, 2026, actor)
	if e != nil {
		t.Fatal(e)
	}
	if len(september.Boundary) != 1 || len(september.Holidays) != 1 {
		t.Fatalf("missing boundary/holiday %+v", september)
	}
	if _, e = svc.Create(ctx, r.WardID, 9, 2026, actor); !errors.Is(e, repository.ErrConflict) {
		t.Fatal("duplicate schedule should conflict", e)
	}
	edit := service.Edit{NurseID: "test-a", Date: "2026-09-01", ShiftCode: "ช"}
	if _, e = svc.Edit(ctx, september.ID, actor, edit); e == nil {
		t.Fatal("expected insufficient rest")
	}
	var count int
	db.QueryRow("SELECT COUNT(*) FROM schedule_assignments WHERE schedule_id=?", september.ID).Scan(&count)
	if count != 0 {
		t.Fatal("failed validation persisted")
	}
	edit.Date = "2026-09-09"
	var wg sync.WaitGroup
	results := make(chan error, 2)
	for range 2 {
		wg.Add(1)
		go func() { defer wg.Done(); _, err := svc.Edit(ctx, september.ID, actor, edit); results <- err }()
	}
	wg.Wait()
	close(results)
	success, conflict := 0, 0
	for err := range results {
		if err == nil {
			success++
		} else if errors.Is(err, repository.ErrConflict) {
			conflict++
		} else {
			t.Fatal(err)
		}
	}
	if success != 1 || conflict != 1 {
		t.Fatalf("race %d %d", success, conflict)
	}
	got, e := svc.Get(ctx, september.ID, actor)
	if e != nil {
		t.Fatal(e)
	}
	c := got.Assignments[0]
	got, e = svc.Lock(ctx, september.ID, c.ID, c.Version, true, "ยืนยันเวร", actor)
	if e != nil {
		t.Fatal(e)
	}
	c = got.Assignments[0]
	if !c.Locked || c.LockedBy != actor.ID {
		t.Fatal("lock not persisted")
	}
	edit.Version = c.Version
	edit.ShiftCode = "X"
	if _, e = svc.Edit(ctx, september.ID, actor, edit); !errors.Is(e, repository.ErrForbidden) {
		t.Fatal(e)
	}
	got, e = svc.Lock(ctx, september.ID, c.ID, c.Version, false, "แก้ไขเวร", actor)
	if e != nil {
		t.Fatal(e)
	}
	// Force an audit insert failure: the cell update must roll back with it.
	exec("RENAME TABLE schedule_audit TO unavailable_audit")
	edit.Version = got.Assignments[0].Version
	if _, e = svc.Edit(ctx, september.ID, actor, edit); e == nil {
		t.Fatal("audit failure expected")
	}
	exec("RENAME TABLE unavailable_audit TO schedule_audit")
	got, e = svc.Get(ctx, september.ID, actor)
	if e != nil {
		t.Fatal(e)
	}
	if got.Assignments[0].ShiftCode != "ช" || got.Assignments[0].Version != edit.Version {
		t.Fatal("transaction failed to roll back")
	}
	if e = db.QueryRow("SELECT COUNT(*) FROM schedule_audit WHERE schedule_id=?", september.ID).Scan(&count); e != nil {
		t.Fatal(e)
	}
	if count != 4 {
		t.Fatalf("audit count %d", count)
	}
}
