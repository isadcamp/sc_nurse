package httpapi

import (
	"context"
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"log"
	"mime"
	"net/http"
	"nurse-scheduler/backend/internal/domain"
	"nurse-scheduler/backend/internal/repository"
	"nurse-scheduler/backend/internal/service"
	"nurse-scheduler/backend/internal/validation"
	"strconv"
	"strings"
)

type actorKey struct{}
type Credential struct {
	Token string   `json:"token"`
	ID    string   `json:"id"`
	Role  string   `json:"role"`
	Wards []string `json:"wards"`
}

func authenticate(userSvc *service.UserService, credentials []Credential, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var rid [16]byte
		if _, err := rand.Read(rid[:]); err != nil {
			writeError(w, 500, "internal_error", "สร้างรหัสคำขอไม่สำเร็จ")
			return
		}
		w.Header().Set("X-Request-ID", hex.EncodeToString(rid[:]))
		w.Header().Set("Cache-Control", "no-store")
		if r.URL.Path == "/health" || r.URL.Path == "/api/v1/auth/login" || r.Method == "OPTIONS" {
			next.ServeHTTP(w, r)
			return
		}
		token := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
		if token != "" && userSvc != nil {
			u, err := userSvc.ValidateToken(r.Context(), token)
			if err == nil && u != nil {
				a := domain.Actor{ID: u.Username, Role: string(u.Role), Wards: u.Wards}
				next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), actorKey{}, a)))
				return
			}
		}
		for _, c := range credentials {
			if len(c.Token) > 0 && subtle.ConstantTimeCompare([]byte(token), []byte(c.Token)) == 1 {
				a := domain.Actor{ID: c.ID, Role: c.Role, Wards: c.Wards}
				next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), actorKey{}, a)))
				return
			}
		}
		writeError(w, 401, "unauthorized", "กรุณายืนยันตัวตน")
	})
}
func actor(r *http.Request) domain.Actor {
	a, _ := r.Context().Value(actorKey{}).(domain.Actor)
	return a
}
func decode(w http.ResponseWriter, r *http.Request, v any) bool {
	typ, _, e := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if e != nil || typ != "application/json" {
		writeError(w, 415, "content_type", "ต้องส่ง application/json")
		return false
	}
	r.Body = http.MaxBytesReader(w, r.Body, 65536)
	d := json.NewDecoder(r.Body)
	d.DisallowUnknownFields()
	if e = d.Decode(v); e != nil {
		writeError(w, 400, "invalid_json", "ข้อมูล JSON ไม่ถูกต้องหรือใหญ่เกินกำหนด")
		return false
	}
	if e = d.Decode(&struct{}{}); e != io.EOF {
		writeError(w, 400, "invalid_json", "ต้องส่ง JSON เพียงรายการเดียว")
		return false
	}
	return true
}
func fail(w http.ResponseWriter, e error) {
	var re *service.RuleError
	switch {
	case errors.As(e, &re):
		writeJSON(w, 422, map[string]any{"error": map[string]any{"code": "hard_violation", "message": re.Error(), "details": re.Report.Violations}, "report": re.Report})
	case errors.Is(e, repository.ErrNotFound):
		writeError(w, 404, "not_found", "ไม่พบข้อมูล")
	case errors.Is(e, repository.ErrForbidden):
		writeError(w, 403, "forbidden", "ไม่มีสิทธิ์หรือเวรถูกล็อก")
	case errors.Is(e, repository.ErrConflict):
		writeError(w, 409, "conflict", "ข้อมูลเปลี่ยนแล้ว กรุณาโหลดตารางใหม่")
	case errors.Is(e, repository.ErrInput):
		writeError(w, 422, "invalid_input", "ข้อมูลไม่ถูกต้อง")
	case errors.Is(e, repository.ErrPolicy):
		writeError(w, 422, "policy_missing", "ยังไม่ได้ตั้งค่านโยบายหรือช่วงเวลาเวรของหน่วยงาน")
	default:
		log.Printf("roster operation failed: %v", e)
		writeError(w, 500, "internal_error", "ไม่สามารถดำเนินการได้")
	}
}
func pathID(w http.ResponseWriter, r *http.Request, name string) (int64, bool) {
	id, e := strconv.ParseInt(r.PathValue(name), 10, 64)
	if e != nil || id < 1 {
		writeError(w, 400, "invalid_id", "รหัสไม่ถูกต้อง")
		return 0, false
	}
	return id, true
}
func rosterResult(w http.ResponseWriter, status int, r domain.Roster) {
	writeJSON(w, status, map[string]any{"schedule": r, "report": validation.Validate(r, r.Assignments)})
}
func (a *API) rosterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/v1/wards/{ward}/schedules", a.listRosters)
	mux.HandleFunc("POST /api/v1/schedules", a.createRoster)
	mux.HandleFunc("GET /api/v1/schedules/{id}", a.getRoster)
	mux.HandleFunc("PUT /api/v1/schedules/{id}/assignments", a.editRoster)
	mux.HandleFunc("POST /api/v1/schedules/{id}/validate", a.validateRoster)
	mux.HandleFunc("POST /api/v1/schedules/{id}/assignments/{assignmentId}/check", a.checkRoster)
	mux.HandleFunc("PUT /api/v1/schedules/{id}/assignments/{assignmentId}/lock", a.lockRoster)
	mux.HandleFunc("PUT /api/v1/schedules/{id}/assignments/{assignmentId}/unlock", a.lockRoster)
	mux.HandleFunc("GET /api/v1/schedules/{id}/boundary-data", a.boundaryRoster)
	mux.HandleFunc("POST /api/v1/schedules/{id}/boundary-shifts", a.saveBoundaryShifts)
	mux.HandleFunc("GET /api/v1/schedules/{id}/violations", a.validateRoster)
	mux.HandleFunc("PUT /api/v1/wards/{ward}/roster-policy", a.setRosterPolicy)
	mux.HandleFunc("POST /api/v1/schedules/{id}/submit-review", a.submitReview)
	mux.HandleFunc("POST /api/v1/schedules/{id}/approve", a.approveSchedule)
	mux.HandleFunc("POST /api/v1/schedules/{id}/revise", a.reviseSchedule)
	mux.HandleFunc("POST /api/v1/schedules/{id}/publish", a.publishSchedule)
	mux.HandleFunc("POST /api/v1/schedules/{id}/unpublish", a.unpublishSchedule)
	mux.HandleFunc("DELETE /api/v1/schedules/{id}", a.deleteSchedule)
	mux.HandleFunc("POST /api/v1/schedules/{id}/close", a.closeSchedule)
	mux.HandleFunc("POST /api/v1/schedules/{id}/reopen", a.reopenSchedule)
	mux.HandleFunc("GET /api/v1/schedules/{id}/payroll-overrides", a.listPayrollOverrides)
	mux.HandleFunc("POST /api/v1/schedules/{id}/payroll-overrides", a.createPayrollOverride)
	mux.HandleFunc("DELETE /api/v1/schedules/{id}/payroll-overrides/{overrideId}", a.deletePayrollOverride)
	mux.HandleFunc("GET /api/v1/compensation-rates", a.listCompensationRates)
	mux.HandleFunc("POST /api/v1/compensation-rates", a.createCompensationRate)
	mux.HandleFunc("POST /api/v1/schedules/{id}/new-version", a.newVersion)
	mux.HandleFunc("GET /api/v1/schedules/{id}/versions", a.listVersions)
	mux.HandleFunc("GET /api/v1/schedules/{id}/compare/{compareId}", a.compareVersions)
	mux.HandleFunc("GET /api/v1/schedules/{id}/audit-log", a.auditLog)
	mux.HandleFunc("GET /api/v1/schedules/{id}/summary", a.getScheduleSummary)
	mux.HandleFunc("GET /api/v1/schedules/{id}/daily-staffing", a.getDailyStaffing)
	mux.HandleFunc("GET /api/v1/schedules/{id}/summary/daily", a.getDailyStaffing)
	mux.HandleFunc("GET /api/v1/schedules/{id}/nurse-stats", a.getNurseStats)
	mux.HandleFunc("GET /api/v1/schedules/{id}/export/xlsx", a.exportExcel)
}
func (a *API) listRosters(w http.ResponseWriter, r *http.Request) {
	m, _ := strconv.Atoi(r.URL.Query().Get("month"))
	y, _ := strconv.Atoi(r.URL.Query().Get("year"))
	out, e := a.services.Roster.List(r.Context(), r.PathValue("ward"), m, y, actor(r))
	if e != nil {
		fail(w, e)
		return
	}
	data := make([]map[string]any, 0, len(out))
	for _, item := range out {
		data = append(data, map[string]any{
			"id":          item.ID,
			"wardId":      item.WardID,
			"month":       item.Month,
			"year":        item.Year,
			"status":      item.Status,
			"version":     item.Version,
			"publishedBy": item.PublishedBy,
			"publishedAt": item.PublishedAt,
		})
	}
	writeJSON(w, 200, map[string]any{"data": data})
}
func (a *API) createRoster(w http.ResponseWriter, r *http.Request) {
	var in struct {
		WardID string `json:"wardId"`
		Month  int    `json:"month"`
		Year   int    `json:"year"`
	}
	if !decode(w, r, &in) {
		return
	}
	out, e := a.services.Roster.Create(r.Context(), in.WardID, in.Month, in.Year, actor(r))
	if e != nil {
		fail(w, e)
		return
	}
	rosterResult(w, 201, out)
}
func (a *API) getRoster(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	out, e := a.services.Roster.Get(r.Context(), id, actor(r))
	if e != nil {
		fail(w, e)
		return
	}
	rosterResult(w, 200, out)
}

type editDTO struct {
	NurseID   string `json:"nurseId"`
	Date      string `json:"date"`
	ShiftCode string `json:"shiftCode"`
	Version   *int   `json:"version"`
	Reason    string `json:"reason"`
	Override  bool   `json:"override"`
}

func (in editDTO) command() service.Edit {
	version := -1
	if in.Version != nil {
		version = *in.Version
	}
	return service.Edit{NurseID: in.NurseID, Date: in.Date, ShiftCode: in.ShiftCode, Version: version, Reason: strings.TrimSpace(in.Reason), Override: in.Override}
}
func (a *API) editRoster(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	var in editDTO
	if !decode(w, r, &in) {
		return
	}
	out, e := a.services.Roster.Edit(r.Context(), id, actor(r), in.command())
	if e != nil {
		fail(w, e)
		return
	}
	rosterResult(w, 200, out)
}
func (a *API) checkRoster(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	aid, e := strconv.ParseInt(r.PathValue("assignmentId"), 10, 64)
	if e != nil || aid < 0 {
		fail(w, repository.ErrInput)
		return
	}
	var in editDTO
	if !decode(w, r, &in) {
		return
	}
	cmd := in.command()
	cmd.AssignmentID = aid
	out, e := a.services.Roster.Check(r.Context(), id, actor(r), cmd)
	if e != nil {
		fail(w, e)
		return
	}
	writeJSON(w, 200, out)
}
func (a *API) validateRoster(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	out, e := a.services.Roster.Get(r.Context(), id, actor(r))
	if e != nil {
		fail(w, e)
		return
	}
	writeJSON(w, 200, validation.Validate(out, out.Assignments))
}
func (a *API) boundaryRoster(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	out, e := a.services.Roster.Get(r.Context(), id, actor(r))
	if e != nil {
		fail(w, e)
		return
	}
	report := validation.Validate(out, out.Assignments)
	writeJSON(w, 200, map[string]any{"assignments": out.Boundary, "hours": report.Hours, "timezone": out.Timezone})
}
func (a *API) saveBoundaryShifts(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	var in struct {
		Date   string            `json:"date"`
		Shifts map[string]string `json:"shifts"`
	}
	if !decode(w, r, &in) {
		return
	}
	if in.Date == "" || len(in.Shifts) == 0 {
		writeError(w, 400, "invalid_input", "กรุณาระบุวันที่และเวรของเจ้าหน้าที่")
		return
	}
	roster, report, err := a.services.Roster.SaveBoundaryShifts(r.Context(), id, in.Date, in.Shifts, actor(r))
	if err != nil {
		fail(w, err)
		return
	}
	writeJSON(w, 200, map[string]any{
		"schedule": roster,
		"report":   report,
	})
}
func (a *API) lockRoster(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	aid, ok := pathID(w, r, "assignmentId")
	if !ok {
		return
	}
	var in struct {
		Version int    `json:"version"`
		Reason  string `json:"reason"`
	}
	if !decode(w, r, &in) {
		return
	}
	out, e := a.services.Roster.Lock(r.Context(), id, aid, in.Version, strings.HasSuffix(r.URL.Path, "/lock"), strings.TrimSpace(in.Reason), actor(r))
	if e != nil {
		fail(w, e)
		return
	}
	rosterResult(w, 200, out)
}
func (a *API) setRosterPolicy(w http.ResponseWriter, r *http.Request) {
	var raw map[string]json.RawMessage
	if !decode(w, r, &raw) {
		return
	}
	for _, key := range []string{"minRestHours", "maxConsecutiveDays", "maxConsecutiveNights", "maxMonthlyHours", "maxContinuousHours", "maxDoubleShifts", "nightStart", "nightEnd", "fairnessHours", "targets", "preferences", "staffing"} {
		value, ok := raw[key]
		if !ok || string(value) == "null" {
			fail(w, repository.ErrInput)
			return
		}
	}
	b, err := json.Marshal(raw)
	if err != nil {
		fail(w, repository.ErrInput)
		return
	}
	var p domain.Policy
	d := json.NewDecoder(strings.NewReader(string(b)))
	d.DisallowUnknownFields()
	if err = d.Decode(&p); err != nil {
		fail(w, repository.ErrInput)
		return
	}
	if e := a.services.Roster.SetPolicy(r.Context(), r.PathValue("ward"), p, actor(r)); e != nil {
		fail(w, e)
		return
	}
	writeJSON(w, 200, map[string]any{"data": p})
}
