package domain

import (
	"context"
	"time"
)

type Solver interface {
	Solve(context.Context, SolverInput) (SolverOutput, error)
}

type ObjectiveWeights struct {
	Coverage   float64 `json:"coverage"`
	Fairness   float64 `json:"fairness"`
	Preference float64 `json:"preference"`
	Stability  float64 `json:"stability"`
}
type FairnessScore struct {
	Coverage   float64 `json:"coverage"`
	Fairness   float64 `json:"fairness"`
	Preference float64 `json:"preference"`
	Stability  float64 `json:"stability"`
	Total      float64 `json:"total"`
}
type ReadinessIssue struct {
	Code     string `json:"code"`
	Field    string `json:"field"`
	Date     string `json:"date"`
	NurseID  string `json:"nurseId"`
	Message  string `json:"message"`
	FixPath  string `json:"fixPath"`
	Severity string `json:"severity"`
}
type ReadinessReport struct {
	Ready          bool             `json:"ready"`
	Issues         []ReadinessIssue `json:"issues"`
	ExcludedShifts []string         `json:"excludedShifts"`
	Revision       string           `json:"revision"`
	PolicyVersion  string           `json:"policyVersion"`
}

// Leaves are explicit because the interactive roster omits leave records.
type ResolvedPolicySnapshot struct {
	SchemaVersion int     `json:"schemaVersion"`
	Hash          string  `json:"hash"`
	Roster        Roster  `json:"roster"`
	Leaves        []Leave `json:"leaves"`
}
type SolveScope struct {
	Start    string   `json:"start"`
	End      string   `json:"end"`
	NurseIDs []string `json:"nurseIds"`
}
type SolverInput struct {
	Snapshot          ResolvedPolicySnapshot `json:"snapshot"`
	Scope             SolveScope             `json:"scope"`
	Seed              int64                  `json:"seed"`
	MaxDuration       time.Duration          `json:"maxDuration"`
	MaxNodes          int                    `json:"maxNodes"`
	AllowPartTime     bool                   `json:"allowPartTime"`
	MaxPartTimeRN     int                    `json:"maxPartTimeRN"`
	MaxPartTimePN     int                    `json:"maxPartTimePN"`
	MaxPartTimeShifts int                    `json:"maxPartTimeShifts"`
	Incumbent         []Cell                 `json:"incumbent,omitempty"`
	PreviousJobID     string                 `json:"previousJobId,omitempty"`
	CheckpointSeed    int64                  `json:"checkpointSeed,omitempty"`
	Profile           string                 `json:"profile,omitempty"`
}
type ShortageDetail struct {
	Date          string         `json:"date"`
	ShiftCode     string         `json:"shiftCode"`
	Position      string         `json:"position"`
	Required      int            `json:"required"`
	Assigned      int            `json:"assigned"`
	Missing       int            `json:"missing"`
	MissingSkills map[string]int `json:"missingSkills,omitempty"`
	BlockingRules []string       `json:"blockingRules,omitempty"`
	Suggestions   []string       `json:"suggestions,omitempty"`
}

// PTRequirement ระบุเวรที่ต้องการบุคลากร Part-time มาเสริม
// ส่งเฉพาะเมื่อ RegularSearchStatus == "minimum_shortage_proven"
// ConstraintEvidence ต้องเป็นหลักฐานข้อจำกัดจริงที่ตรวจได้ ห้ามเป็นข้อความคาดเดา
type PTRequirement struct {
	Date               string         `json:"date"`
	ShiftCode          string         `json:"shiftCode"`
	Position           string         `json:"position"`
	Missing            int            `json:"missing"`
	MissingLeader      bool           `json:"missingLeader,omitempty"`
	MissingSkills      map[string]int `json:"missingSkills,omitempty"`
	ConstraintEvidence []string       `json:"constraintEvidence"`
}

type SolveDiagnostics struct {
	// ฟิลด์เดิม — คงไว้ทั้งหมดเพื่อ backward compatibility
	Nodes          int              `json:"nodes"`
	Exhausted      bool             `json:"exhausted"`
	Reason         string           `json:"reason"`
	Attempts       int              `json:"attempts"`
	Repairs        int              `json:"repairs"`
	Strategies     []string         `json:"strategies"`
	BlockingRules  map[string]int   `json:"blockingRules"`
	Shortages      []ShortageDetail `json:"shortages,omitempty"`
	PartTimeShifts int              `json:"partTimeShifts,omitempty"`
	PartTimeNurses int              `json:"partTimeNurses,omitempty"`
	Feasibility    string           `json:"feasibility,omitempty"`

	// Sprint 5: ฟิลด์ใหม่สำหรับ AUTO จัดคนประจำก่อน
	// RegularSearchStatus: "complete" | "search_incomplete" | "minimum_shortage_proven" | "invalid_fixed_data"
	RegularSearchStatus  string           `json:"regularSearchStatus,omitempty"`
	// RemainingShortages: รายการช่องขาดของตารางที่ดีที่สุดปัจจุบัน (มีเสมอเมื่อยังขาด)
	RemainingShortages   []ShortageDetail `json:"remainingShortages,omitempty"`
	// PartTimeRequirements: ส่งเฉพาะเมื่อ RegularSearchStatus == "minimum_shortage_proven"
	PartTimeRequirements []PTRequirement  `json:"partTimeRequirements,omitempty"`
	// CanContinue: true เมื่อยังค้นหาต่อได้
	CanContinue          bool             `json:"canContinue,omitempty"`
}
type SolverOutput struct {
	Status      string           `json:"status"`
	Assignments []Cell           `json:"assignments"`
	Violations  []RuleViolation  `json:"violations"`
	Diagnostics SolveDiagnostics `json:"diagnostics"`
	Score       FairnessScore    `json:"score"`
	Profile     string           `json:"profile,omitempty"`
	Metrics     *PlanMetrics     `json:"metrics,omitempty"`
}

type PlanMetrics struct {
	FairnessScore    float64 `json:"fairnessScore"`
	PreferenceRate   float64 `json:"preferenceRate"`
	ConsecutiveOffs  int     `json:"consecutiveOffs"`
	TwelveHourShifts int     `json:"twelveHourShifts"`
	DoubleShifts     int     `json:"doubleShifts"`
	HoursStdDev      float64 `json:"hoursStdDev"`
	MaxHours         float64 `json:"maxHours"`
	MinHours         float64 `json:"minHours"`
}

type MultiPlanOption struct {
	Profile     string       `json:"profile"`
	Title       string       `json:"title"`
	Description string       `json:"description"`
	JobID       string       `json:"jobId"`
	Result      SolverOutput `json:"result"`
	Metrics     PlanMetrics  `json:"metrics"`
}

type MultiPlanResponse struct {
	Plans []MultiPlanOption `json:"plans"`
}

type SolverJob struct {
	ID         string        `json:"id"`
	ScheduleID int64         `json:"scheduleId"`
	WardID     string        `json:"wardId"`
	ActorID    string        `json:"actorId"`
	Status     string        `json:"status"`
	Progress   int           `json:"progress"`
	Simulation bool          `json:"simulation"`
	Stale      bool          `json:"stale"`
	Applied    bool          `json:"applied"`
	Input      SolverInput   `json:"input"`
	Before     FairnessScore `json:"before"`
	Result     *SolverOutput `json:"result"`
	Error      string        `json:"error"`
	CreatedAt  time.Time     `json:"createdAt"`
	UpdatedAt  time.Time     `json:"updatedAt"`
}
