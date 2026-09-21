package service

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"nurse-scheduler/backend/internal/domain"
	"nurse-scheduler/backend/internal/platform/database"
	"strings"
	"time"
)

type UserService struct {
	repo *database.UserRepository
}

func NewUserService(r *database.UserRepository) *UserService {
	return &UserService{repo: r}
}

func (s *UserService) EnsureDefaultAdmin(ctx context.Context) error {
	return s.repo.EnsureDefaultAdmin(ctx)
}

func (s *UserService) Login(ctx context.Context, username, password string) (string, *domain.User, error) {
	username = strings.TrimSpace(username)
	password = strings.TrimSpace(password)
	if username == "" || password == "" {
		return "", nil, errors.New("กรุณากรอกชื่อผู้ใช้และรหัสผ่าน")
	}

	user, err := s.repo.Authenticate(ctx, username, password)
	if err != nil {
		return "", nil, err
	}

	// Generate secure token (64 hex characters)
	tokenBytes := make([]byte, 32)
	if _, err := rand.Read(tokenBytes); err != nil {
		return "", nil, errors.New("สร้างโทเคนไม่สำเร็จ")
	}
	token := hex.EncodeToString(tokenBytes)
	expiresAt := time.Now().UTC().Add(7 * 24 * time.Hour) // 7 days

	if err := s.repo.CreateUserToken(ctx, token, user.ID, expiresAt); err != nil {
		return "", nil, fmt.Errorf("บันทึกโทเคนไม่สำเร็จ: %w", err)
	}

	return token, user, nil
}

func (s *UserService) Logout(ctx context.Context, token string) error {
	return s.repo.RevokeToken(ctx, token)
}

func (s *UserService) ValidateToken(ctx context.Context, token string) (*domain.User, error) {
	return s.repo.GetUserByToken(ctx, token)
}

func (s *UserService) CreateUser(ctx context.Context, u domain.User, password string) (int, error) {
	u.Username = strings.TrimSpace(u.Username)
	u.DisplayName = strings.TrimSpace(u.DisplayName)
	password = strings.TrimSpace(password)

	if u.Username == "" {
		return 0, errors.New("กรุณากรอกชื่อผู้ใช้")
	}
	if len(password) < 4 {
		return 0, errors.New("รหัสผ่านต้องมีความยาวอย่างน้อย 4 ตัวอักษร")
	}
	if u.DisplayName == "" {
		u.DisplayName = u.Username
	}
	if u.Role == "" {
		u.Role = domain.RoleViewer
	}

	// Check if username already exists
	existing, _ := s.repo.GetUserByUsername(ctx, u.Username)
	if existing != nil {
		return 0, errors.New("ชื่อผู้ใช้นี้มีอยู่ในระบบแล้ว")
	}

	return s.repo.CreateUser(ctx, u, password)
}

func (s *UserService) ListUsers(ctx context.Context) ([]domain.User, error) {
	return s.repo.ListUsers(ctx)
}

func (s *UserService) GetUser(ctx context.Context, id int) (*domain.User, error) {
	return s.repo.GetUserByID(ctx, id)
}

func (s *UserService) UpdateUser(ctx context.Context, u domain.User) error {
	u.DisplayName = strings.TrimSpace(u.DisplayName)
	if u.DisplayName == "" {
		return errors.New("ชื่อที่แสดงต้องไม่ว่างเปล่า")
	}
	return s.repo.UpdateUser(ctx, u)
}

func (s *UserService) UpdatePassword(ctx context.Context, userID int, newPassword, updatedBy string) error {
	newPassword = strings.TrimSpace(newPassword)
	if len(newPassword) < 4 {
		return errors.New("รหัสผ่านต้องมีความยาวอย่างน้อย 4 ตัวอักษร")
	}
	return s.repo.UpdatePassword(ctx, userID, newPassword, updatedBy)
}

func (s *UserService) SetUserStatus(ctx context.Context, userID int, isActive bool, updatedBy string) error {
	return s.repo.SetUserStatus(ctx, userID, isActive, updatedBy)
}

func (s *UserService) DeleteUser(ctx context.Context, userID int) error {
	return s.repo.DeleteUser(ctx, userID)
}
