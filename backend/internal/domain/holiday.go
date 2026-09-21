package domain

import "time"

type Holiday struct {
	ID        int64     `json:"id"`
	Date      time.Time `json:"date"`
	Name      string    `json:"name"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

type HolidayCalendar struct {
	Year      int       `json:"year"`
	Holidays  []Holiday `json:"holidays"`
	Draft     bool      `json:"draft"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}
