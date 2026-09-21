package httpapi_test

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"nurse-scheduler/backend/internal/httpapi"
	"nurse-scheduler/backend/internal/service"
	"nurse-scheduler/backend/internal/testfixture"
	"strings"
	"testing"
)

const headToken = "synthetic-head-token-for-tests-only"

func setup() (http.Handler, *testfixture.Memory) {
	m := &testfixture.Memory{R: testfixture.Roster()}
	rosterSvc := &service.RosterService{Store: m}
	return httpapi.NewRouter(httpapi.Services{
		Roster:      rosterSvc,
		AI:          service.NewAIService(rosterSvc),
		Credentials: []httpapi.Credential{{Token: headToken, ID: "test-head", Role: "head", Wards: []string{"test-ward"}}, {Token: "synthetic-viewer-token-tests-only", ID: "test-viewer", Role: "viewer", Wards: []string{"test-ward"}}},
	}, "http://localhost:3000"), m
}
func call(h http.Handler, method, path, body, token string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(method, path, strings.NewReader(body))
	r.Header.Set("Content-Type", "application/json")
	if token != "" {
		r.Header.Set("Authorization", "Bearer "+token)
	}
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	return w
}
func TestHealth(t *testing.T) {
	h, _ := setup()
	if w := call(h, "GET", "/health", "", ""); w.Code != 200 {
		t.Fatal(w.Code)
	}
}
func TestEditCheckLockUnlockAndAudit(t *testing.T) {
	h, m := setup()
	body := `{"nurseId":"test-a","date":"2026-09-09","shiftCode":"ช","version":0,"reason":"","override":false}`
	for _, p := range []struct {
		method, path, body string
		status             int
	}{
		{"POST", "/api/v1/schedules/1/assignments/0/check", body, 200},
		{"PUT", "/api/v1/schedules/1/assignments", body, 200},
		{"PUT", "/api/v1/schedules/1/assignments", body, 409},
		{"PUT", "/api/v1/schedules/1/assignments/1/lock", `{"version":1,"reason":"ยืนยันเวร"}`, 200},
		{"PUT", "/api/v1/schedules/1/assignments", strings.Replace(body, `"version":0`, `"version":2`, 1), 403},
		{"PUT", "/api/v1/schedules/1/assignments/1/unlock", `{"version":2,"reason":"แก้ตาราง"}`, 200},
		{"GET", "/api/v1/schedules/1/boundary-data", "", 200},
		{"POST", "/api/v1/schedules/1/validate", "", 200},
		{"GET", "/api/v1/schedules/1/violations", "", 200},
		{"GET", "/api/v1/wards/test-ward/schedules?month=9&year=2026", "", 200},
	} {
		w := call(h, p.method, p.path, p.body, headToken)
		if w.Code != p.status {
			t.Fatalf("%s expected %d got %d %s", p.path, p.status, w.Code, w.Body.String())
		}
		if !strings.Contains(w.Header().Get("Content-Type"), "application/json") {
			t.Fatal("content type")
		}
	}
	if len(m.Audits) != 3 || m.Audits[0].Action != "edit" || m.Audits[1].Action != "lock" || m.Audits[2].Action != "unlock" {
		t.Fatalf("%+v", m.Audits)
	}
}
func TestMalformedAndForbiddenRequests(t *testing.T) {
	for _, tc := range []struct {
		name, body, token string
		want              int
	}{
		{"no auth", "{}", "", 401}, {"viewer", `{"wardId":"test-ward","month":10,"year":2026}`, "synthetic-viewer-token-tests-only", 403},
		{"malformed", "{", headToken, 400}, {"unknown", `{"unknown":true}`, headToken, 400}, {"trailing", "{} {}", headToken, 400}, {"huge", `{"wardId":"` + strings.Repeat("x", 66000) + `"}`, headToken, 400},
		{"range", `{"wardId":"test-ward","month":13,"year":2026}`, headToken, 422}, {"other ward", `{"wardId":"other","month":9,"year":2026}`, headToken, 403},
		{"missing", "{}", headToken, 403},
	} {
		t.Run(tc.name, func(t *testing.T) {
			h, _ := setup()
			w := call(h, "POST", "/api/v1/schedules", tc.body, tc.token)
			if w.Code != tc.want {
				t.Fatalf("%d %s", w.Code, w.Body.String())
			}
		})
	}
	h, _ := setup()
	r := httptest.NewRequest("POST", "/api/v1/schedules", strings.NewReader("{}"))
	r.Header.Set("Authorization", "Bearer "+headToken)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != 415 {
		t.Fatal(w.Code)
	}
}
func TestHardBlockedSoftAllowedAndOverride(t *testing.T) {
	h, m := setup()
	m.R.Policy.MaxMonthlyHours = 4
	body := `{"nurseId":"test-a","date":"2026-09-09","shiftCode":"ช","version":0,"reason":"","override":false}`
	w := call(h, "PUT", "/api/v1/schedules/1/assignments", body, headToken)
	if w.Code != 422 || len(m.R.Assignments) != 0 || len(m.Audits) != 0 {
		t.Fatalf("%d %s", w.Code, w.Body.String())
	}
	body = strings.Replace(body, `"reason":"","override":false`, `"reason":"อนุมัติกรณีพิเศษ","override":true`, 1)
	w = call(h, "PUT", "/api/v1/schedules/1/assignments", body, headToken)
	if w.Code != 200 || m.Audits[0].Action != "override" {
		t.Fatalf("%d %s", w.Code, w.Body.String())
	}
	h, m = setup()
	m.R.Policy.FairnessHours = 0
	body = strings.Replace(body, `"override":true`, `"override":false`, 1)
	w = call(h, "PUT", "/api/v1/schedules/1/assignments", body, headToken)
	if w.Code != 200 {
		t.Fatalf("%d %s", w.Code, w.Body.String())
	}
	var result map[string]json.RawMessage
	if e := json.Unmarshal(w.Body.Bytes(), &result); e != nil || result["schedule"] == nil || result["report"] == nil {
		t.Fatal("contract")
	}
}
func TestCalendarDates(t *testing.T) {
	for _, d := range []string{"2026-09-31", "2026-10-01", "not-a-date"} {
		h, _ := setup()
		body := fmt.Sprintf(`{"nurseId":"test-a","date":%q,"shiftCode":"ช","version":0}`, d)
		w := call(h, "PUT", "/api/v1/schedules/1/assignments", body, headToken)
		if w.Code != 422 {
			t.Fatalf("%s %d", d, w.Code)
		}
	}
}
