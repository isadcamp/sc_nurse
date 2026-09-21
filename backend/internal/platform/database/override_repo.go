package database

import (
	"context"
	"database/sql"
	"nurse-scheduler/backend/internal/domain"
	"time"
)

func (s *RosterStore) ListPayrollOverrides(ctx context.Context, scheduleID int64) ([]domain.PayrollOverride, error) {
	rows, err := s.DB.QueryContext(ctx, "SELECT id, schedule_id, nurse_id, field_name, original_value, override_value, reason, approved_by, created_at FROM payroll_overrides WHERE schedule_id=? ORDER BY created_at ASC", scheduleID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []domain.PayrollOverride
	for rows.Next() {
		var o domain.PayrollOverride
		var t time.Time
		if err := rows.Scan(&o.ID, &o.ScheduleID, &o.NurseID, &o.FieldName, &o.OriginalValue, &o.OverrideValue, &o.Reason, &o.ApprovedBy, &t); err != nil {
			return nil, err
		}
		o.CreatedAt = t
		list = append(list, o)
	}
	return list, rows.Err()
}

func (s *RosterStore) SavePayrollOverride(ctx context.Context, o domain.PayrollOverride, a domain.Audit) (domain.PayrollOverride, error) {
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return domain.PayrollOverride{}, err
	}
	defer tx.Rollback()

	var wardID string
	if err := tx.QueryRowContext(ctx, "SELECT ward_id FROM schedules WHERE id=?", o.ScheduleID).Scan(&wardID); err != nil {
		return domain.PayrollOverride{}, dbError(err)
	}

	res, err := tx.ExecContext(ctx, "INSERT INTO payroll_overrides(schedule_id, nurse_id, field_name, original_value, override_value, reason, approved_by) VALUES(?, ?, ?, ?, ?, ?, ?)",
		o.ScheduleID, o.NurseID, o.FieldName, o.OriginalValue, o.OverrideValue, o.Reason, o.ApprovedBy)
	if err != nil {
		return domain.PayrollOverride{}, err
	}

	id, err := res.LastInsertId()
	if err != nil {
		return domain.PayrollOverride{}, err
	}
	o.ID = id
	o.CreatedAt = time.Now().UTC()

	if err := audit(ctx, tx, o.ScheduleID, wardID, a); err != nil {
		return domain.PayrollOverride{}, err
	}

	return o, tx.Commit()
}

func (s *RosterStore) DeletePayrollOverride(ctx context.Context, overrideID int64, a domain.Audit) error {
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	var scheduleID int64
	var wardID string
	if err := tx.QueryRowContext(ctx, "SELECT o.schedule_id, s.ward_id FROM payroll_overrides o JOIN schedules s ON s.id=o.schedule_id WHERE o.id=?", overrideID).Scan(&scheduleID, &wardID); err != nil {
		return dbError(err)
	}

	if _, err := tx.ExecContext(ctx, "DELETE FROM payroll_overrides WHERE id=?", overrideID); err != nil {
		return err
	}

	if err := audit(ctx, tx, scheduleID, wardID, a); err != nil {
		return err
	}

	return tx.Commit()
}

func (s *RosterStore) ListCompensationRates(ctx context.Context) ([]domain.CompensationRate, error) {
	rows, err := s.DB.QueryContext(ctx, "SELECT id, position, eve_night_rate, ot_rate, DATE_FORMAT(effective_from, '%Y-%m-%d'), DATE_FORMAT(effective_to, '%Y-%m-%d'), created_at, updated_at FROM compensation_rates ORDER BY position ASC, effective_from DESC")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []domain.CompensationRate
	for rows.Next() {
		var r domain.CompensationRate
		var effTo sql.NullString
		if err := rows.Scan(&r.ID, &r.Position, &r.EveNightRate, &r.OTRate, &r.EffectiveFrom, &effTo, &r.CreatedAt, &r.UpdatedAt); err != nil {
			return nil, err
		}
		if effTo.Valid {
			r.EffectiveTo = &effTo.String
		}
		list = append(list, r)
	}
	return list, rows.Err()
}

func (s *RosterStore) SaveCompensationRate(ctx context.Context, r domain.CompensationRate) (domain.CompensationRate, error) {
	res, err := s.DB.ExecContext(ctx, "INSERT INTO compensation_rates(position, eve_night_rate, ot_rate, effective_from, effective_to) VALUES(?, ?, ?, ?, ?)",
		r.Position, r.EveNightRate, r.OTRate, r.EffectiveFrom, r.EffectiveTo)
	if err != nil {
		return domain.CompensationRate{}, err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return domain.CompensationRate{}, err
	}
	r.ID = id
	return r, nil
}
