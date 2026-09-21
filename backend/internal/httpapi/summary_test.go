package httpapi_test

import (
	"encoding/json"
	"net/http"
	"testing"
)

func TestSummaryAndExcelExport(t *testing.T) {
	h, _ := setup()

	// 1. Test GET /summary
	w := call(h, "GET", "/api/v1/schedules/1/summary", "", headToken)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 on /summary, got %d: %s", w.Code, w.Body.String())
	}
	var sumResp struct {
		Data map[string]any `json:"data"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &sumResp); err != nil {
		t.Fatalf("unmarshal summary: %v", err)
	}
	if sumResp.Data["scheduleId"] == nil || sumResp.Data["totals"] == nil {
		t.Fatalf("invalid summary response structure: %v", sumResp.Data)
	}

	// 2. Test GET /daily-staffing
	w = call(h, "GET", "/api/v1/schedules/1/daily-staffing", "", headToken)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 on /daily-staffing, got %d: %s", w.Code, w.Body.String())
	}
	var dailyResp struct {
		Data []map[string]any `json:"data"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &dailyResp); err != nil {
		t.Fatalf("unmarshal daily-staffing: %v", err)
	}
	if len(dailyResp.Data) == 0 {
		t.Fatalf("expected daily staffing entries, got 0")
	}

	// 3. Test GET /nurse-stats
	w = call(h, "GET", "/api/v1/schedules/1/nurse-stats", "", headToken)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 on /nurse-stats, got %d: %s", w.Code, w.Body.String())
	}

	// 4. Test GET /export/xlsx
	w = call(h, "GET", "/api/v1/schedules/1/export/xlsx", "", headToken)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 on /export/xlsx, got %d: %s", w.Code, w.Body.String())
	}
	ct := w.Header().Get("Content-Type")
	if ct != "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" {
		t.Fatalf("expected Excel Content-Type, got %s", ct)
	}
	if len(w.Body.Bytes()) < 1000 {
		t.Fatalf("excel output too small: %d bytes", len(w.Body.Bytes()))
	}
}
