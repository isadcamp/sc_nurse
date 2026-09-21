package database

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
	"nurse-scheduler/backend/internal/domain"
)

type NurseRepository struct {
	db *sql.DB
}

func sanitizeShiftCodes(shifts []string) []string {
	valid := []string{}
	seen := map[string]bool{}
	for _, s := range shifts {
		s = strings.TrimSpace(s)
		if s == "" || strings.Trim(s, "?") == "" || strings.Contains(s, "\ufffd") {
			continue
		}
		if !seen[s] {
			seen[s] = true
			valid = append(valid, s)
		}
	}
	if len(valid) == 0 {
		return []string{"ช", "บ", "ด", "ชบ", "บด", "อบ", "บห", "Day", "Night", "X", "L", "V"}
	}
	return valid
}

func NewNurseRepository(db *sql.DB) *NurseRepository {
	return &NurseRepository{db: db}
}

func (r *NurseRepository) FindByID(ctx context.Context, id domain.NurseID) (domain.Nurse, error) {
	var n domain.Nurse
	query := `SELECT id, ward_id, name, position, is_charge_eligible, can_double_shift, is_part_time, is_active, COALESCE(skills, '[]'), COALESCE(allowed_shift_codes, '[]'), version, created_at, updated_at, COALESCE(created_by, ''), COALESCE(updated_by, '') FROM nurses WHERE id = ?`
	row := r.db.QueryRowContext(ctx, query, string(id))
	var skillsBytes, allowedBytes []byte
	err := row.Scan(&n.ID, &n.WardID, &n.Name, &n.Position, &n.IsChargeEligible, &n.CanDoubleShift, &n.IsPartTime, &n.IsActive, &skillsBytes, &allowedBytes, &n.Version, &n.CreatedAt, &n.UpdatedAt, &n.CreatedBy, &n.UpdatedBy)
	if err != nil {
		if err == sql.ErrNoRows {
			return domain.Nurse{}, fmt.Errorf("nurse not found: %w", err)
		}
		return domain.Nurse{}, fmt.Errorf("query nurse: %w", err)
	}
	if len(skillsBytes) > 0 {
		_ = json.Unmarshal(skillsBytes, &n.Skills)
	}
	if n.Skills == nil {
		n.Skills = []string{}
	}
	if len(allowedBytes) > 0 {
		_ = json.Unmarshal(allowedBytes, &n.AllowedShiftCodes)
	}
	n.AllowedShiftCodes = sanitizeShiftCodes(n.AllowedShiftCodes)
	return n, nil
}

func (r *NurseRepository) FindByWard(ctx context.Context, wardID domain.WardID, activeOnly bool) ([]domain.Nurse, error) {
	base := `SELECT id, ward_id, name, position, is_charge_eligible, can_double_shift, is_part_time, is_active, COALESCE(skills, '[]'), COALESCE(allowed_shift_codes, '[]'), version, created_at, updated_at, COALESCE(created_by, ''), COALESCE(updated_by, '') FROM nurses WHERE ward_id = ?`
	var rows *sql.Rows
	var err error
	if activeOnly {
		rows, err = r.db.QueryContext(ctx, base+` AND is_active = 1 ORDER BY id`, string(wardID))
	} else {
		rows, err = r.db.QueryContext(ctx, base+` ORDER BY id`, string(wardID))
	}
	if err != nil {
		return nil, fmt.Errorf("query nurses by ward: %w", err)
	}
	defer rows.Close()
	var result []domain.Nurse
	for rows.Next() {
		var n domain.Nurse
		var skillsBytes, allowedBytes []byte
		if err := rows.Scan(&n.ID, &n.WardID, &n.Name, &n.Position, &n.IsChargeEligible, &n.CanDoubleShift, &n.IsPartTime, &n.IsActive, &skillsBytes, &allowedBytes, &n.Version, &n.CreatedAt, &n.UpdatedAt, &n.CreatedBy, &n.UpdatedBy); err != nil {
			return nil, fmt.Errorf("scan nurse: %w", err)
		}
		if len(skillsBytes) > 0 {
			_ = json.Unmarshal(skillsBytes, &n.Skills)
		}
		if n.Skills == nil {
			n.Skills = []string{}
		}
		if len(allowedBytes) > 0 {
			_ = json.Unmarshal(allowedBytes, &n.AllowedShiftCodes)
		}
		n.AllowedShiftCodes = sanitizeShiftCodes(n.AllowedShiftCodes)
		result = append(result, n)
	}
	return result, rows.Err()
}

func (r *NurseRepository) FindActiveNurses(ctx context.Context, wardID domain.WardID) ([]domain.Nurse, error) {
	return r.FindByWard(ctx, wardID, true)
}

func (r *NurseRepository) Save(ctx context.Context, nurse domain.Nurse) error {
	if nurse.Skills == nil {
		nurse.Skills = []string{}
	}
	nurse.AllowedShiftCodes = sanitizeShiftCodes(nurse.AllowedShiftCodes)
	skillsJSON, err := json.Marshal(nurse.Skills)
	if err != nil {
		return fmt.Errorf("marshal skills: %w", err)
	}
	allowedJSON, err := json.Marshal(nurse.AllowedShiftCodes)
	if err != nil {
		return fmt.Errorf("marshal allowed shift codes: %w", err)
	}
	if nurse.Version == 0 {
		nurse.Version = 1
	}
	query := `INSERT INTO nurses (id, ward_id, name, position, is_charge_eligible, can_double_shift, is_part_time, is_active, skills, allowed_shift_codes, version, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
	_, err = r.db.ExecContext(ctx, query, string(nurse.ID), string(nurse.WardID), nurse.Name, string(nurse.Position), nurse.IsChargeEligible, nurse.CanDoubleShift, nurse.IsPartTime, nurse.IsActive, skillsJSON, allowedJSON, nurse.Version, nurse.CreatedBy)
	if err != nil {
		return fmt.Errorf("insert nurse: %w", err)
	}
	return nil
}

func (r *NurseRepository) Update(ctx context.Context, nurse domain.Nurse) error {
	if nurse.Skills == nil {
		nurse.Skills = []string{}
	}
	nurse.AllowedShiftCodes = sanitizeShiftCodes(nurse.AllowedShiftCodes)
	skillsJSON, err := json.Marshal(nurse.Skills)
	if err != nil {
		return fmt.Errorf("marshal skills: %w", err)
	}
	allowedJSON, err := json.Marshal(nurse.AllowedShiftCodes)
	if err != nil {
		return fmt.Errorf("marshal allowed shift codes: %w", err)
	}
	query := `UPDATE nurses SET name = ?, position = ?, is_charge_eligible = ?, can_double_shift = ?, is_part_time = ?, is_active = ?, skills = ?, allowed_shift_codes = ?, version = version + 1, updated_by = ? WHERE id = ?`
	res, err := r.db.ExecContext(ctx, query, nurse.Name, string(nurse.Position), nurse.IsChargeEligible, nurse.CanDoubleShift, nurse.IsPartTime, nurse.IsActive, skillsJSON, allowedJSON, nurse.UpdatedBy, string(nurse.ID))
	if err != nil {
		return fmt.Errorf("update nurse: %w", err)
	}
	cnt, _ := res.RowsAffected()
	if cnt == 0 {
		return fmt.Errorf("nurse not found")
	}
	return nil
}

func (r *NurseRepository) Delete(ctx context.Context, id domain.NurseID) error {
	_, err := r.db.ExecContext(ctx, `DELETE FROM nurses WHERE id = ?`, string(id))
	if err != nil {
		return fmt.Errorf("delete nurse: %w", err)
	}
	return nil
}
