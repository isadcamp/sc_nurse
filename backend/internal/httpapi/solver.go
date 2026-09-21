package httpapi

import (
	"errors"
	"net/http"
	"nurse-scheduler/backend/internal/scheduler"
	"nurse-scheduler/backend/internal/service"
	"strings"
)

func (a *API) solverRoutes(m *http.ServeMux) {
	m.HandleFunc("POST /api/v1/schedules/{id}/readiness-check", a.solverReadiness)
	m.HandleFunc("POST /api/v1/schedules/{id}/generate", a.startSolver)
	m.HandleFunc("POST /api/v1/schedules/{id}/generate-multi", a.solveMulti)
	m.HandleFunc("POST /api/v1/schedules/{id}/simulate", a.startSolver)
	m.HandleFunc("GET /api/v1/jobs/{jobId}", a.getSolverJob)
	m.HandleFunc("DELETE /api/v1/jobs/{jobId}", a.cancelSolverJob)
	m.HandleFunc("POST /api/v1/jobs/{jobId}/apply", a.applySolverJob)
	m.HandleFunc("GET /api/v1/schedules/{id}/score", a.solverScore)
	m.HandleFunc("GET /api/v1/schedules/{id}/snapshot", a.solverSnapshot)
}
func (a *API) solverReadiness(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	var in struct {
		Simulation bool `json:"simulation"`
	}
	if !decode(w, r, &in) {
		return
	}
	out, e := a.services.Solver.Readiness(r.Context(), id, actor(r), in.Simulation)
	if e != nil {
		fail(w, e)
		return
	}
	writeJSON(w, 200, out)
}
func (a *API) startSolver(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	var in service.GenerateCommand
	if !decode(w, r, &in) {
		return
	}
	out, e := a.services.Solver.Start(r.Context(), id, actor(r), in, strings.HasSuffix(r.URL.Path, "/simulate"))
	if e != nil {
		var ready *service.ReadinessError
		if errors.As(e, &ready) {
			writeJSON(w, 422, map[string]any{"error": map[string]any{"code": "not_ready", "message": ready.Error(), "details": ready.Report.Issues}, "readiness": ready.Report})
			return
		}
		fail(w, e)
		return
	}
	writeJSON(w, 202, out)
}
func (a *API) solveMulti(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	var in service.GenerateCommand
	if !decode(w, r, &in) {
		return
	}
	out, e := a.services.Solver.SolveMulti(r.Context(), id, actor(r), in, false)
	if e != nil {
		var ready *service.ReadinessError
		if errors.As(e, &ready) {
			writeJSON(w, 422, map[string]any{"error": map[string]any{"code": "not_ready", "message": ready.Error(), "details": ready.Report.Issues}, "readiness": ready.Report})
			return
		}
		fail(w, e)
		return
	}
	writeJSON(w, 200, out)
}
func (a *API) getSolverJob(w http.ResponseWriter, r *http.Request) {
	out, e := a.services.Solver.Get(r.Context(), r.PathValue("jobId"), actor(r))
	if e != nil {
		fail(w, e)
		return
	}
	writeJSON(w, 200, out)
}
func (a *API) cancelSolverJob(w http.ResponseWriter, r *http.Request) {
	out, e := a.services.Solver.Cancel(r.Context(), r.PathValue("jobId"), actor(r))
	if e != nil {
		fail(w, e)
		return
	}
	writeJSON(w, 200, out)
}
func (a *API) applySolverJob(w http.ResponseWriter, r *http.Request) {
	var in struct{}
	if !decode(w, r, &in) {
		return
	}
	out, e := a.services.Solver.Apply(r.Context(), r.PathValue("jobId"), actor(r))
	if e != nil {
		fail(w, e)
		return
	}
	rosterResult(w, 200, out)
}
func (a *API) solverScore(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	out, e := a.services.Roster.Get(r.Context(), id, actor(r))
	if e != nil {
		fail(w, e)
		return
	}
	writeJSON(w, 200, scheduler.Score(out, out.Assignments))
}
func (a *API) solverSnapshot(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	out, e := a.services.Roster.Get(r.Context(), id, actor(r))
	if e != nil {
		fail(w, e)
		return
	}
	snapshot, e := scheduler.Snapshot(out)
	if e != nil {
		fail(w, e)
		return
	}
	writeJSON(w, 200, snapshot)
}
