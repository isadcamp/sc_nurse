package httpapi_test

import (
	"encoding/json"
	"net/http"
	"testing"
)

func TestAIAnalysisAndSuggestions(t *testing.T) {
	h, _ := setup()

	// 1. Test GET /ai/status
	w := call(h, "GET", "/api/v1/ai/status", "", headToken)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 on /ai/status, got %d: %s", w.Code, w.Body.String())
	}

	// 2. Test POST /schedules/1/ai/analyze
	w = call(h, "POST", "/api/v1/schedules/1/ai/analyze", `{}`, headToken)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 on /ai/analyze, got %d: %s", w.Code, w.Body.String())
	}
	var analysisResp struct {
		Data map[string]any `json:"data"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &analysisResp); err != nil {
		t.Fatalf("unmarshal analysis: %v", err)
	}
	if analysisResp.Data["scheduleId"] == nil || analysisResp.Data["findings"] == nil {
		t.Fatalf("invalid analysis response: %v", analysisResp.Data)
	}

	// 3. Test GET /schedules/1/ai/analysis
	w = call(h, "GET", "/api/v1/schedules/1/ai/analysis", "", headToken)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 on GET /ai/analysis, got %d", w.Code)
	}

	// 4. Test POST /schedules/1/ai/suggest-swaps
	w = call(h, "POST", "/api/v1/schedules/1/ai/suggest-swaps", `{}`, headToken)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 on /ai/suggest-swaps, got %d", w.Code)
	}

	// 5. Test GET /schedules/1/ai/suggestions
	w = call(h, "GET", "/api/v1/schedules/1/ai/suggestions", "", headToken)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 on GET /ai/suggestions, got %d", w.Code)
	}

	// 6. Test POST /schedules/compare
	w = call(h, "POST", "/api/v1/schedules/compare", `{"baseId":1,"compareId":1}`, headToken)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 on /schedules/compare, got %d: %s", w.Code, w.Body.String())
	}
}
