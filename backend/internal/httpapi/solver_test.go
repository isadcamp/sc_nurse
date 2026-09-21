package httpapi_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"nurse-scheduler/backend/internal/domain"
	"nurse-scheduler/backend/internal/httpapi"
	"nurse-scheduler/backend/internal/scheduler"
	"nurse-scheduler/backend/internal/service"
	"nurse-scheduler/backend/internal/testfixture"
	"strings"
	"testing"
	"time"
)

func solverSetup() (http.Handler, *testfixture.Memory) {
	r := testfixture.Roster()
	r = testfixture.ReadyRoster(r)
	// Fill assignments so readiness passes
	start := time.Date(2026, 9, 1, 0, 0, 0, 0, time.UTC)
	end := time.Date(2026, 10, 1, 0, 0, 0, 0, time.UTC)
	for d := start; d.Before(end); d = d.AddDate(0, 0, 1) {
		for _, n := range r.Staff {
			r.Assignments = append(r.Assignments, testfixture.Cell(d.Format("2006-01-02"), "X"))
			r.Assignments[len(r.Assignments)-1].NurseID = n.ID
		}
	}
	m := &testfixture.Memory{R: r}
	rosterSvc := &service.RosterService{Store: m}
	jobs := testfixture.NewSolverStore()
	solverSvc := &service.SolverService{Roster: rosterSvc, Jobs: jobs, Solver: scheduler.ConstraintSolver{}}
	return httpapi.NewRouter(httpapi.Services{
		Roster:      rosterSvc,
		Solver:      solverSvc,
		AI:          service.NewAIService(rosterSvc),
		Credentials: []httpapi.Credential{{Token: headToken, ID: "test-head", Role: "head", Wards: []string{"test-ward"}}, {Token: "synthetic-viewer-token-tests-only", ID: "test-viewer", Role: "viewer", Wards: []string{"test-ward"}}},
	}, "http://localhost:3000"), m
}

func TestReadinessCheckReady(t *testing.T) {
	h, _ := solverSetup()
	w := call(h, "POST", "/api/v1/schedules/1/readiness-check", `{"simulation":false}`, headToken)
	if w.Code != 200 {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var report struct {
		Ready         bool   `json:"ready"`
		Revision      string `json:"revision"`
		PolicyVersion string `json:"policyVersion"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &report); err != nil {
		t.Fatal(err)
	}
	if !report.Ready {
		t.Fatalf("expected ready=true, got report: %s", w.Body.String())
	}
	if report.Revision == "" {
		t.Fatal("revision must not be empty")
	}
	if report.PolicyVersion == "" {
		t.Fatal("policyVersion must not be empty")
	}
}

func TestReadinessCheckNotReady(t *testing.T) {
	h, m := solverSetup()
	m.R.Policy.Status = "draft" // not confirmed
	w := call(h, "POST", "/api/v1/schedules/1/readiness-check", `{"simulation":false}`, headToken)
	if w.Code != 200 {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	var report struct {
		Ready  bool `json:"ready"`
		Issues []struct {
			Code    string `json:"code"`
			Field   string `json:"field"`
			FixPath string `json:"fixPath"`
		} `json:"issues"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &report); err != nil {
		t.Fatal(err)
	}
	if report.Ready {
		t.Fatal("expected ready=false with draft policy")
	}
	found := false
	for _, issue := range report.Issues {
		if issue.Code == "POLICY_NOT_CONFIRMED" {
			found = true
			if issue.Field == "" || issue.FixPath == "" {
				t.Error("issue must have field and fixPath")
			}
		}
	}
	if !found {
		t.Error("expected POLICY_NOT_CONFIRMED issue")
	}
}

func TestReadinessSimulationAllowsDraftPolicy(t *testing.T) {
	h, m := solverSetup()
	m.R.Policy.Status = "draft"
	w := call(h, "POST", "/api/v1/schedules/1/readiness-check", `{"simulation":true}`, headToken)
	if w.Code != 200 {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	var report struct {
		Issues []struct{ Code string } `json:"issues"`
	}
	json.Unmarshal(w.Body.Bytes(), &report)
	for _, issue := range report.Issues {
		if issue.Code == "POLICY_NOT_CONFIRMED" {
			t.Error("simulation should not flag POLICY_NOT_CONFIRMED")
		}
	}
}

func TestReadinessRequiresAuth(t *testing.T) {
	h, _ := solverSetup()
	w := call(h, "POST", "/api/v1/schedules/1/readiness-check", `{"simulation":false}`, "")
	if w.Code != 401 {
		t.Fatalf("expected 401, got %d", w.Code)
	}
}

func TestStartGenerateAndPollJob(t *testing.T) {
	h, _ := solverSetup()
	// Get readiness first to obtain revision
	w := call(h, "POST", "/api/v1/schedules/1/readiness-check", `{"simulation":false}`, headToken)
	var report struct {
		Revision      string `json:"revision"`
		PolicyVersion string `json:"policyVersion"`
	}
	json.Unmarshal(w.Body.Bytes(), &report)

	body := `{"wardId":"test-ward","month":9,"year":2026,"revision":"` + report.Revision + `","policyVersion":"` + report.PolicyVersion + `","scope":{},"seed":1}`
	w = call(h, "POST", "/api/v1/schedules/1/generate", body, headToken)
	if w.Code != 202 {
		t.Fatalf("expected 202, got %d: %s", w.Code, w.Body.String())
	}
	var job struct {
		ID     string `json:"id"`
		Status string `json:"status"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &job); err != nil {
		t.Fatal(err)
	}
	if job.ID == "" {
		t.Fatal("job ID must not be empty")
	}

	// Poll job status (may still be pending/running)
	time.Sleep(500 * time.Millisecond)
	w = call(h, "GET", "/api/v1/jobs/"+job.ID, "", headToken)
	if w.Code != 200 {
		t.Fatalf("expected 200 on GET job, got %d: %s", w.Code, w.Body.String())
	}
}

func TestStartSimulate(t *testing.T) {
	h, m := solverSetup()
	m.R.Policy.Status = "draft" // simulation allows draft
	w := call(h, "POST", "/api/v1/schedules/1/readiness-check", `{"simulation":true}`, headToken)
	var report struct {
		Ready         bool   `json:"ready"`
		Revision      string `json:"revision"`
		PolicyVersion string `json:"policyVersion"`
	}
	json.Unmarshal(w.Body.Bytes(), &report)
	if !report.Ready {
		t.Fatalf("expected ready for simulation, body: %s", w.Body.String())
	}

	body := `{"wardId":"test-ward","month":9,"year":2026,"revision":"` + report.Revision + `","policyVersion":"` + report.PolicyVersion + `","scope":{},"seed":1}`
	w = call(h, "POST", "/api/v1/schedules/1/simulate", body, headToken)
	if w.Code != 202 {
		t.Fatalf("expected 202, got %d: %s", w.Code, w.Body.String())
	}
}

func TestStartWithStaleRevisionFails(t *testing.T) {
	h, _ := solverSetup()
	body := `{"wardId":"test-ward","month":9,"year":2026,"revision":"stale-hash","policyVersion":"wrong","scope":{},"seed":1}`
	w := call(h, "POST", "/api/v1/schedules/1/generate", body, headToken)
	if w.Code != 409 {
		t.Fatalf("expected 409 conflict for stale revision, got %d: %s", w.Code, w.Body.String())
	}
}

func TestStartNotReadyReturns422(t *testing.T) {
	h, m := solverSetup()
	m.R.Staff = []domain.Staff{} // This will make readiness fail
	// Instead, remove staffing to trigger readiness failure
	m.R.Policy.Staffing = nil
	w := call(h, "POST", "/api/v1/schedules/1/readiness-check", `{"simulation":false}`, headToken)
	var report struct {
		Ready         bool   `json:"ready"`
		Revision      string `json:"revision"`
		PolicyVersion string `json:"policyVersion"`
	}
	json.Unmarshal(w.Body.Bytes(), &report)

	// Try to start with the revision — should fail because not ready
	body := `{"wardId":"test-ward","month":9,"year":2026,"revision":"` + report.Revision + `","policyVersion":"` + report.PolicyVersion + `","scope":{},"seed":1}`
	w = call(h, "POST", "/api/v1/schedules/1/generate", body, headToken)
	if w.Code != 422 {
		t.Fatalf("expected 422 for not-ready, got %d: %s", w.Code, w.Body.String())
	}
}

func TestCancelNonExistentJob(t *testing.T) {
	h, _ := solverSetup()
	w := call(h, "DELETE", "/api/v1/jobs/nonexistent", "", headToken)
	if w.Code != 404 {
		t.Fatalf("expected 404, got %d", w.Code)
	}
}

func TestApplyNonExistentJob(t *testing.T) {
	h, _ := solverSetup()
	w := call(h, "POST", "/api/v1/jobs/nonexistent/apply", `{}`, headToken)
	if w.Code != 404 {
		t.Fatalf("expected 404, got %d", w.Code)
	}
}

func TestGetJobRequiresAuth(t *testing.T) {
	h, _ := solverSetup()
	w := call(h, "GET", "/api/v1/jobs/test-job", "", "")
	if w.Code != 401 {
		t.Fatalf("expected 401, got %d", w.Code)
	}
}

func TestViewerCanReadReadiness(t *testing.T) {
	h, _ := solverSetup()
	w := call(h, "POST", "/api/v1/schedules/1/readiness-check", `{"simulation":false}`, "synthetic-viewer-token-tests-only")
	if w.Code != 200 {
		t.Fatalf("viewer should be able to read readiness, got %d", w.Code)
	}
}

func TestViewerCannotStartGenerate(t *testing.T) {
	h, _ := solverSetup()
	// Get revision first
	w := call(h, "POST", "/api/v1/schedules/1/readiness-check", `{"simulation":false}`, "synthetic-viewer-token-tests-only")
	var report struct {
		Revision      string `json:"revision"`
		PolicyVersion string `json:"policyVersion"`
	}
	json.Unmarshal(w.Body.Bytes(), &report)

	body := `{"wardId":"test-ward","month":9,"year":2026,"revision":"` + report.Revision + `","policyVersion":"` + report.PolicyVersion + `","scope":{},"seed":1}`
	w = call(h, "POST", "/api/v1/schedules/1/generate", body, "synthetic-viewer-token-tests-only")
	if w.Code != 403 {
		t.Fatalf("expected 403 for viewer, got %d", w.Code)
	}
}

func TestSolverScore(t *testing.T) {
	h, _ := solverSetup()
	w := call(h, "GET", "/api/v1/schedules/1/score", "", headToken)
	if w.Code != 200 {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var score struct {
		Total float64 `json:"total"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &score); err != nil {
		t.Fatal(err)
	}
}

func TestSolverSnapshot(t *testing.T) {
	h, _ := solverSetup()
	w := call(h, "GET", "/api/v1/schedules/1/snapshot", "", headToken)
	if w.Code != 200 {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var snap struct {
		Hash          string `json:"hash"`
		SchemaVersion int    `json:"schemaVersion"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &snap); err != nil {
		t.Fatal(err)
	}
	if snap.Hash == "" {
		t.Fatal("snapshot hash must not be empty")
	}
}

func TestSolverFullJourney(t *testing.T) {
	h, _ := solverSetup()
	// 1. Readiness check
	w := call(h, "POST", "/api/v1/schedules/1/readiness-check", `{"simulation":false}`, headToken)
	if w.Code != 200 {
		t.Fatalf("readiness: %d %s", w.Code, w.Body.String())
	}
	var report struct {
		Ready         bool   `json:"ready"`
		Revision      string `json:"revision"`
		PolicyVersion string `json:"policyVersion"`
	}
	json.Unmarshal(w.Body.Bytes(), &report)
	if !report.Ready {
		t.Fatalf("expected ready: %s", w.Body.String())
	}

	// 2. Start AUTO
	body := `{"wardId":"test-ward","month":9,"year":2026,"revision":"` + report.Revision + `","policyVersion":"` + report.PolicyVersion + `","scope":{},"seed":42}`
	w = call(h, "POST", "/api/v1/schedules/1/generate", body, headToken)
	if w.Code != 202 {
		t.Fatalf("start: %d %s", w.Code, w.Body.String())
	}
	var job struct {
		ID     string `json:"id"`
		Status string `json:"status"`
	}
	json.Unmarshal(w.Body.Bytes(), &job)

	// 3. Poll until done (max 15 sec)
	deadline := time.Now().Add(15 * time.Second)
	for time.Now().Before(deadline) {
		time.Sleep(300 * time.Millisecond)
		w = call(h, "GET", "/api/v1/jobs/"+job.ID, "", headToken)
		json.Unmarshal(w.Body.Bytes(), &job)
		if job.Status == "completed" || job.Status == "failed" || job.Status == "cancelled" {
			break
		}
	}
	if job.Status != "completed" {
		t.Fatalf("expected completed, got %s", job.Status)
	}

	// 4. Parse result
	var fullJob struct {
		Result *struct {
			Status string `json:"status"`
		} `json:"result"`
		Stale bool `json:"stale"`
	}
	json.Unmarshal(w.Body.Bytes(), &fullJob)
	if fullJob.Result == nil {
		t.Fatal("expected result in completed job")
	}

	// 5. Apply if complete
	if fullJob.Result.Status == "complete" && !fullJob.Stale {
		w = call(h, "POST", "/api/v1/jobs/"+job.ID+"/apply", `{}`, headToken)
		if w.Code != 200 {
			t.Fatalf("apply: %d %s", w.Code, w.Body.String())
		}
		// Verify applied state persists — try to apply again should conflict
		w = call(h, "POST", "/api/v1/jobs/"+job.ID+"/apply", `{}`, headToken)
		if w.Code != 409 {
			t.Fatalf("double apply should be 409, got %d", w.Code)
		}
	}
}

func TestStartGenerateMalformedJSON(t *testing.T) {
	h, _ := solverSetup()
	w := call(h, "POST", "/api/v1/schedules/1/generate", "{invalid", headToken)
	if w.Code != 400 {
		t.Fatalf("expected 400 for malformed JSON, got %d", w.Code)
	}
}

func TestReadinessCheckMalformedJSON(t *testing.T) {
	h, _ := solverSetup()
	w := call(h, "POST", "/api/v1/schedules/1/readiness-check", "{invalid", headToken)
	if w.Code != 400 {
		t.Fatalf("expected 400, got %d", w.Code)
	}
}

// Ensure request without JSON content type is rejected.
func TestStartGenerateNoContentType(t *testing.T) {
	h, _ := solverSetup()
	r := httptest.NewRequest("POST", "/api/v1/schedules/1/generate", strings.NewReader(`{}`))
	r.Header.Set("Authorization", "Bearer "+headToken)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != 415 {
		t.Fatalf("expected 415 for missing content-type, got %d", w.Code)
	}
}

// Test applying a job that includes virtual part-time relief staff (e.g. PT-RN-1)
func TestApplyJobWithPartTimeReliefStaff(t *testing.T) {
	h, m := solverSetup()
	jobs := testfixture.NewSolverStore()
	solverSvc := &service.SolverService{Roster: &service.RosterService{Store: m}, Jobs: jobs, Solver: scheduler.ConstraintSolver{}}
	h = httpapi.NewRouter(httpapi.Services{
		Roster:      &service.RosterService{Store: m},
		Solver:      solverSvc,
		AI:          service.NewAIService(&service.RosterService{Store: m}),
		Credentials: []httpapi.Credential{{Token: headToken, ID: "test-head", Role: "head", Wards: []string{"test-ward"}}},
	}, "http://localhost:3000")

	// Create a completed job with virtual staff in assignments
	ptAssignments := []domain.Cell{
		{NurseID: "test-a", Date: "2026-09-01", ShiftCode: "ช", Version: 1},
		{NurseID: "PT-RN-1", Date: "2026-09-01", ShiftCode: "บ", Version: 1},
	}
	start := time.Date(2026, 9, 1, 0, 0, 0, 0, time.UTC)
	end := time.Date(2026, 10, 1, 0, 0, 0, 0, time.UTC)
	for d := start; d.Before(end); d = d.AddDate(0, 0, 1) {
		ds := d.Format("2006-01-02")
		if ds != "2026-09-01" {
			ptAssignments = append(ptAssignments, domain.Cell{NurseID: "test-a", Date: ds, ShiftCode: "X", Version: 1})
			ptAssignments = append(ptAssignments, domain.Cell{NurseID: "PT-RN-1", Date: ds, ShiftCode: "X", Version: 1})
		}
	}

	jobID := "test-pt-job-1"
	jobs.CreateJob(nil, domain.SolverJob{
		ID:         jobID,
		ScheduleID: 1,
		WardID:     "test-ward",
		ActorID:    "test-head",
		Status:     "completed",
		CreatedAt:  time.Now(),
		UpdatedAt:  time.Now(),
		Result: &domain.SolverOutput{
			Status:      "complete",
			Assignments: ptAssignments,
		},
	})

	// Call Apply endpoint
	w := call(h, "POST", "/api/v1/jobs/"+jobID+"/apply", `{}`, headToken)
	if w.Code != 200 {
		t.Fatalf("expected 200 on apply with PT staff, got %d: %s", w.Code, w.Body.String())
	}

	var res struct {
		Schedule struct {
			Staff []domain.Staff `json:"staff"`
		} `json:"schedule"`
		Report struct {
			CanSave bool `json:"canSave"`
		} `json:"report"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &res); err != nil {
		t.Fatal(err)
	}
	if !res.Report.CanSave {
		t.Errorf("expected report.canSave to be true")
	}
	foundPT := false
	for _, s := range res.Schedule.Staff {
		if s.ID == "PT-RN-1" {
			foundPT = true
			if !s.PartTime {
				t.Errorf("expected PT-RN-1 to have PartTime=true")
			}
		}
	}
	if !foundPT {
		t.Errorf("expected PT-RN-1 to be in applied schedule staff")
	}
}

func TestGenerateMultiEndpoint(t *testing.T) {
	h, _ := solverSetup()

	// Get readiness first to fetch valid revision & policyVersion
	wReady := call(h, "POST", "/api/v1/schedules/1/readiness-check", `{"simulation":false}`, headToken)
	if wReady.Code != 200 {
		t.Fatalf("expected 200 on readiness-check, got %d: %s", wReady.Code, wReady.Body.String())
	}
	var report struct {
		Revision      string `json:"revision"`
		PolicyVersion string `json:"policyVersion"`
	}
	_ = json.Unmarshal(wReady.Body.Bytes(), &report)

	body, _ := json.Marshal(map[string]any{
		"wardId":        "test-ward",
		"month":         9,
		"year":          2026,
		"revision":      report.Revision,
		"policyVersion": report.PolicyVersion,
		"seed":          12345,
	})

	w := call(h, "POST", "/api/v1/schedules/1/generate-multi", string(body), headToken)
	if w.Code != 200 {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var res domain.MultiPlanResponse
	if err := json.Unmarshal(w.Body.Bytes(), &res); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if len(res.Plans) != 3 {
		t.Fatalf("expected 3 alternative plans, got %d", len(res.Plans))
	}

	expectedProfiles := []string{"coverage_first", "balanced", "rest_focused"}
	for i, plan := range res.Plans {
		if plan.Profile != expectedProfiles[i] {
			t.Errorf("plan %d: expected profile %s, got %s", i, expectedProfiles[i], plan.Profile)
		}
		if plan.JobID == "" {
			t.Errorf("plan %d: expected non-empty jobId", i)
		}
		if plan.Metrics.FairnessScore <= 0 {
			t.Errorf("plan %d: expected positive fairnessScore", i)
		}
	}
}

