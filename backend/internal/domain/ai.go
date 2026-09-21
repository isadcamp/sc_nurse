package domain

import "time"

type AIAnalysisType string

const (
	AnalysisOverview   AIAnalysisType = "overview"
	AnalysisStaffing   AIAnalysisType = "staffing"
	AnalysisFairness   AIAnalysisType = "fairness"
	AnalysisSuggestion AIAnalysisType = "suggestion"
)

type FindingCategory string

const (
	CategoryStaffing   FindingCategory = "staffing"
	CategoryFairness   FindingCategory = "fairness"
	CategoryViolations FindingCategory = "violations"
	CategoryQuality    FindingCategory = "quality"
)

// AIFinding represents a single actionable finding or insight from AI analysis.
type AIFinding struct {
	ID          string          `json:"id"`
	Category    FindingCategory `json:"category"`
	Severity    string          `json:"severity"` // "info" | "warning" | "critical"
	Title       string          `json:"title"`
	Description string          `json:"description"`
	Date        string          `json:"date,omitempty"`
	SubjectID   string          `json:"subjectId,omitempty"`
	SubjectName string          `json:"subjectName,omitempty"`
	Suggestion  string          `json:"suggestion,omitempty"`
}

// ProposedChange represents a single shift change inside a swap suggestion.
type ProposedChange struct {
	NurseID      string `json:"nurseId"`
	NurseName    string `json:"nurseName"`
	Date         string `json:"date"`
	OldShiftCode string `json:"oldShiftCode"`
	NewShiftCode string `json:"newShiftCode"`
}

// AISwapSuggestion represents a validated proposal to swap or adjust shifts to improve the schedule.
type AISwapSuggestion struct {
	ID          string           `json:"id"`
	Title       string           `json:"title"`
	Description string           `json:"description"`
	Reason      string           `json:"reason"`
	Changes     []ProposedChange `json:"changes"`
	ScoreBefore float64          `json:"scoreBefore"`
	ScoreAfter  float64          `json:"scoreAfter"`
	Improvement float64          `json:"improvement"` // ScoreAfter - ScoreBefore
	HardErrors  int              `json:"hardErrors"`  // After application (must be 0)
	Status      string           `json:"status"`      // "proposed" | "accepted" | "rejected"
	CreatedAt   time.Time        `json:"createdAt"`
}

// AIAnalysis represents full analysis results for a specific schedule version.
type AIAnalysis struct {
	ID              string             `json:"id"`
	ScheduleID      int64              `json:"scheduleId"`
	ScheduleVersion int                `json:"scheduleVersion"`
	ScheduleHash    string             `json:"scheduleHash"`
	AnalysisType    AIAnalysisType     `json:"analysisType"`
	Summary         string             `json:"summary"`
	OverallScore    float64            `json:"overallScore"`
	Findings        []AIFinding        `json:"findings"`
	Suggestions     []AISwapSuggestion `json:"suggestions"`
	IsStale         bool               `json:"isStale"`
	CreatedAt       time.Time          `json:"createdAt"`
}

// AIDraftComparison represents comparative analysis between two schedule versions.
type AIDraftComparison struct {
	BaseID          int64           `json:"baseId"`
	BaseVersion     int             `json:"baseVersion"`
	CompareID       int64           `json:"compareId"`
	CompareVersion  int             `json:"compareVersion"`
	BaseViolations  int             `json:"baseViolations"`
	CompViolations  int             `json:"compViolations"`
	Differences     []CellChange    `json:"differences"`
	AIExplanation   string          `json:"aiExplanation"`
	Recommendation  string          `json:"recommendation"` // Which draft is recommended and why
	ProsDraftA      []string        `json:"prosDraftA"`
	ProsDraftB      []string        `json:"prosDraftB"`
	ConsDraftA      []string        `json:"consDraftA"`
	ConsDraftB      []string        `json:"consDraftB"`
}
