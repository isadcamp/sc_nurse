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
	Snapshot    ResolvedPolicySnapshot `json:"snapshot"`
	Scope       SolveScope             `json:"scope"`
	Seed        int64                  `json:"seed"`
	MaxDuration time.Duration          `json:"maxDuration"`
	MaxNodes    int                    `json:"maxNodes"`
}
type SolveDiagnostics struct {
	Nodes     int    `json:"nodes"`
	Exhausted bool   `json:"exhausted"`
	Reason    string `json:"reason"`
}
type SolverOutput struct {
	Status      string           `json:"status"`
	Assignments []Cell           `json:"assignments"`
	Violations  []RuleViolation  `json:"violations"`
	Diagnostics SolveDiagnostics `json:"diagnostics"`
	Score       FairnessScore    `json:"score"`
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
