package domain

import "time"

type Schedule struct {
	ID        int64     `json:"id"`
	WardID    string    `json:"ward_id"`
	Month     int       `json:"month"`
	Year      int       `json:"year"`
	Status    string    `json:"status"` // "draft" or "final"
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}
