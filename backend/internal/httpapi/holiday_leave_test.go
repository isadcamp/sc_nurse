package httpapi_test

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"nurse-scheduler/backend/internal/domain"
	"nurse-scheduler/backend/internal/httpapi"
	"nurse-scheduler/backend/internal/service"
	"nurse-scheduler/backend/internal/testfixture"
	"strconv"
	"testing"
	"time"
)

type memHolidayRepo struct {
	calendars map[int]domain.HolidayCalendar
}

func (m *memHolidayRepo) FindByYear(ctx context.Context, year int) (domain.HolidayCalendar, error) {
	if cal, ok := m.calendars[year]; ok {
		return cal, nil
	}
	return domain.HolidayCalendar{
		Year:     year,
		Holidays: []domain.Holiday{},
		Draft:    false,
	}, nil
}

func (m *memHolidayRepo) Save(ctx context.Context, cal domain.HolidayCalendar) error {
	m.calendars[cal.Year] = cal
	return nil
}

func (m *memHolidayRepo) DeleteYear(ctx context.Context, year int) error {
	delete(m.calendars, year)
	return nil
}

func (m *memHolidayRepo) CopyYearToDraft(ctx context.Context, fromYear, toYear int) error {
	from, ok := m.calendars[fromYear]
	if !ok {
		return errors.New("source year not found")
	}
	holidays := make([]domain.Holiday, len(from.Holidays))
	for i, h := range from.Holidays {
		newDate := time.Date(toYear, h.Date.Month(), h.Date.Day(), 0, 0, 0, 0, time.UTC)
		holidays[i] = domain.Holiday{
			ID:   int64(i + 1),
			Date: newDate,
			Name: h.Name,
		}
	}
	toCal := domain.HolidayCalendar{
		Year:     toYear,
		Holidays: holidays,
		Draft:    true,
	}
	m.calendars[toYear] = toCal
	return nil
}

func (m *memHolidayRepo) ListYears(ctx context.Context) ([]int, error) {
	var years []int
	for y := range m.calendars {
		years = append(years, y)
	}
	return years, nil
}

type memLeaveRepo struct {
	requests map[int64]domain.LeaveRequest
	nextID   int64
}

func (m *memLeaveRepo) Create(ctx context.Context, req domain.LeaveRequest) (domain.LeaveRequest, error) {
	m.nextID++
	req.ID = m.nextID
	if req.Status == "" {
		req.Status = domain.LeavePending
	}
	m.requests[req.ID] = req
	return req, nil
}

func (m *memLeaveRepo) FindByID(ctx context.Context, id int64) (domain.LeaveRequest, error) {
	if req, ok := m.requests[id]; ok {
		return req, nil
	}
	return domain.LeaveRequest{}, errors.New("not found")
}

func (m *memLeaveRepo) ListByWard(ctx context.Context, wardID domain.WardID) ([]domain.LeaveRequest, error) {
	var out []domain.LeaveRequest
	for _, r := range m.requests {
		if wardID != "" && r.WardID != string(wardID) {
			continue
		}
		out = append(out, r)
	}
	return out, nil
}

func (m *memLeaveRepo) UpdateStatus(ctx context.Context, id int64, status domain.LeaveStatus, approver string) error {
	req, ok := m.requests[id]
	if !ok {
		return errors.New("not found")
	}
	req.Status = status
	req.Approver = approver
	req.UpdatedAt = time.Now()
	m.requests[id] = req
	return nil
}

func setupWithHolidayAndLeave() (http.Handler, *memHolidayRepo, *memLeaveRepo) {
	m := &testfixture.Memory{R: testfixture.Roster()}
	rosterSvc := &service.RosterService{Store: m}

	hRepo := &memHolidayRepo{
		calendars: map[int]domain.HolidayCalendar{
			2026: {
				Year: 2026,
				Holidays: []domain.Holiday{
					{ID: 1, Date: time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC), Name: "วันขึ้นปีใหม่"},
				},
				Draft: false,
			},
		},
	}
	lRepo := &memLeaveRepo{
		requests: make(map[int64]domain.LeaveRequest),
	}

	hSvc := service.NewHolidayService(hRepo)
	lSvc := service.NewLeaveRequestService(lRepo)

	return httpapi.NewRouter(httpapi.Services{
		Roster:       rosterSvc,
		Holiday:      hSvc,
		LeaveRequest: lSvc,
		AI:           service.NewAIService(rosterSvc),
		Credentials:  []httpapi.Credential{{Token: headToken, ID: "test-head", Role: "head", Wards: []string{"ward-7"}}},
	}, "http://localhost:3000"), hRepo, lRepo
}

func TestHolidayEndpoints(t *testing.T) {
	h, _, _ := setupWithHolidayAndLeave()

	// 1. Get holidays for 2026
	w := call(h, "GET", "/api/v1/holidays?year=2026", "", headToken)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	var resp struct {
		Data domain.HolidayCalendar `json:"data"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil || resp.Data.Year != 2026 || len(resp.Data.Holidays) != 1 {
		t.Fatalf("expected 1 holiday for 2026, got %+v", resp)
	}

	// 2. Save holidays
	saveBody := `{"year":2026,"holidays":[{"date":"2026-01-01","name":"วันขึ้นปีใหม่"},{"date":"2026-04-13","name":"วันสงกรานต์"}],"draft":false}`
	w = call(h, "POST", "/api/v1/holidays", saveBody, headToken)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 on save holidays, got %d: %s", w.Code, w.Body.String())
	}

	// 3. Copy year
	copyBody := `{"fromYear":2026,"toYear":2027}`
	w = call(h, "POST", "/api/v1/holidays/copy-year", copyBody, headToken)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 on copy holiday year, got %d: %s", w.Code, w.Body.String())
	}

	// 4. Delete a holiday
	w = call(h, "DELETE", "/api/v1/holidays?year=2026&date=2026-01-01", "", headToken)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 on delete holiday, got %d: %s", w.Code, w.Body.String())
	}
}

func TestLeaveRequestEndpoints(t *testing.T) {
	h, _, lRepo := setupWithHolidayAndLeave()

	// 1. Create leave request
	createBody := `{"wardId":"ward-7","nurseId":"nurse-1","nurseName":"สมศรี","startDate":"2026-10-01","endDate":"2026-10-03","leaveType":"vacation","reason":"พักผ่อน"}`
	w := call(h, "POST", "/api/v1/leave-requests", createBody, headToken)
	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201 on create leave request, got %d: %s", w.Code, w.Body.String())
	}
	var createdResp struct {
		Data struct {
			ID        int64  `json:"id"`
			WardID    string `json:"wardId"`
			NurseID   string `json:"nurseId"`
			StartDate string `json:"startDate"`
			EndDate   string `json:"endDate"`
			Reason    string `json:"reason"`
			Status    string `json:"status"`
		} `json:"data"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &createdResp); err != nil || createdResp.Data.ID == 0 {
		t.Fatalf("expected created leave request ID, got %+v", createdResp)
	}
	reqID := createdResp.Data.ID

	// 2. List leave requests
	w = call(h, "GET", "/api/v1/leave-requests?wardId=ward-7", "", headToken)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 on list leave requests, got %d", w.Code)
	}

	// 3. Approve leave request
	w = call(h, "PUT", "/api/v1/leave-requests/"+strconv.FormatInt(reqID, 10)+"/approve", "", headToken)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 on approve leave request, got %d: %s", w.Code, w.Body.String())
	}
	if lRepo.requests[reqID].Status != domain.LeaveApproved {
		t.Fatalf("expected status approved, got %s", lRepo.requests[reqID].Status)
	}

	// 4. Create another leave request and reject it
	createBody2 := `{"wardId":"ward-7","nurseId":"nurse-2","nurseName":"สมใจ","startDate":"2026-10-05","endDate":"2026-10-06","leaveType":"sick","reason":"ป่วย"}`
	w = call(h, "POST", "/api/v1/leave-requests", createBody2, headToken)
	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201 on create leave request 2, got %d", w.Code)
	}
	json.Unmarshal(w.Body.Bytes(), &createdResp)
	reqID2 := createdResp.Data.ID

	rejectBody := `{"reason":"กำลังคนไม่เพียงพอ"}`
	w = call(h, "PUT", "/api/v1/leave-requests/"+strconv.FormatInt(reqID2, 10)+"/reject", rejectBody, headToken)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 on reject leave request, got %d: %s", w.Code, w.Body.String())
	}
	if lRepo.requests[reqID2].Status != domain.LeaveRejected {
		t.Fatalf("expected status rejected, got %s", lRepo.requests[reqID2].Status)
	}
}
