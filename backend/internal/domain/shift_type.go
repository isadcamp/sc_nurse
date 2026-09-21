package domain

import (
	"fmt"
	"time"
)

type ShiftTypeID string

type ShiftCode string

const (
	ShiftCodeMorning   ShiftCode = "ช"     // 08:00–16:00
	ShiftCodeAfternoon ShiftCode = "บ"     // 16:00–00:00 next day
	ShiftCodeNight     ShiftCode = "ด"     // 00:00–08:00
	ShiftCodeCombined  ShiftCode = "ชบ"    // 08:00–00:00 continuous
	ShiftCodeDouble    ShiftCode = "บด"    // two periods with 8h break
	ShiftCodeDay       ShiftCode = "Day"   // 08:00–20:00
	ShiftCodeLongNight ShiftCode = "Night" // 20:00–08:00 next day
	ShiftCodeOff       ShiftCode = "X"     // OFF
	ShiftCodeLeave     ShiftCode = "L"     // approved leave
	ShiftCodeVacation  ShiftCode = "V"     // vacation leave (8h)
)

var validShiftCodes = map[ShiftCode]bool{
	ShiftCodeMorning:   true,
	ShiftCodeAfternoon: true,
	ShiftCodeNight:     true,
	ShiftCodeCombined:  true,
	ShiftCodeDouble:    true,
	ShiftCodeDay:       true,
	ShiftCodeLongNight: true,
	ShiftCodeOff:       true,
	ShiftCodeLeave:     true,
	ShiftCodeVacation:  true,
	"Va":               true,
	"v":                true,
	"D":                true,
	"N":                true,
	"x":                true,
	"อ":                true,
}

func IsValidShiftCode(code string) bool {
	return validShiftCodes[ShiftCode(code)] || code == "V" || code == "v" || code == "Va" || code == "L" || code == "x" || code == "X" || code == "อ" || code == "D" || code == "N" || code == "ช" || code == "บ" || code == "ด" || code == "ชบ" || code == "บด" || code == "ชด" || code == "Day" || code == "Night"
}

// TimeRange represents a period within a day.
type TimeRange struct {
	Start time.Time // only time component is used
	End   time.Time // can be on next day (crosses midnight)
}

// NewTimeRange creates a TimeRange from strings "HH:MM".
func NewTimeRange(startStr, endStr string) (TimeRange, error) {
	layout := "15:04"
	start, err := time.Parse(layout, startStr)
	if err != nil {
		return TimeRange{}, fmt.Errorf("invalid start time %s", startStr)
	}
	end, err := time.Parse(layout, endStr)
	if err != nil {
		return TimeRange{}, fmt.Errorf("invalid end time %s", endStr)
	}
	return TimeRange{Start: start, End: end}, nil
}

// Duration returns the length of the range in hours.
func (tr TimeRange) Duration() time.Duration {
	// If End is before Start, it crosses midnight.
	if tr.End.Before(tr.Start) {
		return 24*time.Hour - tr.Start.Sub(tr.End)
	}
	return tr.End.Sub(tr.Start)
}

// Overlaps returns true if two ranges intersect.
func (tr TimeRange) Overlaps(other TimeRange) bool {
	// Normalize to minutes since midnight, handling crossing midnight.
	startA := tr.Start.Hour()*60 + tr.Start.Minute()
	endA := tr.End.Hour()*60 + tr.End.Minute()
	startB := other.Start.Hour()*60 + other.Start.Minute()
	endB := other.End.Hour()*60 + other.End.Minute()

	// Convert crossing midnight to two intervals.
	aIntervals := []struct{ s, e int }{{startA, endA}}
	if endA <= startA {
		aIntervals = []struct{ s, e int }{{startA, 24 * 60}, {0, endA}}
	}
	bIntervals := []struct{ s, e int }{{startB, endB}}
	if endB <= startB {
		bIntervals = []struct{ s, e int }{{startB, 24 * 60}, {0, endB}}
	}
	for _, a := range aIntervals {
		for _, b := range bIntervals {
			if a.s < b.e && b.s < a.e {
				return true
			}
		}
	}
	return false
}

// ShiftType represents a type of shift (e.g., ช, บ, ด, ชบ, บด, Day, Night, X, L).
type ShiftType struct {
	ID         ShiftTypeID
	WardID     WardID
	Code       ShiftCode
	Name       string
	IsDouble   bool // whether this shift can be double‑assigned (ชบ, บด)
	IsOff      bool // X or L
	TotalHours float64
	IsEnabled  bool
	Periods    []TimeRange // one or more periods (e.g., ชบ has two periods)
	Version    int
	CreatedAt  time.Time
	UpdatedAt  time.Time
	CreatedBy  string
	UpdatedBy  string
}

// NewShiftType validates the code and periods.
func NewShiftType(wardID WardID, code ShiftCode, name string, periods []TimeRange) (ShiftType, error) {
	if !validShiftCodes[code] {
		return ShiftType{}, fmt.Errorf("validation error: unknown shift code %s", code)
	}
	if len(periods) == 0 {
		return ShiftType{}, fmt.Errorf("validation error: at least one period required")
	}
	// Specific rule checks.
	switch code {
	case ShiftCodeCombined: // ชบ must be continuous 16h
		if len(periods) != 2 {
			return ShiftType{}, fmt.Errorf("validation error: ชบ requires two consecutive periods")
		}
		// Ensure no gap between periods.
		if periods[0].End != periods[1].Start {
			return ShiftType{}, fmt.Errorf("validation error: ชบ periods must be contiguous")
		}
	case ShiftCodeDouble: // บด two periods
		if len(periods) != 2 {
			return ShiftType{}, fmt.Errorf("validation error: บด requires two periods")
		}
	}
	// Compute total hours.
	var total float64
	for _, p := range periods {
		total += p.Duration().Hours()
	}
	return ShiftType{
		ID:         ShiftTypeID(generateUUID()),
		WardID:     wardID,
		Code:       code,
		Name:       name,
		IsDouble:   code == ShiftCodeCombined || code == ShiftCodeDouble,
		IsOff:      code == ShiftCodeOff || code == ShiftCodeLeave,
		TotalHours: total,
		IsEnabled:  true,
		Periods:    periods,
		Version:    1,
	}, nil
}
