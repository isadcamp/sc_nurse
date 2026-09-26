package database

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	mysql "github.com/go-sql-driver/mysql"
	"nurse-scheduler/backend/internal/domain"
	"nurse-scheduler/backend/internal/repository"
	"nurse-scheduler/backend/internal/validation"
	"strings"
	"time"
)

type RosterStore struct{ DB *sql.DB }
type queryer interface {
	QueryContext(context.Context, string, ...any) (*sql.Rows, error)
	QueryRowContext(context.Context, string, ...any) *sql.Row
}

const defaultPolicyJSON = `{"status":"confirmed","version":"v1.0","effectiveFrom":"2020-01-01","effectiveTo":"2099-12-31","minRestHours":8,"maxConsecutiveDays":6,"maxConsecutiveNights":3,"maxMonthlyHours":240,"maxContinuousHours":16,"maxDoubleShifts":8,"nightStart":1320,"nightEnd":1800,"fairnessHours":48,"weights":{"coverage":100,"fairness":50,"preference":20,"stability":10},"targets":[],"preferences":[],"staffing":[{"date":"","start":480,"end":960,"rn":1,"pn":1,"leaders":1,"skills":{}},{"date":"","start":960,"end":1440,"rn":1,"pn":1,"leaders":1,"skills":{}},{"date":"","start":0,"end":480,"rn":1,"pn":0,"leaders":1,"skills":{}}]}`

func dbError(err error) error {
	if errors.Is(err, sql.ErrNoRows) {
		return repository.ErrNotFound
	}
	var e *mysql.MySQLError
	if errors.As(err, &e) && e.Number == 1062 {
		return repository.ErrConflict
	}
	return err
}
func (s *RosterStore) Get(ctx context.Context, id int64) (domain.Roster, error) {
	tx, e := s.DB.BeginTx(ctx, &sql.TxOptions{ReadOnly: true, Isolation: sql.LevelRepeatableRead})
	if e != nil {
		return domain.Roster{}, e
	}
	defer tx.Rollback()
	r, e := loadRoster(ctx, tx, id)
	if e != nil {
		return r, e
	}
	return r, tx.Commit()
}
func (s *RosterStore) List(ctx context.Context, w string, m, y int) ([]domain.Roster, error) {
	var query string
	var args []any
	if m > 0 && y > 0 {
		query = "SELECT s.id,s.ward_id,s.month,s.year,s.status,s.version,s.published_by,s.published_at FROM schedules s WHERE s.ward_id=? AND s.month=? AND s.year=? ORDER BY (s.status = 'published') DESC, s.version DESC, s.id DESC"
		args = []any{w, m, y}
	} else if y > 0 {
		query = "SELECT s.id,s.ward_id,s.month,s.year,s.status,s.version,s.published_by,s.published_at FROM schedules s WHERE s.ward_id=? AND s.year=? ORDER BY s.month ASC, (s.status = 'published') DESC, s.version DESC, s.id DESC"
		args = []any{w, y}
	} else {
		query = "SELECT s.id,s.ward_id,s.month,s.year,s.status,s.version,s.published_by,s.published_at FROM schedules s WHERE s.ward_id=? ORDER BY s.year DESC, s.month ASC, (s.status = 'published') DESC, s.version DESC, s.id DESC"
		args = []any{w}
	}
	rows, e := s.DB.QueryContext(ctx, query, args...)
	if e != nil {
		return nil, e
	}
	defer rows.Close()
	out := []domain.Roster{}
	for rows.Next() {
		var r domain.Roster
		var publishedBy sql.NullString
		var publishedAt sql.NullTime
		if e = rows.Scan(&r.ID, &r.WardID, &r.Month, &r.Year, &r.Status, &r.Version, &publishedBy, &publishedAt); e != nil {
			return nil, e
		}
		if publishedBy.Valid {
			r.PublishedBy = publishedBy.String
		}
		if publishedAt.Valid {
			r.PublishedAt = publishedAt.Time.UTC().Format(time.RFC3339)
		}
		out = append(out, r)
	}
	return out, rows.Err()
}
func lockWard(ctx context.Context, tx *sql.Tx, w string) error {
	var id string
	return dbError(tx.QueryRowContext(ctx, "SELECT id FROM wards WHERE id=? FOR UPDATE", w).Scan(&id))
}
func audit(ctx context.Context, tx *sql.Tx, id any, w string, a domain.Audit) error {
	_, e := tx.ExecContext(ctx, "INSERT INTO schedule_audit(schedule_id,ward_id,actor,action,reason,before_data,after_data,created_at) VALUES(?,?,?,?,?,?,?,?)", id, w, a.Actor, a.Action, a.Reason, a.Before, a.After, a.At.UTC())
	return e
}
func (s *RosterStore) Create(ctx context.Context, w string, m, y int, a domain.Audit) (domain.Roster, error) {
	tx, e := s.DB.BeginTx(ctx, nil)
	if e != nil {
		return domain.Roster{}, e
	}
	defer tx.Rollback()
	if e = lockWard(ctx, tx, w); e != nil {
		return domain.Roster{}, e
	}
	_ = pruneOldDrafts(ctx, tx, w, m, y, 12)
	res, e := tx.ExecContext(ctx, "INSERT INTO schedules(ward_id,month,year,status,policy_snapshot) VALUES(?,?,?,'draft',(SELECT policy FROM roster_policies WHERE ward_id=?))", w, m, y, w)
	if e != nil {
		return domain.Roster{}, dbError(e)
	}
	id, e := res.LastInsertId()
	if e != nil {
		return domain.Roster{}, e
	}
	r, e := loadRoster(ctx, tx, id)
	if e != nil {
		return r, e
	}
	if e = audit(ctx, tx, id, w, a); e != nil {
		return r, e
	}
	return r, tx.Commit()
}
func (s *RosterStore) Change(ctx context.Context, id int64, fn func(*domain.Roster) (domain.Audit, error)) (domain.Roster, error) {
	tx, e := s.DB.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelReadCommitted})
	if e != nil {
		return domain.Roster{}, e
	}
	defer tx.Rollback()
	var w string
	if e = tx.QueryRowContext(ctx, "SELECT ward_id FROM schedules WHERE id=?", id).Scan(&w); e != nil {
		return domain.Roster{}, dbError(e)
	}
	// Serialize all months in the ward: adjacent month edits cannot invalidate each other's snapshot.
	if e = lockWard(ctx, tx, w); e != nil {
		return domain.Roster{}, e
	}
	r, e := loadRoster(ctx, tx, id)
	if e != nil {
		return r, e
	}
	before := map[int64]domain.Cell{}
	for _, c := range r.Assignments {
		before[c.ID] = c
	}
	a, e := fn(&r)
	if e != nil {
		return domain.Roster{}, e
	}
	for i, c := range r.Assignments {
		old, exists := before[c.ID]
		if exists && old == c {
			continue
		}
		if !exists {
			res, err := tx.ExecContext(ctx, "INSERT INTO schedule_assignments(schedule_id,nurse_id,date,shift_code,version) VALUES(?,?,?,?,?)", id, c.NurseID, c.Date, c.ShiftCode, c.Version)
			if err != nil {
				return r, dbError(err)
			}
			c.ID, err = res.LastInsertId()
			if err != nil {
				return r, err
			}
			r.Assignments[i].ID = c.ID
		} else {
			res, err := tx.ExecContext(ctx, "UPDATE schedule_assignments SET shift_code=?,version=? WHERE id=? AND schedule_id=? AND version=?", c.ShiftCode, c.Version, c.ID, id, old.Version)
			if err != nil {
				return r, err
			}
			n, err := res.RowsAffected()
			if err != nil {
				return r, err
			}
			if n != 1 {
				return r, repository.ErrConflict
			}
		}
		if c.Locked {
			_, e = tx.ExecContext(ctx, "INSERT INTO assignment_locks(assignment_id,locked_by) VALUES(?,?) ON DUPLICATE KEY UPDATE locked_by=VALUES(locked_by),locked_at=CURRENT_TIMESTAMP", c.ID, c.LockedBy)
		} else {
			_, e = tx.ExecContext(ctx, "DELETE FROM assignment_locks WHERE assignment_id=?", c.ID)
		}
		if e != nil {
			return r, e
		}
	}
	if r.Status != "" {
		if _, e = tx.ExecContext(ctx, "UPDATE schedules SET status=? WHERE id=?", r.Status, id); e != nil {
			return r, e
		}
	}
	if e = audit(ctx, tx, id, w, a); e != nil {
		return r, e
	}
	return r, tx.Commit()
}
func (s *RosterStore) SaveBoundaryShifts(ctx context.Context, scheduleID int64, date string, shifts map[string]string, a domain.Audit) (domain.Roster, error) {
	t, err := time.Parse("2006-01-02", date)
	if err != nil {
		return domain.Roster{}, repository.ErrInput
	}
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return domain.Roster{}, err
	}
	defer tx.Rollback()

	var wardID string
	var month, year int
	err = tx.QueryRowContext(ctx, "SELECT ward_id, month, year FROM schedules WHERE id=?", scheduleID).Scan(&wardID, &month, &year)
	if err != nil {
		return domain.Roster{}, dbError(err)
	}
	if err = lockWard(ctx, tx, wardID); err != nil {
		return domain.Roster{}, err
	}

	targetMonth := int(t.Month())
	targetYear := t.Year()

	var targetScheduleID int64
	err = tx.QueryRowContext(ctx, "SELECT id FROM schedules WHERE ward_id=? AND month=? AND year=? ORDER BY version DESC, id DESC LIMIT 1", wardID, targetMonth, targetYear).Scan(&targetScheduleID)
	if errors.Is(err, sql.ErrNoRows) {
		res, execErr := tx.ExecContext(ctx, "INSERT INTO schedules(ward_id, month, year, status) VALUES(?, ?, ?, 'draft')", wardID, targetMonth, targetYear)
		if execErr != nil {
			return domain.Roster{}, execErr
		}
		targetScheduleID, execErr = res.LastInsertId()
		if execErr != nil {
			return domain.Roster{}, execErr
		}
	} else if err != nil {
		return domain.Roster{}, err
	}

	for nurseID, shiftCode := range shifts {
		if shiftCode == "" {
			continue
		}
		var assignID int64
		var ver int
		qErr := tx.QueryRowContext(ctx, "SELECT id, version FROM schedule_assignments WHERE schedule_id=? AND nurse_id=? AND date=?", targetScheduleID, nurseID, date).Scan(&assignID, &ver)
		if errors.Is(qErr, sql.ErrNoRows) {
			_, err = tx.ExecContext(ctx, "INSERT INTO schedule_assignments(schedule_id, nurse_id, date, shift_code, version) VALUES(?, ?, ?, ?, 1)", targetScheduleID, nurseID, date, shiftCode)
		} else if qErr == nil {
			_, err = tx.ExecContext(ctx, "UPDATE schedule_assignments SET shift_code=?, version=version+1 WHERE id=?", shiftCode, assignID)
		} else {
			return domain.Roster{}, qErr
		}
		if err != nil {
			return domain.Roster{}, err
		}
	}

	_ = audit(ctx, tx, scheduleID, wardID, a)
	if err = tx.Commit(); err != nil {
		return domain.Roster{}, err
	}

	return s.Get(ctx, scheduleID)
}
func (s *RosterStore) SetPolicy(ctx context.Context, w string, p domain.Policy, a domain.Audit) error {
	tx, e := s.DB.BeginTx(ctx, nil)
	if e != nil {
		return e
	}
	defer tx.Rollback()
	if e = lockWard(ctx, tx, w); e != nil {
		return e
	}
	b, e := json.Marshal(p)
	if e != nil {
		return e
	}
	a.After = string(b)
	var old string
	e = tx.QueryRowContext(ctx, "SELECT policy FROM roster_policies WHERE ward_id=?", w).Scan(&old)
	if e != nil && !errors.Is(e, sql.ErrNoRows) {
		return e
	}
	a.Before = old
	oldPolicy := []byte(old)
	if len(oldPolicy) == 0 {
		oldPolicy = []byte(defaultPolicyJSON)
	}
	if _, e = tx.ExecContext(ctx, "UPDATE schedules SET policy_snapshot=? WHERE ward_id=? AND policy_snapshot IS NULL", oldPolicy, w); e != nil {
		return e
	}
	if _, e = tx.ExecContext(ctx, "UPDATE schedules SET policy_snapshot=? WHERE ward_id=? AND status IN ('draft','generated')", b, w); e != nil {
		return e
	}
	_, e = tx.ExecContext(ctx, "INSERT INTO roster_policies(ward_id,policy) VALUES(?,?) ON DUPLICATE KEY UPDATE policy=VALUES(policy)", w, b)
	if e != nil {
		return e
	}
	if e = audit(ctx, tx, nil, w, a); e != nil {
		return e
	}
	return tx.Commit()
}
func loadRoster(ctx context.Context, q queryer, id int64) (domain.Roster, error) {
	r := domain.Roster{Assignments: []domain.Cell{}, Boundary: []domain.Cell{}, Staff: []domain.Staff{}, Shifts: []domain.RosterShift{}, Holidays: []domain.DayOff{}, Leaves: []domain.Leave{}}
	var submittedAt, approvedAt, publishedAt, closedAt sql.NullTime
	var submittedBy, approvedBy, publishedBy, closedBy sql.NullString
	var parentID sql.NullInt64
	var policySnapshot []byte
	e := q.QueryRowContext(ctx, "SELECT s.id,s.ward_id,s.month,s.year,s.status,s.version,s.parent_id,s.submitted_by,s.submitted_at,s.approved_by,s.approved_at,s.published_by,s.published_at,s.closed_by,s.closed_at,w.timezone,s.policy_snapshot FROM schedules s JOIN wards w ON w.id=s.ward_id WHERE s.id=?", id).Scan(
		&r.ID, &r.WardID, &r.Month, &r.Year, &r.Status, &r.Version, &parentID,
		&submittedBy, &submittedAt, &approvedBy, &approvedAt, &publishedBy, &publishedAt, &closedBy, &closedAt,
		&r.Timezone, &policySnapshot)
	if e != nil {
		return r, dbError(e)
	}
	if parentID.Valid {
		r.ParentID = &parentID.Int64
	}
	if submittedBy.Valid {
		r.SubmittedBy = submittedBy.String
	}
	if submittedAt.Valid {
		r.SubmittedAt = submittedAt.Time.UTC().Format(time.RFC3339)
	}
	if approvedBy.Valid {
		r.ApprovedBy = approvedBy.String
	}
	if approvedAt.Valid {
		r.ApprovedAt = approvedAt.Time.UTC().Format(time.RFC3339)
	}
	if publishedBy.Valid {
		r.PublishedBy = publishedBy.String
	}
	if publishedAt.Valid {
		r.PublishedAt = publishedAt.Time.UTC().Format(time.RFC3339)
	}
	if closedBy.Valid {
		r.ClosedBy = closedBy.String
	}
	if closedAt.Valid {
		r.ClosedAt = closedAt.Time.UTC().Format(time.RFC3339)
	}
	var policy []byte
	if len(policySnapshot) > 0 {
		policy = policySnapshot
	} else {
		e = q.QueryRowContext(ctx, "SELECT policy FROM roster_policies WHERE ward_id=?", r.WardID).Scan(&policy)
		if errors.Is(e, sql.ErrNoRows) {
			policy = []byte(defaultPolicyJSON)
		} else if e != nil {
			return r, e
		}
	}
	savedCompensation := r.Policy.Compensation
	if e = json.Unmarshal(policy, &r.Policy); e != nil {
		_ = json.Unmarshal([]byte(defaultPolicyJSON), &r.Policy)
	} else {
		savedCompensation = r.Policy.Compensation
	}
	if !validation.PolicyValid(r.Policy) {
		_ = json.Unmarshal([]byte(defaultPolicyJSON), &r.Policy)
		r.Policy.Compensation = savedCompensation
	}
	rows, e := q.QueryContext(ctx, "SELECT id,name,position,is_charge_eligible,can_double_shift,is_part_time,is_active,COALESCE(skills,'[]'),COALESCE(allowed_shift_codes,'[]') FROM nurses WHERE ward_id=? ORDER BY id", r.WardID)
	if e != nil {
		return r, e
	}
	for rows.Next() {
		var n domain.Staff
		var skills, allowed []byte
		if e = rows.Scan(&n.ID, &n.Name, &n.Position, &n.Leader, &n.Double, &n.PartTime, &n.Active, &skills, &allowed); e != nil {
			rows.Close()
			return r, e
		}
		if e = json.Unmarshal(skills, &n.Skills); e != nil {
			rows.Close()
			return r, e
		}
		if e = json.Unmarshal(allowed, &n.Allowed); e != nil {
			rows.Close()
			return r, e
		}
		r.Staff = append(r.Staff, n)
	}
	e = rows.Err()
	rows.Close()
	if e != nil {
		return r, e
	}
	rows, e = q.QueryContext(ctx, "SELECT code,name,is_double,periods FROM shift_types WHERE ward_id=? AND is_enabled=1 ORDER BY code", r.WardID)
	if e == nil {
		for rows.Next() {
			var sh domain.RosterShift
			var p []byte
			if scanErr := rows.Scan(&sh.Code, &sh.Name, &sh.Double, &p); scanErr == nil {
				if len(p) > 0 {
					_ = json.Unmarshal(p, &sh.Periods)
				}
				r.Shifts = append(r.Shifts, sh)
			}
		}
		rows.Close()
	}
	hasShift := func(c string) bool {
		for _, s := range r.Shifts {
			if strings.EqualFold(s.Code, c) {
				return true
			}
		}
		return false
	}
	if !hasShift("X") && !hasShift("x") {
		r.Shifts = append(r.Shifts, domain.RosterShift{Code: "X", Name: "OFF (วันหยุด)", Double: false, Periods: []domain.Period{}})
	}
	if !hasShift("L") {
		r.Shifts = append(r.Shifts, domain.RosterShift{Code: "L", Name: "ลา (Leave)", Double: false, Periods: []domain.Period{}})
	}
	if !hasShift("V") {
		r.Shifts = append(r.Shifts, domain.RosterShift{Code: "V", Name: "ลาพักร้อน (Vacation)", Double: false, Periods: []domain.Period{}})
	}
	if !hasShift("อบ") {
		r.Shifts = append(r.Shifts, domain.RosterShift{Code: "อบ", Name: "อบรม/ประชุมวิชาการ (8 ชม.)", Double: false, Periods: []domain.Period{{Start: 480, End: 960}}})
	}
	if !hasShift("บห") {
		r.Shifts = append(r.Shifts, domain.RosterShift{Code: "บห", Name: "งานบริหาร/ภารกิจพิเศษ (8 ชม.)", Double: false, Periods: []domain.Period{{Start: 480, End: 960}}})
	}
	if len(r.Shifts) == 0 {
		r.Shifts = []domain.RosterShift{
			{Code: "ช", Name: "เช้า (08:00-16:00)", Double: false, Periods: []domain.Period{{Start: 480, End: 960}}},
			{Code: "บ", Name: "บ่าย (16:00-24:00)", Double: false, Periods: []domain.Period{{Start: 960, End: 1440}}},
			{Code: "ด", Name: "ดึก (00:00-08:00)", Double: false, Periods: []domain.Period{{Start: 0, End: 480}}},
			{Code: "ชบ", Name: "เช้าบ่าย (08:00-24:00)", Double: true, Periods: []domain.Period{{Start: 480, End: 960}, {Start: 960, End: 1440}}},
			{Code: "ชด", Name: "เช้าดึก (08:00-16:00, 00:00-08:00)", Double: true, Periods: []domain.Period{{Start: 480, End: 960}, {Start: 0, End: 480}}},
			{Code: "บด", Name: "บ่ายดึก (16:00-08:00)", Double: true, Periods: []domain.Period{{Start: 960, End: 1440}, {Start: 0, End: 480}}},
			{Code: "Day", Name: "กลางวัน (08:00-20:00)", Double: false, Periods: []domain.Period{{Start: 480, End: 1200}}},
			{Code: "Night", Name: "กลางคืน (20:00-08:00)", Double: false, Periods: []domain.Period{{Start: 1200, End: 1920}}},
			{Code: "X", Name: "OFF (วันหยุด)", Double: false, Periods: []domain.Period{}},
			{Code: "L", Name: "ลา (Leave)", Double: false, Periods: []domain.Period{}},
			{Code: "V", Name: "ลาพักร้อน (Vacation)", Double: false, Periods: []domain.Period{}},
			{Code: "อบ", Name: "อบรม/ประชุมวิชาการ (8 ชม.)", Double: false, Periods: []domain.Period{{Start: 480, End: 960}}},
			{Code: "บห", Name: "งานบริหาร/ภารกิจพิเศษ (8 ชม.)", Double: false, Periods: []domain.Period{{Start: 480, End: 960}}},
		}
	}
	loc, e := time.LoadLocation(r.Timezone)
	if e != nil {
		return r, e
	}
	start := time.Date(r.Year, time.Month(r.Month), 1, 0, 0, 0, 0, loc)
	end := start.AddDate(0, 1, 0)
	precedingDate := start.AddDate(0, 0, -1).Format("2006-01-02")
	startDate := start.Format("2006-01-02")
	endDate := end.Format("2006-01-02")

	// Query current schedule assignments and boundary shifts for the preceding date only
	rows, e = q.QueryContext(ctx, "SELECT a.id,a.nurse_id,DATE_FORMAT(a.date,'%Y-%m-%d'),a.shift_code,a.version,l.assignment_id IS NOT NULL,COALESCE(l.locked_by,''),a.schedule_id FROM schedule_assignments a JOIN schedules s ON s.id=a.schedule_id LEFT JOIN assignment_locks l ON l.assignment_id=a.id WHERE (a.schedule_id=?) OR (s.ward_id=? AND a.date=?) ORDER BY a.date, a.version DESC, a.id DESC", id, r.WardID, precedingDate)
	if e != nil {
		return r, e
	}
	seenBoundary := map[string]bool{}
	for rows.Next() {
		var c domain.Cell
		var sid int64
		if e = rows.Scan(&c.ID, &c.NurseID, &c.Date, &c.ShiftCode, &c.Version, &c.Locked, &c.LockedBy, &sid); e != nil {
			rows.Close()
			return r, e
		}
		if sid == id {
			if c.Date >= startDate && c.Date < endDate {
				r.Assignments = append(r.Assignments, c)
			}
		}
		if c.Date == precedingDate {
			if !seenBoundary[c.NurseID] {
				seenBoundary[c.NurseID] = true
				r.Boundary = append(r.Boundary, c)
			}
		}
	}
	e = rows.Err()
	rows.Close()
	if e != nil {
		return r, e
	}

	// Ensure virtual part-time staff assigned in schedule are present in r.Staff
	staffMap := map[string]bool{}
	for _, s := range r.Staff {
		staffMap[s.ID] = true
	}
	for _, a := range r.Assignments {
		if !staffMap[a.NurseID] && strings.HasPrefix(a.NurseID, "PT-") {
			staffMap[a.NurseID] = true
			pos := "RN"
			if strings.Contains(a.NurseID, "PN") {
				pos = "PN"
			}
			isLead := strings.Contains(a.NurseID, "Lead")
			vName := fmt.Sprintf("[PT] เวรเสริม %s", a.NurseID)
			if isLead {
				vName = fmt.Sprintf("[PT] เวรเสริม หัวหน้า %s", a.NurseID)
			}
			r.Staff = append(r.Staff, domain.Staff{
				ID:       a.NurseID,
				Name:     vName,
				Position: pos,
				Leader:   isLead,
				Double:   true,
				PartTime: true,
				Active:   true,
				Allowed:  []string{"ช", "บ", "ด", "ชบ", "Day", "Night", "D", "N", "X", "L", "V"},
			})
		}
	}

	rows, e = q.QueryContext(ctx, "SELECT nurse_id,DATE_FORMAT(start_date,'%Y-%m-%d'),DATE_FORMAT(end_date,'%Y-%m-%d'),status='approved' FROM leave_requests WHERE ward_id=? AND status IN ('approved','pending') AND start_date<? AND end_date>=?", r.WardID, endDate, precedingDate)
	if e != nil {
		return r, e
	}
	for rows.Next() {
		var l domain.Leave
		if e = rows.Scan(&l.NurseID, &l.Start, &l.End, &l.Approved); e != nil {
			rows.Close()
			return r, e
		}
		r.Leaves = append(r.Leaves, l)
	}
	e = rows.Err()
	rows.Close()
	if e != nil {
		return r, e
	}
	var raw []byte
	e = q.QueryRowContext(ctx, "SELECT data FROM holidays WHERE year=?", r.Year).Scan(&raw)
	if errors.Is(e, sql.ErrNoRows) {
		return r, nil
	}
	if e != nil {
		return r, e
	}
	var holidays []domain.DayOff
	if e = json.Unmarshal(raw, &holidays); e != nil {
		return r, e
	}
	for _, h := range holidays {
		if h.Date >= start.Format("2006-01-02") && h.Date < end.Format("2006-01-02") {
			r.Holidays = append(r.Holidays, h)
		}
	}
	return r, nil
}

func (s *RosterStore) UpdateStatus(ctx context.Context, id int64, status string, meta map[string]string, a domain.Audit) error {
	tx, e := s.DB.BeginTx(ctx, nil)
	if e != nil {
		return e
	}
	defer tx.Rollback()
	var w string
	if e = tx.QueryRowContext(ctx, "SELECT ward_id FROM schedules WHERE id=?", id).Scan(&w); e != nil {
		return dbError(e)
	}
	if e = lockWard(ctx, tx, w); e != nil {
		return e
	}
	setClauses := "status=?"
	args := []any{status}
	for k, v := range meta {
		setClauses += "," + k + "=?"
		if v == "" {
			args = append(args, nil)
		} else {
			args = append(args, v)
		}
	}
	args = append(args, id)
	if _, e = tx.ExecContext(ctx, "UPDATE schedules SET "+setClauses+" WHERE id=?", args...); e != nil {
		return e
	}
	if e = audit(ctx, tx, id, w, a); e != nil {
		return e
	}
	return tx.Commit()
}

func deleteScheduleCascade(ctx context.Context, tx *sql.Tx, id int64) error {
	tables := []string{
		"assignment_locks WHERE assignment_id IN (SELECT id FROM schedule_assignments WHERE schedule_id=?)",
		"schedule_assignments WHERE schedule_id=?",
		"schedule_boundary_data WHERE schedule_id=?",
		"schedule_scores WHERE schedule_id=?",
		"schedule_audit WHERE schedule_id=?",
		"solver_jobs WHERE schedule_id=?",
		"payroll_overrides WHERE schedule_id=?",
	}
	for _, t := range tables {
		_, _ = tx.ExecContext(ctx, "DELETE FROM "+t, id)
	}
	_, err := tx.ExecContext(ctx, "DELETE FROM schedules WHERE id=?", id)
	return err
}

func pruneOldDrafts(ctx context.Context, tx *sql.Tx, wardID string, month, year, maxDrafts int) error {
	rows, err := tx.QueryContext(ctx, "SELECT id FROM schedules WHERE ward_id=? AND month=? AND year=? AND status IN ('draft','generated') ORDER BY id ASC", wardID, month, year)
	if err != nil {
		return err
	}
	defer rows.Close()
	var draftIDs []int64
	for rows.Next() {
		var did int64
		if err := rows.Scan(&did); err == nil {
			draftIDs = append(draftIDs, did)
		}
	}
	if len(draftIDs) >= maxDrafts {
		toDeleteCount := len(draftIDs) - maxDrafts + 1
		for i := 0; i < toDeleteCount; i++ {
			_ = deleteScheduleCascade(ctx, tx, draftIDs[i])
		}
	}
	return nil
}

func (s *RosterStore) Delete(ctx context.Context, id int64, a domain.Audit) error {
	tx, e := s.DB.BeginTx(ctx, nil)
	if e != nil {
		return e
	}
	defer tx.Rollback()
	var w string
	var status string
	if e = tx.QueryRowContext(ctx, "SELECT ward_id, status FROM schedules WHERE id=?", id).Scan(&w, &status); e != nil {
		return dbError(e)
	}
	if status != domain.StatusDraft && status != domain.StatusGenerated {
		return repository.ErrConflict
	}
	if e = lockWard(ctx, tx, w); e != nil {
		return e
	}
	if e = deleteScheduleCascade(ctx, tx, id); e != nil {
		return e
	}
	return tx.Commit()
}

func (s *RosterStore) CreateVersion(ctx context.Context, parentID int64, a domain.Audit) (domain.Roster, error) {
	tx, e := s.DB.BeginTx(ctx, nil)
	if e != nil {
		return domain.Roster{}, e
	}
	defer tx.Rollback()
	var wardID string
	var month, year, version int
	if e = tx.QueryRowContext(ctx, "SELECT ward_id,month,year,version FROM schedules WHERE id=?", parentID).Scan(&wardID, &month, &year, &version); e != nil {
		return domain.Roster{}, dbError(e)
	}
	if e = lockWard(ctx, tx, wardID); e != nil {
		return domain.Roster{}, e
	}
	_ = pruneOldDrafts(ctx, tx, wardID, month, year, 12)
	res, e := tx.ExecContext(ctx, "INSERT INTO schedules(ward_id,month,year,status,version,parent_id,policy_snapshot) SELECT ward_id,month,year,'draft',?,id,policy_snapshot FROM schedules WHERE id=?", version+1, parentID)
	if e != nil {
		return domain.Roster{}, dbError(e)
	}
	newID, e := res.LastInsertId()
	if e != nil {
		return domain.Roster{}, e
	}
	// Copy assignments from parent
	_, e = tx.ExecContext(ctx, "INSERT INTO schedule_assignments(schedule_id,nurse_id,date,shift_code,version) SELECT ?,nurse_id,date,shift_code,1 FROM schedule_assignments WHERE schedule_id=?", newID, parentID)
	if e != nil {
		return domain.Roster{}, e
	}
	// Copy locks from parent
	_, e = tx.ExecContext(ctx, "INSERT INTO assignment_locks(assignment_id,locked_by) SELECT na.id,ol.locked_by FROM schedule_assignments na JOIN schedule_assignments oa ON oa.schedule_id=? AND oa.nurse_id=na.nurse_id AND oa.date=na.date JOIN assignment_locks ol ON ol.assignment_id=oa.id WHERE na.schedule_id=?", parentID, newID)
	if e != nil {
		// ignore if no locks to copy
	}
	r, e := loadRoster(ctx, tx, newID)
	if e != nil {
		return r, e
	}
	if e = audit(ctx, tx, newID, wardID, a); e != nil {
		return r, e
	}
	return r, tx.Commit()
}

func (s *RosterStore) ListVersions(ctx context.Context, wardID string, month, year int) ([]domain.Roster, error) {
	rows, e := s.DB.QueryContext(ctx, "SELECT id,ward_id,month,year,status,version FROM schedules WHERE ward_id=? AND month=? AND year=? ORDER BY (status = 'published') DESC, version DESC, id DESC", wardID, month, year)
	if e != nil {
		return nil, e
	}
	defer rows.Close()
	out := []domain.Roster{}
	for rows.Next() {
		var r domain.Roster
		if e = rows.Scan(&r.ID, &r.WardID, &r.Month, &r.Year, &r.Status, &r.Version); e != nil {
			return nil, e
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

func (s *RosterStore) GetAuditLog(ctx context.Context, scheduleID int64) ([]domain.AuditEntry, error) {
	rows, e := s.DB.QueryContext(ctx, "SELECT id,schedule_id,ward_id,actor,action,reason,DATE_FORMAT(created_at,'%Y-%m-%dT%TZ') FROM schedule_audit WHERE schedule_id=? ORDER BY created_at DESC", scheduleID)
	if e != nil {
		return nil, e
	}
	defer rows.Close()
	out := []domain.AuditEntry{}
	for rows.Next() {
		var a domain.AuditEntry
		if e = rows.Scan(&a.ID, &a.ScheduleID, &a.WardID, &a.Actor, &a.Action, &a.Reason, &a.CreatedAt); e != nil {
			return nil, e
		}
		out = append(out, a)
	}
	return out, rows.Err()
}
