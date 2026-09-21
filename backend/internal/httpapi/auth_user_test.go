package httpapi_test

import (
	"encoding/json"
	"net/http"
	"nurse-scheduler/backend/internal/domain"
	"nurse-scheduler/backend/internal/httpapi"
	"nurse-scheduler/backend/internal/service"
	"nurse-scheduler/backend/internal/testfixture"
	"testing"
)

func TestAuthAndWardManagementEndpoints(t *testing.T) {
	adminToken := "admin-bearer-token"
	memStore := &testfixture.Memory{R: testfixture.Roster()}
	rosterSvc := &service.RosterService{Store: memStore}
	wardRepo := &memWardRepo{wards: map[domain.WardID]domain.Ward{
		"test-ward": {ID: "test-ward", Name: "Ward 1", IsActive: true},
	}}

	router := httpapi.NewRouter(httpapi.Services{
		Roster: rosterSvc,
		Ward:   service.NewWardService(wardRepo),
		Credentials: []httpapi.Credential{
			{Token: adminToken, ID: "admin", Role: "admin", Wards: []string{"test-ward"}},
			{Token: "head-token", ID: "head", Role: "head", Wards: []string{"test-ward"}},
		},
	}, "http://localhost:3000")

	// 1. Test /api/v1/auth/me with admin token
	w := call(router, "GET", "/api/v1/auth/me", "", adminToken)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 for /auth/me, got %d: %s", w.Code, w.Body.String())
	}
	var meRes map[string]any
	_ = json.Unmarshal(w.Body.Bytes(), &meRes)
	if meRes["role"] != "admin" {
		t.Fatalf("expected admin role, got %v", meRes["role"])
	}

	// 2. Test /api/v1/wards listing
	w = call(router, "GET", "/api/v1/wards", "", adminToken)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 for /wards, got %d: %s", w.Code, w.Body.String())
	}

	// 3. Test /api/v1/wards creation
	wardBody := `{"id":"ward-icu","name":"แผนก ICU","timezone":"Asia/Bangkok","description":"หอผู้ป่วยวิกฤต"}`
	w = call(router, "POST", "/api/v1/wards", wardBody, adminToken)
	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201 for /wards creation, got %d: %s", w.Code, w.Body.String())
	}

	// 4. Test /api/v1/wards status toggle
	statusBody := `{"isActive":false}`
	w = call(router, "PATCH", "/api/v1/wards/ward-icu/status", statusBody, adminToken)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 for /wards status toggle, got %d: %s", w.Code, w.Body.String())
	}
}
