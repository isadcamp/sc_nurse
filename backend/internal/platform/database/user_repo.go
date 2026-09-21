package database

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"nurse-scheduler/backend/internal/domain"
	"time"

	"golang.org/x/crypto/bcrypt"
)

type UserRepository struct {
	db *sql.DB
}

func NewUserRepository(db *sql.DB) *UserRepository {
	return &UserRepository{db: db}
}

func (r *UserRepository) EnsureDefaultAdmin(ctx context.Context) error {
	var count int
	err := r.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM users WHERE role = 'admin'").Scan(&count)
	if err != nil {
		return err
	}
	if count == 0 {
		hash, err := bcrypt.GenerateFromPassword([]byte("admin1234"), bcrypt.DefaultCost)
		if err != nil {
			return err
		}
		_, err = r.db.ExecContext(ctx, `INSERT INTO users (username, email, password_hash, display_name, role, is_active, created_by)
			VALUES (?, ?, ?, ?, 'admin', 1, 'system')
			ON DUPLICATE KEY UPDATE id=id`,
			"admin", "admin@hospital.local", string(hash), "ผู้ดูแลระบบ (Super Admin)")
		if err != nil {
			return err
		}
	}
	return nil
}

func (r *UserRepository) Authenticate(ctx context.Context, username, password string) (*domain.User, error) {
	query := `SELECT id, username, COALESCE(email, ''), password_hash, display_name, role, is_active, last_login_at, created_at, updated_at
		FROM users WHERE username = ?`
	row := r.db.QueryRowContext(ctx, query, username)

	var u domain.User
	var roleStr string
	var lastLogin sql.NullTime
	err := row.Scan(&u.ID, &u.Username, &u.Email, &u.PasswordHash, &u.DisplayName, &roleStr, &u.IsActive, &lastLogin, &u.CreatedAt, &u.UpdatedAt)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, errors.New("ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง")
		}
		return nil, fmt.Errorf("query user: %w", err)
	}

	if !u.IsActive {
		return nil, errors.New("บัญชีนี้ถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบ")
	}

	if err := bcrypt.CompareHashAndPassword([]byte(u.PasswordHash), []byte(password)); err != nil {
		return nil, errors.New("ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง")
	}

	if lastLogin.Valid {
		u.LastLoginAt = &lastLogin.Time
	}
	u.Role = domain.UserRole(roleStr)

	// Update last login time
	now := time.Now().UTC()
	_, _ = r.db.ExecContext(ctx, `UPDATE users SET last_login_at = ? WHERE id = ?`, now, u.ID)
	u.LastLoginAt = &now

	// Fetch assigned wards
	wards, err := r.GetUserWards(ctx, u.ID)
	if err == nil {
		u.Wards = wards
	}

	return &u, nil
}

func (r *UserRepository) CreateUser(ctx context.Context, u domain.User, password string) (int, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return 0, fmt.Errorf("hash password: %w", err)
	}

	query := `INSERT INTO users (username, email, password_hash, display_name, role, is_active, created_by)
		VALUES (?, ?, ?, ?, ?, ?, ?)`
	res, err := r.db.ExecContext(ctx, query, u.Username, u.Email, string(hash), u.DisplayName, string(u.Role), u.IsActive, u.CreatedBy)
	if err != nil {
		return 0, fmt.Errorf("insert user: %w", err)
	}

	id, err := res.LastInsertId()
	if err != nil {
		return 0, err
	}

	if len(u.Wards) > 0 {
		_ = r.SetUserWards(ctx, int(id), u.Wards)
	}

	return int(id), nil
}

func (r *UserRepository) GetUserByID(ctx context.Context, id int) (*domain.User, error) {
	query := `SELECT id, username, COALESCE(email, ''), display_name, role, is_active, last_login_at, created_at, updated_at, COALESCE(created_by, ''), COALESCE(updated_by, '')
		FROM users WHERE id = ?`
	row := r.db.QueryRowContext(ctx, query, id)

	var u domain.User
	var roleStr string
	var lastLogin sql.NullTime
	err := row.Scan(&u.ID, &u.Username, &u.Email, &u.DisplayName, &roleStr, &u.IsActive, &lastLogin, &u.CreatedAt, &u.UpdatedAt, &u.CreatedBy, &u.UpdatedBy)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, errors.New("ไม่พบข้อมูลผู้ใช้")
		}
		return nil, fmt.Errorf("query user: %w", err)
	}

	if lastLogin.Valid {
		u.LastLoginAt = &lastLogin.Time
	}
	u.Role = domain.UserRole(roleStr)

	wards, err := r.GetUserWards(ctx, u.ID)
	if err == nil {
		u.Wards = wards
	}

	return &u, nil
}

func (r *UserRepository) GetUserByUsername(ctx context.Context, username string) (*domain.User, error) {
	query := `SELECT id, username, COALESCE(email, ''), display_name, role, is_active, last_login_at, created_at, updated_at, COALESCE(created_by, ''), COALESCE(updated_by, '')
		FROM users WHERE username = ?`
	row := r.db.QueryRowContext(ctx, query, username)

	var u domain.User
	var roleStr string
	var lastLogin sql.NullTime
	err := row.Scan(&u.ID, &u.Username, &u.Email, &u.DisplayName, &roleStr, &u.IsActive, &lastLogin, &u.CreatedAt, &u.UpdatedAt, &u.CreatedBy, &u.UpdatedBy)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, errors.New("ไม่พบข้อมูลผู้ใช้")
		}
		return nil, fmt.Errorf("query user: %w", err)
	}

	if lastLogin.Valid {
		u.LastLoginAt = &lastLogin.Time
	}
	u.Role = domain.UserRole(roleStr)

	wards, err := r.GetUserWards(ctx, u.ID)
	if err == nil {
		u.Wards = wards
	}

	return &u, nil
}

func (r *UserRepository) ListUsers(ctx context.Context) ([]domain.User, error) {
	query := `SELECT id, username, COALESCE(email, ''), display_name, role, is_active, last_login_at, created_at, updated_at, COALESCE(created_by, ''), COALESCE(updated_by, '')
		FROM users ORDER BY id ASC`
	rows, err := r.db.QueryContext(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("query users: %w", err)
	}
	defer rows.Close()

	var users []domain.User
	for rows.Next() {
		var u domain.User
		var roleStr string
		var lastLogin sql.NullTime
		if err := rows.Scan(&u.ID, &u.Username, &u.Email, &u.DisplayName, &roleStr, &u.IsActive, &lastLogin, &u.CreatedAt, &u.UpdatedAt, &u.CreatedBy, &u.UpdatedBy); err != nil {
			return nil, fmt.Errorf("scan user: %w", err)
		}
		if lastLogin.Valid {
			u.LastLoginAt = &lastLogin.Time
		}
		u.Role = domain.UserRole(roleStr)
		users = append(users, u)
	}

	// Fetch wards for each user
	for i := range users {
		wards, _ := r.GetUserWards(ctx, users[i].ID)
		users[i].Wards = wards
	}

	return users, rows.Err()
}

func (r *UserRepository) UpdateUser(ctx context.Context, u domain.User) error {
	query := `UPDATE users SET display_name = ?, email = ?, role = ?, is_active = ?, updated_by = ? WHERE id = ?`
	_, err := r.db.ExecContext(ctx, query, u.DisplayName, u.Email, string(u.Role), u.IsActive, u.UpdatedBy, u.ID)
	if err != nil {
		return fmt.Errorf("update user: %w", err)
	}

	_ = r.SetUserWards(ctx, u.ID, u.Wards)
	return nil
}

func (r *UserRepository) UpdatePassword(ctx context.Context, userID int, newPassword, updatedBy string) error {
	hash, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("hash password: %w", err)
	}
	_, err = r.db.ExecContext(ctx, `UPDATE users SET password_hash = ?, updated_by = ? WHERE id = ?`, string(hash), updatedBy, userID)
	if err != nil {
		return fmt.Errorf("update password: %w", err)
	}
	return nil
}

func (r *UserRepository) SetUserStatus(ctx context.Context, userID int, isActive bool, updatedBy string) error {
	_, err := r.db.ExecContext(ctx, `UPDATE users SET is_active = ?, updated_by = ? WHERE id = ?`, isActive, updatedBy, userID)
	return err
}

func (r *UserRepository) DeleteUser(ctx context.Context, userID int) error {
	_, err := r.db.ExecContext(ctx, `DELETE FROM users WHERE id = ?`, userID)
	return err
}

func (r *UserRepository) GetUserWards(ctx context.Context, userID int) ([]string, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT ward_id FROM user_wards WHERE user_id = ? ORDER BY ward_id ASC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var wards []string
	for rows.Next() {
		var w string
		if err := rows.Scan(&w); err != nil {
			return nil, err
		}
		wards = append(wards, w)
	}
	if wards == nil {
		wards = []string{}
	}
	return wards, rows.Err()
}

func (r *UserRepository) SetUserWards(ctx context.Context, userID int, wards []string) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if _, err := tx.ExecContext(ctx, `DELETE FROM user_wards WHERE user_id = ?`, userID); err != nil {
		return err
	}

	for _, w := range wards {
		if w == "" {
			continue
		}
		if _, err := tx.ExecContext(ctx, `INSERT INTO user_wards (user_id, ward_id) VALUES (?, ?)`, userID, w); err != nil {
			return err
		}
	}

	return tx.Commit()
}

func (r *UserRepository) CreateUserToken(ctx context.Context, token string, userID int, expiresAt time.Time) error {
	_, err := r.db.ExecContext(ctx, `INSERT INTO user_tokens (token, user_id, expires_at) VALUES (?, ?, ?)`, token, userID, expiresAt)
	return err
}

func (r *UserRepository) GetUserByToken(ctx context.Context, token string) (*domain.User, error) {
	query := `SELECT u.id, u.username, COALESCE(u.email, ''), u.display_name, u.role, u.is_active, u.last_login_at, u.created_at, u.updated_at
		FROM users u
		INNER JOIN user_tokens t ON u.id = t.user_id
		WHERE t.token = ? AND t.expires_at > UTC_TIMESTAMP() AND u.is_active = 1`
	row := r.db.QueryRowContext(ctx, query, token)

	var u domain.User
	var roleStr string
	var lastLogin sql.NullTime
	err := row.Scan(&u.ID, &u.Username, &u.Email, &u.DisplayName, &roleStr, &u.IsActive, &lastLogin, &u.CreatedAt, &u.UpdatedAt)
	if err != nil {
		return nil, err
	}
	if lastLogin.Valid {
		u.LastLoginAt = &lastLogin.Time
	}
	u.Role = domain.UserRole(roleStr)

	wards, err := r.GetUserWards(ctx, u.ID)
	if err == nil {
		u.Wards = wards
	}
	return &u, nil
}

func (r *UserRepository) RevokeToken(ctx context.Context, token string) error {
	_, err := r.db.ExecContext(ctx, `DELETE FROM user_tokens WHERE token = ?`, token)
	return err
}
