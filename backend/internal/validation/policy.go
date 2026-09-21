package validation

import (
	"nurse-scheduler/backend/internal/domain"
	"time"
)

func PolicyValid(p domain.Policy) bool {
 if p.Status != "" && p.Status != "draft" && p.Status != "confirmed" { return false }
 if p.MinOff < 0 || p.MinOff > 31 || p.MaxRolling24Hours < 0 || p.MaxRolling24Hours > 24 || p.MaxRolling7DaysHours < 0 || p.MaxRolling7DaysHours > 168 { return false }
 for _, w := range []float64{p.Weights.Coverage,p.Weights.Fairness,p.Weights.Preference,p.Weights.Stability} { if w < 0 || w > 1000 { return false } }
 for _, d := range []string{p.EffectiveFrom,p.EffectiveTo} { if d != "" { if _, err := time.Parse("2006-01-02",d); err != nil { return false } } }
 if p.EffectiveFrom != "" && p.EffectiveTo != "" && p.EffectiveFrom > p.EffectiveTo { return false }
	if p.MinRestHours < 0 || p.MinRestHours > 48 || p.MaxConsecutiveDays < 1 || p.MaxConsecutiveDays > 366 || p.MaxConsecutiveNights < 1 || p.MaxConsecutiveNights > 366 || p.MaxConsecutiveOffDays < 0 || p.MaxConsecutiveOffDays > 31 || p.MaxMonthlyHours <= 0 || p.MaxMonthlyHours > 744 || p.MaxContinuousHours <= 0 || p.MaxContinuousHours > 48 || p.MaxDoubleShifts < 0 || p.MaxDoubleShifts > 31 || p.NightStart < 0 || p.NightStart >= 1440 || p.NightEnd <= p.NightStart || p.NightEnd > p.NightStart+1440 || p.FairnessHours < 0 {
		return false
	}
	for _, x := range p.Staffing {
		if x.Start < 0 || x.Start >= 1440 || x.End <= x.Start || x.End > 2880 || x.RN < 0 || x.PN < 0 || x.Leaders < 0 {
			return false
		}
		if x.Date != "" {
			if _, e := time.Parse("2006-01-02", x.Date); e != nil {
				return false
			}
		}
		for _, v := range x.Skills {
			if v < 0 {
				return false
			}
		}
	}
	for _, x := range p.Targets {
		if x.NurseID == "" || x.Hours < 0 || x.Off < 0 || x.Off > 31 {
			return false
		}
		for _, q := range x.Quotas {
			if q < 0 || q > 31 {
				return false
			}
		}
	}
	for _, x := range p.Preferences {
		if x.NurseID == "" || x.ShiftCode == "" {
			return false
		}
		if _, e := time.Parse("2006-01-02", x.Date); e != nil {
			return false
		}
	}
	return true
}
