package testfixture

import (
	"fmt"
	"nurse-scheduler/backend/internal/domain"
	"time"
)

// ReadyRoster adds complete synthetic inputs so AUTO can be exercised locally.
func ReadyRoster(r domain.Roster) domain.Roster {
	r.Policy.Status = "confirmed"
	r.Policy.Version = "test-policy-v1"
	r.Policy.EffectiveFrom = "2026-09-01"
	r.Policy.EffectiveTo = "2026-09-30"
	r.Policy.Targets = []domain.Target{{NurseID: "test-a", Hours: 120, Off: 4, Quotas: map[string]int{}}, {NurseID: "test-b", Hours: 120, Off: 4, Quotas: map[string]int{}}}
	r.Policy.Staffing = []domain.Staffing{{Date: "2026-09-01", Start: 0, End: 1440, RN: 0, PN: 0, Leaders: 0, Skills: map[string]int{}}}
	for _, nurse := range []string{"test-a", "test-b"} {
		for d := 25; d <= 31; d++ {
			r.Boundary = append(r.Boundary, domain.Cell{NurseID: nurse, Date: fmt.Sprintf("2026-08-%02d", d), ShiftCode: "X", Version: 1})
		}
	}
	_ = time.UTC
	return r
}
