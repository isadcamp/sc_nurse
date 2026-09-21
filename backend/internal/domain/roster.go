package domain

import "time"

type Cell struct {
	ID        int64  `json:"id"`
	NurseID   string `json:"nurseId"`
	Date      string `json:"date"`
	ShiftCode string `json:"shiftCode"`
	Version   int    `json:"version"`
	Locked    bool   `json:"locked"`
	LockedBy  string `json:"lockedBy,omitempty"`
}
type Staff struct {
	ID        string   `json:"id"`
	Name      string   `json:"name"`
	Position  string   `json:"position"`
	Leader    bool     `json:"leader"`
	Double    bool     `json:"double"`
	PartTime  bool     `json:"partTime"`
	Active    bool     `json:"active"`
	Skills    []string `json:"skills"`
	Allowed   []string `json:"allowed"`
	StartDate string   `json:"startDate,omitempty"`
	EndDate   string   `json:"endDate,omitempty"`
}
type Period struct {
	Start int `json:"start"`
	End   int `json:"end"`
}
type RosterShift struct {
	Code    string   `json:"code"`
	Name    string   `json:"name"`
	Double  bool     `json:"double"`
	Periods []Period `json:"periods"`
}
type Preference struct {
	NurseID   string `json:"nurseId"`
	Date      string `json:"date"`
	ShiftCode string `json:"shiftCode"`
	Avoid     bool   `json:"avoid"`
}
type Target struct {
	NurseID string         `json:"nurseId"`
	Hours   float64        `json:"hours"`
	Off     int            `json:"off"`
	Quotas  map[string]int `json:"quotas"`
}
type Staffing struct {
	Date    string         `json:"date"`
	Start   int            `json:"start"`
	End     int            `json:"end"`
	RN      int            `json:"rn"`
	PN      int            `json:"pn"`
	Leaders int            `json:"leaders"`
	Skills  map[string]int `json:"skills"`
}
type CompensationConfig struct {
	WorkingDays    int     `json:"workingDays"`
	AllowanceCap   float64 `json:"allowanceCap"`
	RNEveNightRate float64 `json:"rnEveNightRate"`
	PNEveNightRate float64 `json:"pnEveNightRate"`
	RNOTRate       float64 `json:"rnOtRate"`
	PNOTRate       float64 `json:"pnOtRate"`
}

type Policy struct {
	Status string `json:"status,omitempty"`
	Version string `json:"version,omitempty"`
	EffectiveFrom string `json:"effectiveFrom,omitempty"`
	EffectiveTo string `json:"effectiveTo,omitempty"`
	MinOff int `json:"minOff,omitempty"`
	MaxRolling24Hours float64 `json:"maxRolling24Hours,omitempty"`
	MaxRolling7DaysHours float64 `json:"maxRolling7DaysHours,omitempty"`
	Weights ObjectiveWeights `json:"weights"`
	MinRestHours         float64            `json:"minRestHours"`
	MaxConsecutiveDays   int                `json:"maxConsecutiveDays"`
	MaxConsecutiveNights int                `json:"maxConsecutiveNights"`
	MaxConsecutiveOffDays int               `json:"maxConsecutiveOffDays,omitempty"`
	CompressOffOnShortage bool              `json:"compressOffOnShortage,omitempty"`
	AllowOTOnShortage     bool              `json:"allowOTOnShortage,omitempty"`
	MaxMonthlyHours      float64            `json:"maxMonthlyHours"`
	MaxContinuousHours   float64            `json:"maxContinuousHours"`
	MaxDoubleShifts      int                `json:"maxDoubleShifts"`
	NightStart           int                `json:"nightStart"`
	NightEnd             int                `json:"nightEnd"`
	FairnessHours        float64            `json:"fairnessHours"`
	Compensation         CompensationConfig `json:"compensation,omitempty"`
	Targets              []Target           `json:"targets"`
	Preferences          []Preference       `json:"preferences"`
	Staffing             []Staffing         `json:"staffing"`
}
type Leave struct {
	NurseID  string `json:"nurseId"`
	Start    string `json:"start"`
	End      string `json:"end"`
	Approved bool   `json:"approved"`
}
type DayOff struct {
	Date string `json:"date"`
	Name string `json:"name"`
}
type Roster struct {
	ID          int64         `json:"id"`
	WardID      string        `json:"wardId"`
	Month       int           `json:"month"`
	Year        int           `json:"year"`
	Status      string        `json:"status"`
	Version     int           `json:"version"`
	ParentID    *int64        `json:"parentId,omitempty"`
	SubmittedBy string        `json:"submittedBy,omitempty"`
	SubmittedAt string        `json:"submittedAt,omitempty"`
	ApprovedBy  string        `json:"approvedBy,omitempty"`
	ApprovedAt  string        `json:"approvedAt,omitempty"`
	PublishedBy string        `json:"publishedBy,omitempty"`
	PublishedAt string        `json:"publishedAt,omitempty"`
	ClosedBy    string        `json:"closedBy,omitempty"`
	ClosedAt    string        `json:"closedAt,omitempty"`
	Timezone    string        `json:"timezone"`
	Assignments []Cell        `json:"assignments"`
	Staff       []Staff       `json:"staff"`
	Shifts      []RosterShift `json:"shifts"`
	Holidays    []DayOff      `json:"holidays"`
	Leaves      []Leave       `json:"-"`
	Boundary    []Cell        `json:"boundary"`
	Policy      Policy        `json:"policy"`
}
type RuleViolation struct {
	RuleCode  string         `json:"ruleCode"`
	Severity  string         `json:"severity"`
	Date      string         `json:"date"`
	ShiftCode string         `json:"shiftCode"`
	SubjectID string         `json:"subjectId"`
	Message   string         `json:"message"`
	Metadata  map[string]any `json:"metadata"`
}
type Hours struct {
	NurseID  string  `json:"nurseId"`
	Monthly  float64 `json:"monthly"`
	Night    float64 `json:"night"`
	CarryIn  float64 `json:"carryIn"`
	CarryOut float64 `json:"carryOut"`
	Nights   int     `json:"nights"`
}
type Report struct {
	Violations []RuleViolation `json:"violations"`
	Hours      []Hours         `json:"hours"`
	CanSave    bool            `json:"canSave"`
}
type Actor struct {
	ID    string
	Role  string
	Wards []string
}
type Audit struct {
	Actor  string
	Action string
	Reason string
	At     time.Time
	Before string
	After  string
}

// PayrollOverride stores manual compensation adjustments with audit history.
type PayrollOverride struct {
	ID            int64     `json:"id"`
	ScheduleID    int64     `json:"scheduleId"`
	NurseID       string    `json:"nurseId"`
	FieldName     string    `json:"fieldName"` // "eve_night_shifts", "ot_shifts", "eve_night_pay", "ot_pay", "total_pay"
	OriginalValue float64   `json:"originalValue"`
	OverrideValue float64   `json:"overrideValue"`
	Reason        string    `json:"reason"`
	ApprovedBy    string    `json:"approvedBy"`
	CreatedAt     time.Time `json:"createdAt"`
}

// CompensationRate stores historical baseline rates for RN / PN.
type CompensationRate struct {
	ID             int64      `json:"id"`
	Position       string     `json:"position"`
	EveNightRate   float64    `json:"eveNightRate"`
	OTRate         float64    `json:"otRate"`
	EffectiveFrom  string     `json:"effectiveFrom"`
	EffectiveTo    *string    `json:"effectiveTo,omitempty"`
	CreatedAt      time.Time  `json:"createdAt"`
	UpdatedAt      time.Time  `json:"updatedAt"`
}
