package domain

import "time"

// NurseMonthStat represents detailed statistics for a single nurse in the schedule month.
type NurseMonthStat struct {
	NurseID                 string         `json:"nurseId"`
	NurseName               string         `json:"nurseName"`
	Position                string         `json:"position"`
	PlannedHours            float64        `json:"plannedHours"`
	ActualWorkHours         float64        `json:"actualWorkHours"`
	LeaveCreditHours        float64        `json:"leaveCreditHours"`
	CreditHours             float64        `json:"creditHours"`
	TargetHours             float64        `json:"targetHours"`
	VarianceHours           float64        `json:"varianceHours"` // CreditHours - TargetHours
	ShortageHours           float64        `json:"shortageHours"`
	OTHours                 float64        `json:"otHours"`
	OffDays                 int            `json:"offDays"`
	LeaveDays               int            `json:"leaveDays"`
	WorkDays                int            `json:"workDays"`
	DoubleShifts            int            `json:"doubleShifts"`
	NightHours              float64        `json:"nightHours"`
	NightShifts             int            `json:"nightShifts"`
	CarryInHours            float64        `json:"carryInHours"`
	CarryOutHours           float64        `json:"carryOutHours"`
	ShiftCounts             map[string]int `json:"shiftCounts"`
	CalculatedEveNightShifts float64        `json:"calculatedEveNightShifts"`
	AllowanceCap            float64        `json:"allowanceCap"`
	PayableEveNightShifts   float64        `json:"payableEveNightShifts"`
	ExcessEveNightShifts    float64           `json:"excessEveNightShifts"`
	EveNightShifts          float64           `json:"eveNightShifts"`
	OTShifts                float64           `json:"otShifts"`
	EveNightPay             float64           `json:"eveNightPay"`
	OTPay                   float64           `json:"otPay"`
	TotalPay                float64           `json:"totalPay"`
	HasOverride             bool              `json:"hasOverride,omitempty"`
	Overrides               []PayrollOverride `json:"overrides,omitempty"`
}

// IntervalStaffing represents staffing numbers in a specific daily interval.
type IntervalStaffing struct {
	Interval string `json:"interval"` // e.g. "00:00-08:00", "08:00-16:00", "16:00-20:00", "20:00-24:00"
	StartMin int    `json:"startMin"`
	EndMin   int    `json:"endMin"`
	ActualRN int    `json:"actualRn"`
	ActualPN int    `json:"actualPn"`
	ActualTotal int `json:"actualTotal"`
	RequiredRN int  `json:"requiredRn"`
	RequiredPN int  `json:"requiredPn"`
	RequiredTotal int `json:"requiredTotal"`
	Deficit  int    `json:"deficit"` // Shortage count
	Leaders  int    `json:"leaders"`
}

// DailyStaffingStat represents staffing counts across intervals for a specific day.
type DailyStaffingStat struct {
	Date      string             `json:"date"`
	DayOfWeek string             `json:"dayOfWeek"` // e.g. "จ.", "อ.", "พ."
	IsHoliday bool               `json:"isHoliday"`
	HolidayName string           `json:"holidayName,omitempty"`
	Intervals []IntervalStaffing `json:"intervals"`
}

// ScheduleTotals represents aggregate figures across the whole schedule.
type ScheduleTotals struct {
	TotalStaff        int     `json:"totalStaff"`
	ActiveStaff       int     `json:"activeStaff"`
	TotalAssignments  int     `json:"totalAssignments"` // cell entries
	TotalWorkShifts   int     `json:"totalWorkShifts"`
	TotalPlannedHours float64 `json:"totalPlannedHours"`
	TotalNightHours   float64 `json:"totalNightHours"`
	TotalDoubleShifts int     `json:"totalDoubleShifts"`
	TotalEveNightPay  float64 `json:"totalEveNightPay"`
	TotalOTPay        float64 `json:"totalOtPay"`
	GrandTotalPay     float64 `json:"grandTotalPay"`
	HardViolations    int     `json:"hardViolations"`
	SoftViolations    int     `json:"softViolations"`
}

// ScheduleSummary represents the unified output of the Shared Summary Service.
type ScheduleSummary struct {
	ScheduleID      int64               `json:"scheduleId"`
	WardID          string              `json:"wardId"`
	Month           int                 `json:"month"`
	Year            int                 `json:"year"`
	ScheduleVersion int                 `json:"scheduleVersion"`
	ScheduleStatus  string              `json:"scheduleStatus"`
	Timezone        string              `json:"timezone"`
	GeneratedAt     time.Time           `json:"generatedAt"`
	NurseStats      []NurseMonthStat    `json:"nurseStats"`
	DailyStaffing   []DailyStaffingStat `json:"dailyStaffing"`
	Totals          ScheduleTotals      `json:"totals"`
	Violations      []RuleViolation     `json:"violations"`
}
