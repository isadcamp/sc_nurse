package database

import (
	"context"
	"database/sql"
	"fmt"
	"nurse-scheduler/backend/internal/domain"
)

type WardRepository struct {
	db *sql.DB
}

func NewWardRepository(db *sql.DB) *WardRepository {
	return &WardRepository{db: db}
}

func (r *WardRepository) FindByID(ctx context.Context, id domain.WardID) (domain.Ward, error) {
	var w domain.Ward
	query := `SELECT id, name, COALESCE(description, ''), timezone, COALESCE(is_active, 1), version, created_at, updated_at, COALESCE(created_by, ''), COALESCE(updated_by, '') FROM wards WHERE id = ?`
	row := r.db.QueryRowContext(ctx, query, string(id))
	err := row.Scan(&w.ID, &w.Name, &w.Description, &w.Timezone, &w.IsActive, &w.Version, &w.CreatedAt, &w.UpdatedAt, &w.CreatedBy, &w.UpdatedBy)
	if err != nil {
		if err == sql.ErrNoRows {
			return domain.Ward{}, fmt.Errorf("ward not found: %w", err)
		}
		return domain.Ward{}, fmt.Errorf("query ward: %w", err)
	}
	return w, nil
}

func (r *WardRepository) FindAll(ctx context.Context) ([]domain.Ward, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT id, name, COALESCE(description, ''), timezone, COALESCE(is_active, 1), version, created_at, updated_at, COALESCE(created_by, ''), COALESCE(updated_by, '') FROM wards ORDER BY id`)
	if err != nil {
		return nil, fmt.Errorf("query wards: %w", err)
	}
	defer rows.Close()
	var wards []domain.Ward
	for rows.Next() {
		var w domain.Ward
		if err := rows.Scan(&w.ID, &w.Name, &w.Description, &w.Timezone, &w.IsActive, &w.Version, &w.CreatedAt, &w.UpdatedAt, &w.CreatedBy, &w.UpdatedBy); err != nil {
			return nil, fmt.Errorf("scan ward: %w", err)
		}
		wards = append(wards, w)
	}
	return wards, rows.Err()
}

func (r *WardRepository) Save(ctx context.Context, ward domain.Ward) error {
	query := `INSERT INTO wards (id, name, description, timezone, is_active, version, created_by) VALUES (?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE name=VALUES(name), description=VALUES(description), timezone=VALUES(timezone), is_active=VALUES(is_active)`
	_, err := r.db.ExecContext(ctx, query, string(ward.ID), ward.Name, ward.Description, ward.Timezone, ward.IsActive, ward.Version, ward.CreatedBy)
	if err != nil {
		return fmt.Errorf("insert ward: %w", err)
	}
	_ = r.InitWardDefaults(ctx, ward.ID, ward.CreatedBy)
	return nil
}

func (r *WardRepository) InitWardDefaults(ctx context.Context, wardID domain.WardID, actor string) error {
	w := string(wardID)
	// Seed standard shift types
	shifts := []struct {
		code, name, periods string
		hours               float64
		isDouble, isOff     bool
	}{
		{"ช", "เช้า (08:00-16:00)", `[{"start":480,"end":960}]`, 8, false, false},
		{"บ", "บ่าย (16:00-24:00)", `[{"start":960,"end":1440}]`, 8, false, false},
		{"ด", "ดึก (00:00-08:00)", `[{"start":0,"end":480}]`, 8, false, false},
		{"ชบ", "เช้าบ่าย (08:00-24:00)", `[{"start":480,"end":960},{"start":960,"end":1440}]`, 16, true, false},
		{"ชด", "เช้าดึก (08:00-16:00, 00:00-08:00)", `[{"start":480,"end":960},{"start":0,"end":480}]`, 16, true, false},
		{"บด", "บ่ายดึก (16:00-08:00)", `[{"start":960,"end":1440},{"start":0,"end":480}]`, 16, true, false},
		{"Day", "กลางวัน (08:00-20:00)", `[{"start":480,"end":1200}]`, 12, false, false},
		{"Night", "กลางคืน (20:00-08:00)", `[{"start":1200,"end":1920}]`, 12, false, false},
		{"X", "OFF (วันหยุด)", `[]`, 0, false, true},
		{"L", "ลา (Leave)", `[]`, 0, false, true},
		{"V", "ลาพักร้อน (Vacation)", `[]`, 8, false, true},
	}
	for i, s := range shifts {
		id := fmt.Sprintf("%s-st-%d", w, i+1)
		_, _ = r.db.ExecContext(ctx, `INSERT INTO shift_types(id, ward_id, code, name, is_double, is_off, total_hours, is_enabled, version, periods, created_by)
			VALUES(?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?)
			ON DUPLICATE KEY UPDATE name=VALUES(name), periods=VALUES(periods)`,
			id, w, s.code, s.name, s.isDouble, s.isOff, s.hours, s.periods, actor)
	}

	// Seed default confirmed policy
	defaultPolicy := `{"status":"confirmed","version":"v1.0","minRestHours":8,"maxConsecutiveDays":6,"maxConsecutiveNights":3,"maxMonthlyHours":240,"maxContinuousHours":16,"maxDoubleShifts":8,"nightStart":1320,"nightEnd":1800,"fairnessHours":48,"weights":{"coverage":100,"fairness":50,"preference":20,"stability":10},"targets":[],"preferences":[],"staffing":[{"date":"","start":480,"end":960,"rn":1,"pn":1,"leaders":1,"skills":{}},{"date":"","start":960,"end":1440,"rn":1,"pn":1,"leaders":1,"skills":{}},{"date":"","start":0,"end":480,"rn":1,"pn":0,"leaders":1,"skills":{}}]}`
	_, _ = r.db.ExecContext(ctx, `INSERT INTO roster_policies(ward_id, policy) VALUES(?, ?) ON DUPLICATE KEY UPDATE policy=VALUES(policy)`, w, defaultPolicy)
	return nil
}

func (r *WardRepository) Update(ctx context.Context, ward domain.Ward) error {
	query := `UPDATE wards SET name = ?, description = ?, timezone = ?, is_active = ?, version = version + 1, updated_by = ? WHERE id = ?`
	res, err := r.db.ExecContext(ctx, query, ward.Name, ward.Description, ward.Timezone, ward.IsActive, ward.UpdatedBy, string(ward.ID))
	if err != nil {
		return fmt.Errorf("update ward: %w", err)
	}
	cnt, _ := res.RowsAffected()
	if cnt == 0 {
		return fmt.Errorf("ward not found")
	}
	return nil
}

func (r *WardRepository) SetStatus(ctx context.Context, id domain.WardID, isActive bool, updatedBy string) error {
	_, err := r.db.ExecContext(ctx, `UPDATE wards SET is_active = ?, updated_by = ? WHERE id = ?`, isActive, updatedBy, string(id))
	return err
}

func (r *WardRepository) Delete(ctx context.Context, id domain.WardID) error {
	_, err := r.db.ExecContext(ctx, `DELETE FROM wards WHERE id = ?`, string(id))
	if err != nil {
		return fmt.Errorf("delete ward: %w", err)
	}
	return nil
}
