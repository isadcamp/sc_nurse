package httpapi

import (
	"fmt"
	"net/http"
	"nurse-scheduler/backend/internal/service"
)

func (a *API) getScheduleSummary(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	summary, err := a.services.Roster.Summary(r.Context(), id, actor(r))
	if err != nil {
		fail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": summary})
}

func (a *API) getDailyStaffing(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	summary, err := a.services.Roster.Summary(r.Context(), id, actor(r))
	if err != nil {
		fail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": summary.DailyStaffing})
}

func (a *API) getNurseStats(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	summary, err := a.services.Roster.Summary(r.Context(), id, actor(r))
	if err != nil {
		fail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": summary.NurseStats})
}

func (a *API) exportExcel(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	roster, err := a.services.Roster.Get(r.Context(), id, actor(r))
	if err != nil {
		fail(w, err)
		return
	}
	summary := service.ComputeSummary(roster)
	excelBytes, err := service.GenerateExcel(roster, summary)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "export_error", "สร้างไฟล์ Excel ไม่สำเร็จ")
		return
	}

	filename := fmt.Sprintf("schedule_%s_%04d_%02d_v%d.xlsx", roster.WardID, roster.Year, roster.Month, roster.Version)
	w.Header().Set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filename))
	w.Header().Set("Content-Length", fmt.Sprintf("%d", len(excelBytes)))
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(excelBytes)
}
