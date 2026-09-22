package httpapi

import (
	"net/http"
	"nurse-scheduler/backend/internal/domain"
	"strings"
	"unicode/utf8"
)

func (a *API) submitReview(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	if e := a.services.Roster.SubmitReview(r.Context(), id, actor(r)); e != nil {
		fail(w, e)
		return
	}
	out, e := a.services.Roster.Get(r.Context(), id, actor(r))
	if e != nil {
		fail(w, e)
		return
	}
	rosterResult(w, 200, out)
}

func (a *API) approveSchedule(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	var in struct {
		Note string `json:"note"`
	}
	if !decode(w, r, &in) {
		return
	}
	if e := a.services.Roster.Approve(r.Context(), id, actor(r), in.Note); e != nil {
		fail(w, e)
		return
	}
	out, e := a.services.Roster.Get(r.Context(), id, actor(r))
	if e != nil {
		fail(w, e)
		return
	}
	rosterResult(w, 200, out)
}

func (a *API) reviseSchedule(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	var in struct {
		Reason string `json:"reason"`
	}
	if !decode(w, r, &in) {
		return
	}
	if e := a.services.Roster.Revise(r.Context(), id, actor(r), in.Reason); e != nil {
		fail(w, e)
		return
	}
	out, e := a.services.Roster.Get(r.Context(), id, actor(r))
	if e != nil {
		fail(w, e)
		return
	}
	rosterResult(w, 200, out)
}

func (a *API) publishSchedule(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	if e := a.services.Roster.Publish(r.Context(), id, actor(r)); e != nil {
		fail(w, e)
		return
	}
	out, e := a.services.Roster.Get(r.Context(), id, actor(r))
	if e != nil {
		fail(w, e)
		return
	}
	rosterResult(w, 200, out)
}

func (a *API) unpublishSchedule(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	var in struct {
		Reason string `json:"reason"`
	}
	if !decode(w, r, &in) {
		return
	}
	if utf8.RuneCountInString(strings.TrimSpace(in.Reason)) < 5 {
		writeError(w, 422, "invalid_input", "กรุณาระบุเหตุผลการยกเลิกอย่างน้อย 5 ตัวอักษร")
		return
	}
	if e := a.services.Roster.Unpublish(r.Context(), id, actor(r), in.Reason); e != nil {
		fail(w, e)
		return
	}
	out, e := a.services.Roster.Get(r.Context(), id, actor(r))
	if e != nil {
		fail(w, e)
		return
	}
	rosterResult(w, 200, out)
}

func (a *API) deleteSchedule(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	if e := a.services.Roster.Delete(r.Context(), id, actor(r)); e != nil {
		fail(w, e)
		return
	}
	writeJSON(w, 200, map[string]any{"status": "ok", "deletedId": id})
}

func (a *API) newVersion(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	out, e := a.services.Roster.NewVersion(r.Context(), id, actor(r))
	if e != nil {
		fail(w, e)
		return
	}
	rosterResult(w, 201, out)
}

func (a *API) listVersions(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	versions, e := a.services.Roster.ListVersions(r.Context(), id, actor(r))
	if e != nil {
		fail(w, e)
		return
	}
	data := make([]map[string]any, 0, len(versions))
	for _, v := range versions {
		data = append(data, map[string]any{"id": v.ID, "wardId": v.WardID, "month": v.Month, "year": v.Year, "status": v.Status, "version": v.Version})
	}
	writeJSON(w, 200, map[string]any{"data": data})
}

func (a *API) compareVersions(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	compareID, ok := pathID(w, r, "compareId")
	if !ok {
		return
	}
	diff, e := a.services.Roster.CompareVersions(r.Context(), id, compareID, actor(r))
	if e != nil {
		fail(w, e)
		return
	}
	writeJSON(w, 200, diff)
}

func (a *API) closeSchedule(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	if e := a.services.Roster.Close(r.Context(), id, actor(r)); e != nil {
		fail(w, e)
		return
	}
	out, e := a.services.Roster.Get(r.Context(), id, actor(r))
	if e != nil {
		fail(w, e)
		return
	}
	rosterResult(w, 200, out)
}

func (a *API) reopenSchedule(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	var in struct {
		Reason string `json:"reason"`
	}
	if !decode(w, r, &in) {
		return
	}
	if e := a.services.Roster.Reopen(r.Context(), id, actor(r), in.Reason); e != nil {
		fail(w, e)
		return
	}
	out, e := a.services.Roster.Get(r.Context(), id, actor(r))
	if e != nil {
		fail(w, e)
		return
	}
	rosterResult(w, 200, out)
}

func (a *API) listPayrollOverrides(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	list, e := a.services.Roster.ListPayrollOverrides(r.Context(), id, actor(r))
	if e != nil {
		fail(w, e)
		return
	}
	writeJSON(w, 200, map[string]any{"data": list})
}

func (a *API) createPayrollOverride(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	var in domain.PayrollOverride
	if !decode(w, r, &in) {
		return
	}
	in.ScheduleID = id
	out, e := a.services.Roster.SavePayrollOverride(r.Context(), in, actor(r))
	if e != nil {
		fail(w, e)
		return
	}
	writeJSON(w, 201, map[string]any{"data": out})
}

func (a *API) deletePayrollOverride(w http.ResponseWriter, r *http.Request) {
	scheduleID, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	overrideID, ok := pathID(w, r, "overrideId")
	if !ok {
		return
	}
	if e := a.services.Roster.DeletePayrollOverride(r.Context(), scheduleID, overrideID, actor(r)); e != nil {
		fail(w, e)
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}

func (a *API) listCompensationRates(w http.ResponseWriter, r *http.Request) {
	list, e := a.services.Roster.ListCompensationRates(r.Context(), actor(r))
	if e != nil {
		fail(w, e)
		return
	}
	writeJSON(w, 200, map[string]any{"data": list})
}

func (a *API) createCompensationRate(w http.ResponseWriter, r *http.Request) {
	var in domain.CompensationRate
	if !decode(w, r, &in) {
		return
	}
	out, e := a.services.Roster.SaveCompensationRate(r.Context(), in, actor(r))
	if e != nil {
		fail(w, e)
		return
	}
	writeJSON(w, 201, map[string]any{"data": out})
}

func (a *API) auditLog(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	entries, e := a.services.Roster.GetAuditLog(r.Context(), id, actor(r))
	if e != nil {
		fail(w, e)
		return
	}
	writeJSON(w, 200, map[string]any{"data": entries})
}
