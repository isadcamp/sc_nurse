package domain

import "time"

type UserRole string

const (
	RoleAdmin  UserRole = "admin"
	RoleHead   UserRole = "head"
	RoleNurse  UserRole = "nurse"
	RoleViewer UserRole = "viewer"
)

type User struct {
	ID           int        `json:"id"`
	Username     string     `json:"username"`
	Email        string     `json:"email"`
	PasswordHash string     `json:"-"`
	DisplayName  string     `json:"displayName"`
	Role         UserRole   `json:"role"`
	IsActive     bool       `json:"isActive"`
	Wards        []string   `json:"wards"`
	LastLoginAt  *time.Time `json:"lastLoginAt,omitempty"`
	CreatedAt    time.Time  `json:"createdAt"`
	UpdatedAt    time.Time  `json:"updatedAt"`
	CreatedBy    string     `json:"createdBy,omitempty"`
	UpdatedBy    string     `json:"updatedBy,omitempty"`
}

type UserWard struct {
	UserID    int       `json:"userId"`
	WardID    string    `json:"wardId"`
	CreatedAt time.Time `json:"createdAt"`
}

type UserToken struct {
	Token     string    `json:"token"`
	UserID    int       `json:"userId"`
	ExpiresAt time.Time `json:"expiresAt"`
	CreatedAt time.Time `json:"createdAt"`
}
