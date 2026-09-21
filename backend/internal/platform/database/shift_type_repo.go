package database

import (
	"context"
	"database/sql"
	"fmt"
	"nurse-scheduler/backend/internal/domain"
)

type ShiftTypeRepository struct {
	db *sql.DB
}

func NewShiftTypeRepository(db *sql.DB) *ShiftTypeRepository {
	return &ShiftTypeRepository{db: db}
}

func (r *ShiftTypeRepository) FindByWard(ctx context.Context, wardID domain.WardID) ([]domain.ShiftType, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT id, ward_id, code, name, is_double, is_off, total_hours, is_enabled, version, created_at, updated_at, created_by, updated_by FROM shift_types WHERE ward_id = ?`, string(wardID))
	if err != nil {
		return nil, fmt.Errorf("query shift types: %w", err)
	}
	defer rows.Close()
	var result []domain.ShiftType
	for rows.Next() {
		var st domain.ShiftType
		// Simplify: ignore periods parsing for now (store JSON placeholder)
		if err := rows.Scan(&st.ID, &st.WardID, &st.Code, &st.Name, &st.IsDouble, &st.IsOff, &st.TotalHours, &st.IsEnabled, &st.Version, &st.CreatedAt, &st.UpdatedAt, &st.CreatedBy, &st.UpdatedBy); err != nil {
			return nil, fmt.Errorf("scan shift type: %w", err)
		}
		result = append(result, st)
	}
	return result, rows.Err()
}

func (r *ShiftTypeRepository) FindEnabled(ctx context.Context, wardID domain.WardID) ([]domain.ShiftType, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT id, ward_id, code, name, is_double, is_off, total_hours, is_enabled, version, created_at, updated_at, created_by, updated_by FROM shift_types WHERE ward_id = ? AND is_enabled = 1`, string(wardID))
	if err != nil {
		return nil, fmt.Errorf("query enabled shift types: %w", err)
	}
	defer rows.Close()
	var result []domain.ShiftType
	for rows.Next() {
		var st domain.ShiftType
		if err := rows.Scan(&st.ID, &st.WardID, &st.Code, &st.Name, &st.IsDouble, &st.IsOff, &st.TotalHours, &st.IsEnabled, &st.Version, &st.CreatedAt, &st.UpdatedAt, &st.CreatedBy, &st.UpdatedBy); err != nil {
			return nil, fmt.Errorf("scan shift type: %w", err)
		}
		result = append(result, st)
	}
	return result, rows.Err()
}

func (r *ShiftTypeRepository) Save(ctx context.Context, st domain.ShiftType) error {
	// Periods are stored as JSON string placeholder
	periodsJSON := "[]"
	query := `INSERT INTO shift_types (id, ward_id, code, name, is_double, is_off, total_hours, is_enabled, periods, version, created_at, updated_at, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
	_, err := r.db.ExecContext(ctx, query, string(st.ID), string(st.WardID), st.Code, st.Name, st.IsDouble, st.IsOff, st.TotalHours, st.IsEnabled, periodsJSON, st.Version, st.CreatedAt, st.UpdatedAt, st.CreatedBy, st.UpdatedBy)
	if err != nil {
		return fmt.Errorf("insert shift type: %w", err)
	}
	return nil
}

func (r *ShiftTypeRepository) Update(ctx context.Context, st domain.ShiftType) error {
	periodsJSON := "[]"
	query := `UPDATE shift_types SET name = ?, is_double = ?, is_off = ?, total_hours = ?, is_enabled = ?, periods = ?, version = version + 1, updated_at = ?, updated_by = ? WHERE id = ? AND version = ?`
	res, err := r.db.ExecContext(ctx, query, st.Name, st.IsDouble, st.IsOff, st.TotalHours, st.IsEnabled, periodsJSON, st.UpdatedAt, st.UpdatedBy, string(st.ID), st.Version)
	if err != nil {
		return fmt.Errorf("update shift type: %w", err)
	}
	cnt, _ := res.RowsAffected()
	if cnt == 0 {
		return fmt.Errorf("shift type update conflict or not found")
	}
	return nil
}

func (r *ShiftTypeRepository) Delete(ctx context.Context, id domain.ShiftTypeID) error {
	_, err := r.db.ExecContext(ctx, `DELETE FROM shift_types WHERE id = ?`, string(id))
	if err != nil {
		return fmt.Errorf("delete shift type: %w", err)
	}
	return nil
}
