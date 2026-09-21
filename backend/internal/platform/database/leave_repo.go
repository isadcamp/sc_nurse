package database

import (
	"context"
	"database/sql"
	"fmt"
	"nurse-scheduler/backend/internal/domain"
	"time"
)

type LeaveRequestRepository struct {
	db *sql.DB
}

func NewLeaveRequestRepository(db *sql.DB) *LeaveRequestRepository {
	return &LeaveRequestRepository{db: db}
}

func (r *LeaveRequestRepository) Create(ctx context.Context, req domain.LeaveRequest) (domain.LeaveRequest, error) {
	query := `INSERT INTO leave_requests (ward_id, nurse_id, start_date, end_date, reason, status) VALUES (?, ?, ?, ?, ?, ?)`
	status := string(req.Status)
	if status == "" {
		status = string(domain.LeavePending)
	}
	res, err := r.db.ExecContext(ctx, query, req.WardID, req.NurseID, req.StartDate.Format("2006-01-02"), req.EndDate.Format("2006-01-02"), req.Reason, status)
	if err != nil {
		return domain.LeaveRequest{}, fmt.Errorf("insert leave request: %w", err)
	}
	id, err := res.LastInsertId()
	if err != nil {
		return domain.LeaveRequest{}, err
	}
	req.ID = id
	req.Status = domain.LeaveStatus(status)
	req.CreatedAt = time.Now().UTC()
	req.UpdatedAt = time.Now().UTC()
	return req, nil
}

func (r *LeaveRequestRepository) FindByID(ctx context.Context, id int64) (domain.LeaveRequest, error) {
	var req domain.LeaveRequest
	var approver sql.NullString
	var startDate, endDate time.Time
	query := `SELECT id, ward_id, nurse_id, start_date, end_date, COALESCE(reason, ''), status, approver, created_at, updated_at FROM leave_requests WHERE id = ?`
	err := r.db.QueryRowContext(ctx, query, id).Scan(&req.ID, &req.WardID, &req.NurseID, &startDate, &endDate, &req.Reason, &req.Status, &approver, &req.CreatedAt, &req.UpdatedAt)
	if err != nil {
		if err == sql.ErrNoRows {
			return domain.LeaveRequest{}, fmt.Errorf("leave request not found: %w", err)
		}
		return domain.LeaveRequest{}, fmt.Errorf("query leave request: %w", err)
	}
	req.StartDate = startDate
	req.EndDate = endDate
	if approver.Valid {
		req.Approver = approver.String
	}
	return req, nil
}

func (r *LeaveRequestRepository) ListByWard(ctx context.Context, wardID domain.WardID) ([]domain.LeaveRequest, error) {
	query := `SELECT id, ward_id, nurse_id, start_date, end_date, COALESCE(reason, ''), status, approver, created_at, updated_at FROM leave_requests`
	var rows *sql.Rows
	var err error
	if wardID != "" {
		query += ` WHERE ward_id = ? ORDER BY start_date DESC, id DESC`
		rows, err = r.db.QueryContext(ctx, query, string(wardID))
	} else {
		query += ` ORDER BY start_date DESC, id DESC`
		rows, err = r.db.QueryContext(ctx, query)
	}
	if err != nil {
		return nil, fmt.Errorf("list leave requests: %w", err)
	}
	defer rows.Close()

	var result []domain.LeaveRequest
	for rows.Next() {
		var req domain.LeaveRequest
		var approver sql.NullString
		var startDate, endDate time.Time
		if err := rows.Scan(&req.ID, &req.WardID, &req.NurseID, &startDate, &endDate, &req.Reason, &req.Status, &approver, &req.CreatedAt, &req.UpdatedAt); err != nil {
			return nil, err
		}
		req.StartDate = startDate
		req.EndDate = endDate
		if approver.Valid {
			req.Approver = approver.String
		}
		result = append(result, req)
	}
	return result, rows.Err()
}

func (r *LeaveRequestRepository) UpdateStatus(ctx context.Context, id int64, status domain.LeaveStatus, approver string) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	// Query previous leave request state
	var req domain.LeaveRequest
	var startDate, endDate time.Time
	var oldStatus string
	err = tx.QueryRowContext(ctx, "SELECT ward_id, nurse_id, start_date, end_date, status FROM leave_requests WHERE id = ?", id).Scan(&req.WardID, &req.NurseID, &startDate, &endDate, &oldStatus)
	if err != nil {
		return fmt.Errorf("leave request not found: %w", err)
	}

	// 1. Update leave request record
	query := `UPDATE leave_requests SET status = ?, approver = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
	res, err := tx.ExecContext(ctx, query, string(status), approver, id)
	if err != nil {
		return fmt.Errorf("update leave status: %w", err)
	}
	cnt, _ := res.RowsAffected()
	if cnt == 0 {
		return fmt.Errorf("leave request not found")
	}

	// 2. If approved, sync to active schedules and lock the 'L' shifts
	if status == domain.LeaveApproved {
		// Iterate each date in the leave range
		cur := startDate
		for !cur.After(endDate) {
			dateStr := cur.Format("2006-01-02")
			year := cur.Year()
			month := int(cur.Month())

			// Find existing schedules for this ward & month
			sRows, err := tx.QueryContext(ctx, "SELECT id FROM schedules WHERE ward_id = ? AND month = ? AND year = ?", req.WardID, month, year)
			if err == nil {
				var schedIDs []int64
				for sRows.Next() {
					var sid int64
					if err := sRows.Scan(&sid); err == nil {
						schedIDs = append(schedIDs, sid)
					}
				}
				sRows.Close()

				for _, sid := range schedIDs {
					// Upsert assignment with shift_code = 'L'
					var assignID int64
					err := tx.QueryRowContext(ctx, "SELECT id FROM schedule_assignments WHERE schedule_id = ? AND nurse_id = ? AND date = ?", sid, req.NurseID, dateStr).Scan(&assignID)
					if err == sql.ErrNoRows {
						insRes, err := tx.ExecContext(ctx, "INSERT INTO schedule_assignments (schedule_id, nurse_id, date, shift_code, version) VALUES (?, ?, ?, 'L', 1)", sid, req.NurseID, dateStr)
						if err == nil {
							assignID, _ = insRes.LastInsertId()
						}
					} else if err == nil {
						_, _ = tx.ExecContext(ctx, "UPDATE schedule_assignments SET shift_code = 'L', version = version + 1 WHERE id = ?", assignID)
					}

					if assignID > 0 {
						// Lock the assignment
						_, _ = tx.ExecContext(ctx, "INSERT INTO assignment_locks (assignment_id, locked_by) VALUES (?, ?) ON DUPLICATE KEY UPDATE locked_by = VALUES(locked_by), locked_at = CURRENT_TIMESTAMP", assignID, approver)
						// Audit
						_, _ = tx.ExecContext(ctx, "INSERT INTO schedule_audit (schedule_id, ward_id, actor, action, reason, created_at) VALUES (?, ?, ?, 'leave_approved_lock', ?, CURRENT_TIMESTAMP)", sid, req.WardID, approver, fmt.Sprintf("อนุมัติวันลา %s (%s)", req.NurseID, dateStr))
					}
				}
			}
			cur = cur.AddDate(0, 0, 1)
		}
	} else if oldStatus == string(domain.LeaveApproved) && status != domain.LeaveApproved {
		// Revert previously approved 'L' shifts and unlock assignments
		cur := startDate
		for !cur.After(endDate) {
			dateStr := cur.Format("2006-01-02")
			year := cur.Year()
			month := int(cur.Month())

			sRows, err := tx.QueryContext(ctx, "SELECT id FROM schedules WHERE ward_id = ? AND month = ? AND year = ?", req.WardID, month, year)
			if err == nil {
				var schedIDs []int64
				for sRows.Next() {
					var sid int64
					if err := sRows.Scan(&sid); err == nil {
						schedIDs = append(schedIDs, sid)
					}
				}
				sRows.Close()

				for _, sid := range schedIDs {
					var assignID int64
					var currentShift string
					err := tx.QueryRowContext(ctx, "SELECT id, shift_code FROM schedule_assignments WHERE schedule_id = ? AND nurse_id = ? AND date = ?", sid, req.NurseID, dateStr).Scan(&assignID, &currentShift)
					if err == nil && assignID > 0 {
						// Unlock assignment
						_, _ = tx.ExecContext(ctx, "DELETE FROM assignment_locks WHERE assignment_id = ?", assignID)
						// If shift was 'L', reset to 'X' (Off)
						if currentShift == "L" {
							_, _ = tx.ExecContext(ctx, "UPDATE schedule_assignments SET shift_code = 'X', version = version + 1 WHERE id = ?", assignID)
						}
						// Audit
						_, _ = tx.ExecContext(ctx, "INSERT INTO schedule_audit (schedule_id, ward_id, actor, action, reason, created_at) VALUES (?, ?, ?, 'leave_cancelled_unlock', ?, CURRENT_TIMESTAMP)", sid, req.WardID, approver, fmt.Sprintf("ยกเลิกการอนุมัติวันลา %s (%s)", req.NurseID, dateStr))
					}
				}
			}
			cur = cur.AddDate(0, 0, 1)
		}
	}

	return tx.Commit()
}
