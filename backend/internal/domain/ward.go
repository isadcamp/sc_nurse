package domain

import (
	"fmt"
	"time"
)

type WardID string

// Ward represents a hospital ward or department.
type Ward struct {
	ID          WardID
	Name        string
	Description string
	Timezone    string // IANA timezone, e.g., "Asia/Bangkok"
	IsActive    bool
	Version     int
	CreatedAt   time.Time
	UpdatedAt   time.Time
	CreatedBy   string
	UpdatedBy   string
}

// NewWard creates a new Ward after validating inputs.
func NewWard(name, timezone string) (Ward, error) {
	if name == "" {
		return Ward{}, fmt.Errorf("validation error: name cannot be empty")
	}
	if timezone == "" {
		timezone = "Asia/Bangkok"
	}
	// Simple validation: ensure timezone can be loaded.
	if _, err := time.LoadLocation(timezone); err != nil {
		return Ward{}, fmt.Errorf("validation error: invalid timezone %s", timezone)
	}
	return Ward{ID: WardID(generateUUID()), Name: name, Timezone: timezone, Version: 1}, nil
}

// generateUUID is a helper that creates a UUID string.
func generateUUID() string {
	// Placeholder – actual implementation will use a UUID library.
	return fmt.Sprintf("%d", time.Now().UnixNano())
}
