package httpapi_test

import (
	"encoding/json"
	"net/http"
	"testing"
)

func TestWorkflowTransitions(t *testing.T) {
	h, m := setup()

	// Initial status is draft
	if m.R.Status != "draft" {
		t.Fatalf("expected initial status draft, got %s", m.R.Status)
	}

	// 1. Submit review when status is draft should fail (needs generated or valid transition)
	w := call(h, "POST", "/api/v1/schedules/1/submit-review", `{}`, headToken)
	if w.Code != http.StatusConflict {
		t.Fatalf("expected 409 conflict when submitting from draft, got %d", w.Code)
	}

	// 2. Set status to generated (e.g. after solver/manual)
	m.R.Status = "generated"

	// 3. Submit for review -> under_review
	w = call(h, "POST", "/api/v1/schedules/1/submit-review", `{}`, headToken)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 on submit-review, got %d: %s", w.Code, w.Body.String())
	}
	if m.R.Status != "under_review" {
		t.Fatalf("expected status under_review, got %s", m.R.Status)
	}

	// 4. Revise schedule with reason -> sends back to generated
	w = call(h, "POST", "/api/v1/schedules/1/revise", `{"reason":"กรุณาปรับเวรดึก"}`, headToken)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 on revise, got %d: %s", w.Code, w.Body.String())
	}
	if m.R.Status != "generated" {
		t.Fatalf("expected status generated after revise, got %s", m.R.Status)
	}

	// 5. Submit again -> under_review
	w = call(h, "POST", "/api/v1/schedules/1/submit-review", `{}`, headToken)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 on submit-review, got %d", w.Code)
	}

	// 6. Approve -> approved
	w = call(h, "POST", "/api/v1/schedules/1/approve", `{"note":"อนุมัติตารางเวร"}`, headToken)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 on approve, got %d: %s", w.Code, w.Body.String())
	}
	if m.R.Status != "approved" {
		t.Fatalf("expected status approved, got %s", m.R.Status)
	}

	// 7. Publish -> published
	w = call(h, "POST", "/api/v1/schedules/1/publish", `{}`, headToken)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 on publish, got %d: %s", w.Code, w.Body.String())
	}
	if m.R.Status != "published" {
		t.Fatalf("expected status published, got %s", m.R.Status)
	}

	// 8. Create new version from published
	w = call(h, "POST", "/api/v1/schedules/1/new-version", `{}`, headToken)
	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201 on new-version, got %d: %s", w.Code, w.Body.String())
	}

	// 9. Check audit log
	w = call(h, "GET", "/api/v1/schedules/1/audit-log", "", headToken)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 on audit-log, got %d", w.Code)
	}
	var auditResp struct {
		Data []map[string]any `json:"data"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &auditResp); err != nil {
		t.Fatal(err)
	}
	if len(auditResp.Data) == 0 {
		t.Fatal("expected audit log entries, got 0")
	}

	// 10. Check auth/me
	w = call(h, "GET", "/api/v1/auth/me", "", headToken)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 on auth/me, got %d", w.Code)
	}

	// 11. Close schedule -> closed
	w = call(h, "POST", "/api/v1/schedules/1/close", `{}`, headToken)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 on close, got %d: %s", w.Code, w.Body.String())
	}
	if m.R.Status != "closed" {
		t.Fatalf("expected status closed, got %s", m.R.Status)
	}

	// 12. Try to edit when closed -> 409 conflict
	w = call(h, "PUT", "/api/v1/schedules/1/assignments", `{"nurseId":"test-a","date":"2026-09-01","shiftCode":"ช","version":1}`, headToken)
	if w.Code != http.StatusConflict {
		t.Fatalf("expected 409 conflict when editing closed schedule, got %d", w.Code)
	}

	// 13. Reopen without reason should fail
	w = call(h, "POST", "/api/v1/schedules/1/reopen", `{"reason":"  "}`, headToken)
	if w.Code != http.StatusForbidden {
		t.Fatalf("expected 403 when reopening without valid reason, got %d", w.Code)
	}

	// 14. Reopen with valid reason -> published
	w = call(h, "POST", "/api/v1/schedules/1/reopen", `{"reason":"หัวหน้าขอแก้ไขยอดเงินเฉพาะกิจ"}`, headToken)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 on reopen, got %d: %s", w.Code, w.Body.String())
	}
	if m.R.Status != "published" {
		t.Fatalf("expected status published after reopen, got %s", m.R.Status)
	}

	// 15. Payroll Overrides APIs
	w = call(h, "GET", "/api/v1/schedules/1/payroll-overrides", "", headToken)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 on list payroll overrides, got %d", w.Code)
	}

	w = call(h, "POST", "/api/v1/schedules/1/payroll-overrides", `{"nurseId":"test-a","fieldName":"ot_pay","originalValue":800,"overrideValue":1200,"reason":"เพิ่มพิเศษตามมติ"}`, headToken)
	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201 on create payroll override, got %d: %s", w.Code, w.Body.String())
	}
}
