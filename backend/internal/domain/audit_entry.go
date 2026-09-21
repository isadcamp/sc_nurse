package domain

// AuditEntry represents a row from schedule_audit for read purposes.
type AuditEntry struct {
	ID         int64  `json:"id"`
	ScheduleID *int64 `json:"scheduleId"`
	WardID     string `json:"wardId"`
	Actor      string `json:"actor"`
	Action     string `json:"action"`
	Reason     string `json:"reason"`
	CreatedAt  string `json:"createdAt"`
}

// VersionDiff shows differences between two schedule versions.
type VersionDiff struct {
	BaseVersion    int    `json:"baseVersion"`
	CompareVersion int    `json:"compareVersion"`
	BaseStatus     string `json:"baseStatus"`
	CompareStatus  string `json:"compareStatus"`
	Added          []Cell `json:"added"`
	Removed        []Cell `json:"removed"`
	Changed        []CellChange `json:"changed"`
}

// CellChange shows a single assignment that changed between versions.
type CellChange struct {
	NurseID      string `json:"nurseId"`
	Date         string `json:"date"`
	OldShiftCode string `json:"oldShiftCode"`
	NewShiftCode string `json:"newShiftCode"`
}
