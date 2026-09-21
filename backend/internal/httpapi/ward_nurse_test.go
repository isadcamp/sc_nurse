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
	"testing"
)

type memWardRepo struct {
	wards map[domain.WardID]domain.Ward
}

func (m *memWardRepo) FindByID(ctx context.Context, id domain.WardID) (domain.Ward, error) {
	if w, ok := m.wards[id]; ok {
		return w, nil
	}
	return domain.Ward{}, errors.New("not found")
}
func (m *memWardRepo) FindAll(ctx context.Context) ([]domain.Ward, error) {
	out := make([]domain.Ward, 0, len(m.wards))
	for _, w := range m.wards {
		out = append(out, w)
	}
	return out, nil
}
func (m *memWardRepo) Save(ctx context.Context, ward domain.Ward) error {
	m.wards[ward.ID] = ward
	return nil
}
func (m *memWardRepo) Update(ctx context.Context, ward domain.Ward) error {
	m.wards[ward.ID] = ward
	return nil
}
func (m *memWardRepo) SetStatus(ctx context.Context, id domain.WardID, isActive bool, updatedBy string) error {
	if w, ok := m.wards[id]; ok {
		w.IsActive = isActive
		w.UpdatedBy = updatedBy
		m.wards[id] = w
		return nil
	}
	return errors.New("not found")
}
func (m *memWardRepo) Delete(ctx context.Context, id domain.WardID) error {
	delete(m.wards, id)
	return nil
}

type memNurseRepo struct {
	nurses map[domain.NurseID]domain.Nurse
}

func (m *memNurseRepo) FindByID(ctx context.Context, id domain.NurseID) (domain.Nurse, error) {
	if n, ok := m.nurses[id]; ok {
		return n, nil
	}
	return domain.Nurse{}, errors.New("not found")
}
func (m *memNurseRepo) FindByWard(ctx context.Context, wardID domain.WardID, activeOnly bool) ([]domain.Nurse, error) {
	out := []domain.Nurse{}
	for _, n := range m.nurses {
		if wardID == "" || n.WardID == wardID {
			if !activeOnly || n.IsActive {
				out = append(out, n)
			}
		}
	}
	return out, nil
}
func (m *memNurseRepo) FindActiveNurses(ctx context.Context, wardID domain.WardID) ([]domain.Nurse, error) {
	return m.FindByWard(ctx, wardID, true)
}
func (m *memNurseRepo) Save(ctx context.Context, n domain.Nurse) error {
	m.nurses[n.ID] = n
	return nil
}
func (m *memNurseRepo) Update(ctx context.Context, n domain.Nurse) error {
	m.nurses[n.ID] = n
	return nil
}
func (m *memNurseRepo) Delete(ctx context.Context, id domain.NurseID) error {
	delete(m.nurses, id)
	return nil
}

func setupWithWardAndNurse() (http.Handler, *memWardRepo, *memNurseRepo) {
	m := &testfixture.Memory{R: testfixture.Roster()}
	rosterSvc := &service.RosterService{Store: m}
	wardRepo := &memWardRepo{wards: map[domain.WardID]domain.Ward{
		"test-ward": {ID: "test-ward", Name: "Test Ward", Timezone: "Asia/Bangkok", Version: 1},
	}}
	nurseRepo := &memNurseRepo{nurses: map[domain.NurseID]domain.Nurse{
		"test-n1": {ID: "test-n1", WardID: "test-ward", Name: "Nurse 1", Position: "RN", IsChargeEligible: true, CanDoubleShift: true, IsActive: true, Skills: []string{"icu"}, AllowedShiftCodes: []string{"ช", "บ"}},
	}}
	wardSvc := service.NewWardService(wardRepo)
	nurseSvc := service.NewNurseService(nurseRepo)

	return httpapi.NewRouter(httpapi.Services{
		Roster:      rosterSvc,
		Ward:        wardSvc,
		Nurse:       nurseSvc,
		AI:          service.NewAIService(rosterSvc),
		Credentials: []httpapi.Credential{{Token: headToken, ID: "test-head", Role: "head", Wards: []string{"test-ward"}}},
	}, "http://localhost:3000"), wardRepo, nurseRepo
}

func TestWardCRUD(t *testing.T) {
	h, _, _ := setupWithWardAndNurse()

	// 1. List wards
	w := call(h, "GET", "/api/v1/wards", "", headToken)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	var listResp struct {
		Data []map[string]any `json:"data"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &listResp); err != nil || len(listResp.Data) == 0 {
		t.Fatalf("expected wards list, got %v", w.Body.String())
	}

	// 2. Create new ward
	createBody := `{"id":"ward-icu","name":"ICU Ward","timezone":"Asia/Bangkok"}`
	w = call(h, "POST", "/api/v1/wards", createBody, headToken)
	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201 on create ward, got %d: %s", w.Code, w.Body.String())
	}

	// 3. Get ward
	w = call(h, "GET", "/api/v1/wards/ward-icu", "", headToken)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 on get ward, got %d", w.Code)
	}

	// 4. Update ward
	updateBody := `{"name":"ICU Ward Updated","timezone":"Asia/Bangkok"}`
	w = call(h, "PUT", "/api/v1/wards/ward-icu", updateBody, headToken)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 on update ward, got %d", w.Code)
	}
}

func TestNurseCRUD(t *testing.T) {
	h, _, _ := setupWithWardAndNurse()

	// 1. List ward nurses
	w := call(h, "GET", "/api/v1/wards/test-ward/nurses", "", headToken)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}

	// 2. Create nurse
	createBody := `{"id":"test-n2","wardId":"test-ward","name":"Nurse 2","position":"PN","isChargeEligible":false,"canDoubleShift":true,"skills":["er"],"allowedShiftCodes":["ช","บ","ด"]}`
	w = call(h, "POST", "/api/v1/nurses", createBody, headToken)
	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201 on create nurse, got %d: %s", w.Code, w.Body.String())
	}

	// 3. Get nurse
	w = call(h, "GET", "/api/v1/nurses/test-n2", "", headToken)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 on get nurse, got %d", w.Code)
	}

	// 4. Update nurse
	updateBody := `{"name":"Nurse 2 Updated","position":"RN","isChargeEligible":true}`
	w = call(h, "PUT", "/api/v1/nurses/test-n2", updateBody, headToken)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 on update nurse, got %d", w.Code)
	}

	// 5. Toggle nurse status
	patchBody := `{"isActive":false}`
	w = call(h, "PATCH", "/api/v1/nurses/test-n2/status", patchBody, headToken)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 on patch status, got %d", w.Code)
	}
}
