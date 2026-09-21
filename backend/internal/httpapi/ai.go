package httpapi

import (
	"net/http"
	"nurse-scheduler/backend/internal/domain"
	"strconv"
)

func (a *API) aiRoutes(mux *http.ServeMux) {
	mux.HandleFunc("POST /api/v1/schedules/{id}/ai/analyze", a.aiAnalyze)
	mux.HandleFunc("GET /api/v1/schedules/{id}/ai/analysis", a.aiGetAnalysis)
	mux.HandleFunc("POST /api/v1/schedules/{id}/ai/suggest-swaps", a.aiSuggestSwaps)
	mux.HandleFunc("GET /api/v1/schedules/{id}/ai/suggestions", a.aiGetSuggestions)
	mux.HandleFunc("POST /api/v1/ai/suggestions/{id}/accept", a.aiAcceptSuggestion)
	mux.HandleFunc("POST /api/v1/ai/suggestions/{id}/reject", a.aiRejectSuggestion)
	mux.HandleFunc("POST /api/v1/schedules/compare", a.aiCompareDrafts)
	mux.HandleFunc("GET /api/v1/ai/status", a.aiStatus)
}

func (a *API) aiStatus(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"enabled": true,
		"engine":  "rule-based-ai-reasoning",
		"status":  "ready",
		"version": "1.0.0",
	})
}

func (a *API) aiAnalyze(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	if a.services.AI == nil {
		writeError(w, http.StatusServiceUnavailable, "ai_unavailable", "บริการ AI ไม่พร้อมใช้งาน")
		return
	}

	analysis, err := a.services.AI.Analyze(r.Context(), id, domain.AnalysisOverview, actor(r))
	if err != nil {
		fail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": analysis})
}

func (a *API) aiGetAnalysis(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	if a.services.AI == nil {
		writeError(w, http.StatusServiceUnavailable, "ai_unavailable", "บริการ AI ไม่พร้อมใช้งาน")
		return
	}

	analysis, err := a.services.AI.GetAnalysis(r.Context(), id, actor(r))
	if err != nil {
		fail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": analysis})
}

func (a *API) aiSuggestSwaps(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	if a.services.AI == nil {
		writeError(w, http.StatusServiceUnavailable, "ai_unavailable", "บริการ AI ไม่พร้อมใช้งาน")
		return
	}

	analysis, err := a.services.AI.Analyze(r.Context(), id, domain.AnalysisSuggestion, actor(r))
	if err != nil {
		fail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": analysis.Suggestions})
}

func (a *API) aiGetSuggestions(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	if a.services.AI == nil {
		writeError(w, http.StatusServiceUnavailable, "ai_unavailable", "บริการ AI ไม่พร้อมใช้งาน")
		return
	}

	analysis, err := a.services.AI.GetAnalysis(r.Context(), id, actor(r))
	if err != nil {
		fail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": analysis.Suggestions, "isStale": analysis.IsStale})
}

func (a *API) aiAcceptSuggestion(w http.ResponseWriter, r *http.Request) {
	sugID := r.PathValue("id")
	scheduleIDStr := r.URL.Query().Get("scheduleId")
	scheduleID, _ := strconv.ParseInt(scheduleIDStr, 10, 64)

	if scheduleID == 0 {
		var in struct {
			ScheduleID int64 `json:"scheduleId"`
		}
		if decode(w, r, &in) && in.ScheduleID != 0 {
			scheduleID = in.ScheduleID
		}
	}

	if scheduleID == 0 {
		writeError(w, http.StatusBadRequest, "invalid_input", "กรุณาระบุ scheduleId")
		return
	}
	if a.services.AI == nil {
		writeError(w, http.StatusServiceUnavailable, "ai_unavailable", "บริการ AI ไม่พร้อมใช้งาน")
		return
	}

	roster, err := a.services.AI.AcceptSuggestion(r.Context(), scheduleID, sugID, actor(r))
	if err != nil {
		fail(w, err)
		return
	}
	rosterResult(w, http.StatusOK, roster)
}

func (a *API) aiRejectSuggestion(w http.ResponseWriter, r *http.Request) {
	sugID := r.PathValue("id")
	scheduleIDStr := r.URL.Query().Get("scheduleId")
	scheduleID, _ := strconv.ParseInt(scheduleIDStr, 10, 64)

	if scheduleID == 0 {
		var in struct {
			ScheduleID int64 `json:"scheduleId"`
		}
		if decode(w, r, &in) && in.ScheduleID != 0 {
			scheduleID = in.ScheduleID
		}
	}

	if scheduleID == 0 {
		writeError(w, http.StatusBadRequest, "invalid_input", "กรุณาระบุ scheduleId")
		return
	}
	if a.services.AI == nil {
		writeError(w, http.StatusServiceUnavailable, "ai_unavailable", "บริการ AI ไม่พร้อมใช้งาน")
		return
	}

	if err := a.services.AI.RejectSuggestion(r.Context(), scheduleID, sugID); err != nil {
		fail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"status": "rejected", "id": sugID})
}

func (a *API) aiCompareDrafts(w http.ResponseWriter, r *http.Request) {
	var in struct {
		BaseID    int64 `json:"baseId"`
		CompareID int64 `json:"compareId"`
	}
	if !decode(w, r, &in) {
		return
	}
	if in.BaseID == 0 || in.CompareID == 0 {
		writeError(w, http.StatusBadRequest, "invalid_input", "กรุณาระบุ baseId และ compareId")
		return
	}
	if a.services.AI == nil {
		writeError(w, http.StatusServiceUnavailable, "ai_unavailable", "บริการ AI ไม่พร้อมใช้งาน")
		return
	}

	comp, err := a.services.AI.CompareDrafts(r.Context(), in.BaseID, in.CompareID, actor(r))
	if err != nil {
		fail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": comp})
}
