package scheduler

import (
	"errors"
	"fmt"
	"time"

	"nurse-scheduler/backend/internal/domain"
)

type Service struct{ nurses []domain.Nurse }

func NewService() *Service {
	return &Service{nurses: []domain.Nurse{
		{ID: "N001", Name: "ศิริพร", IsChargeEligible: true}, {ID: "N002", Name: "กัญญารัตน์", IsChargeEligible: true},
		{ID: "N003", Name: "พิมพ์ชนก", IsChargeEligible: true}, {ID: "N004", Name: "จิราพร", IsChargeEligible: true},
		{ID: "N005", Name: "วราภรณ์", IsChargeEligible: true}, {ID: "N006", Name: "ณัฐชา"},
		{ID: "N007", Name: "สุภาพร"}, {ID: "N008", Name: "ชนากานต์"},
		{ID: "N009", Name: "อรทัย"}, {ID: "N010", Name: "นลินี"},
		{ID: "N011", Name: "ธัญญลักษณ์"}, {ID: "N012", Name: "เบญจมาศ"},
	}}
}

func (s *Service) Nurses() []domain.Nurse { return s.nurses }

func (s *Service) Generate(input domain.GenerateScheduleRequest) (domain.GeneratedSchedule, error) {
	start, err := time.Parse("2006-01-02", input.StartDate)
	if err != nil {
		return domain.GeneratedSchedule{}, errors.New("startDate must use YYYY-MM-DD")
	}
	if input.Days < 1 || input.Days > 31 {
		return domain.GeneratedSchedule{}, errors.New("days must be between 1 and 31")
	}
	if input.RequiredPerShift < 1 || input.RequiredPerShift > 10 {
		return domain.GeneratedSchedule{}, errors.New("requiredPerShift must be between 1 and 10")
	}

	shifts := []string{"M", "E", "N"}
	loads := make(map[domain.NurseID]int)
	previousNight := make(map[domain.NurseID]bool)
	result := domain.GeneratedSchedule{ID: fmt.Sprintf("SCH-%d", time.Now().Unix()), Status: "generated", Assignments: []domain.GeneratedAssignment{}, Warnings: []string{}, GeneratedAt: time.Now().UTC()}

	for day := 0; day < input.Days; day++ {
		date := start.AddDate(0, 0, day).Format("2006-01-02")
		used := make(map[domain.NurseID]bool)
		currentNight := make(map[domain.NurseID]bool)
		for _, shift := range shifts {
			chosen := make([]domain.Nurse, 0, input.RequiredPerShift)
			for len(chosen) < input.RequiredPerShift {
				requireLeader := len(chosen) == 0
				bestIndex := -1
				for _, nurse := range s.nurses {
					if used[nurse.ID] || (requireLeader && !nurse.IsChargeEligible) || (shift == "M" && previousNight[nurse.ID]) {
						continue
					}
					candidateIndex := nurseIndex(s.nurses, nurse.ID)
					if bestIndex == -1 || loads[nurse.ID] < loads[s.nurses[bestIndex].ID] {
						bestIndex = candidateIndex
					}
				}
				if bestIndex == -1 {
					break
				}
				chosen = append(chosen, s.nurses[bestIndex])
				used[s.nurses[bestIndex].ID] = true
			}
			for _, nurse := range chosen {
				loads[nurse.ID]++
				if shift == "N" {
					currentNight[nurse.ID] = true
				}
				result.Assignments = append(result.Assignments, domain.GeneratedAssignment{Date: date, Shift: shift, NurseID: string(nurse.ID), NurseName: nurse.Name, IsLeader: nurse.IsChargeEligible})
			}
			if len(chosen) < input.RequiredPerShift {
				result.Warnings = append(result.Warnings, fmt.Sprintf("%s shift %s is understaffed", date, shift))
			}
		}
		previousNight = currentNight
	}
	return result, nil
}

func nurseIndex(nurses []domain.Nurse, id domain.NurseID) int {
	for index, nurse := range nurses {
		if nurse.ID == id {
			return index
		}
	}
	return -1
}
