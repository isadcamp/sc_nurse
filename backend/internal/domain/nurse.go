package domain

import (
	"fmt"
	"time"
)

type NurseID string

type Position string

const (
	PositionRN Position = "RN"
	PositionPN Position = "PN"
)

// Nurse represents a staff member.
type Nurse struct {
	ID                NurseID
	WardID            WardID
	Name              string
	Position          Position
	IsChargeEligible  bool // can be a shift leader
	CanDoubleShift    bool // can work double shift
	IsPartTime        bool // works part-time / relief
	IsActive          bool
	Skills            []string
	AllowedShiftCodes []string // shift codes the nurse can work
	Version           int
	CreatedAt         time.Time
	UpdatedAt         time.Time
	CreatedBy         string
	UpdatedBy         string
}

// NewNurse creates a Nurse with validation.
func NewNurse(wardID WardID, name string, pos Position, isCharge, canDouble bool, skills []string, allowed []string) (Nurse, error) {
	if wardID == "" {
		return Nurse{}, fmt.Errorf("validation error: wardID required")
	}
	if name == "" {
		return Nurse{}, fmt.Errorf("validation error: name required")
	}
	if pos != PositionRN && pos != PositionPN {
		return Nurse{}, fmt.Errorf("validation error: invalid position %s", pos)
	}
	// Basic validation for allowed shift codes – ensure not empty.
	if len(allowed) == 0 {
		return Nurse{}, fmt.Errorf("validation error: at least one shift code required")
	}
	return Nurse{
		ID:                NurseID(generateUUID()),
		WardID:            wardID,
		Name:              name,
		Position:          pos,
		IsChargeEligible:  isCharge,
		CanDoubleShift:    canDouble,
		IsActive:          true,
		Skills:            skills,
		AllowedShiftCodes: allowed,
		Version:           1,
	}, nil
}
