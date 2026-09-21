package httpapi

import (
	"net/http"
	"nurse-scheduler/backend/internal/domain"
	"strconv"
	"strings"
	"time"
)

func (a *API) holidayLeaveRoutes(mux *http.ServeMux) {
	// Holiday endpoints
	mux.HandleFunc("GET /api/v1/holidays", a.handleListHolidays)
	mux.HandleFunc("POST /api/v1/holidays", a.handleSaveHolidays)
	mux.HandleFunc("DELETE /api/v1/holidays", a.handleDeleteHoliday)
	mux.HandleFunc("POST /api/v1/holidays/copy-year", a.handleCopyHolidayYear)

	// Leave Request endpoints
	mux.HandleFunc("GET /api/v1/leave-requests", a.handleListLeaveRequests)
	mux.HandleFunc("POST /api/v1/leave-requests", a.handleCreateLeaveRequest)
	mux.HandleFunc("PUT /api/v1/leave-requests/{id}/approve", a.handleApproveLeaveRequest)
	mux.HandleFunc("PUT /api/v1/leave-requests/{id}/reject", a.handleRejectLeaveRequest)
}

// ---------- Holiday Handlers ----------

func (a *API) handleListHolidays(w http.ResponseWriter, r *http.Request) {
	if a.services.Holiday == nil {
		writeJSON(w, http.StatusOK, map[string]any{"data": domain.HolidayCalendar{}})
		return
	}
	yearStr := r.URL.Query().Get("year")
	year := time.Now().Year()
	if yearStr != "" {
		if y, err := strconv.Atoi(yearStr); err == nil && y > 0 {
			year = y
		}
	}
	cal, err := a.services.Holiday.GetByYear(r.Context(), year)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "ไม่สามารถดึงข้อมูลวันหยุดได้")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": cal})
}

func (a *API) handleSaveHolidays(w http.ResponseWriter, r *http.Request) {
	if a.services.Holiday == nil {
		writeError(w, http.StatusNotImplemented, "not_implemented", "holiday service not initialized")
		return
	}
	var in struct {
		Year     int `json:"year"`
		Holidays []struct {
			Date string `json:"date"`
			Name string `json:"name"`
		} `json:"holidays"`
		Draft bool `json:"draft"`
	}
	if !decode(w, r, &in) {
		return
	}
	if in.Year <= 0 {
		in.Year = time.Now().Year()
	}

	holidayList := make([]domain.Holiday, 0, len(in.Holidays))
	for i, h := range in.Holidays {
		t, err := time.Parse("2006-01-02", h.Date)
		if err != nil {
			continue
		}
		holidayList = append(holidayList, domain.Holiday{
			ID:   int64(i + 1),
			Date: t,
			Name: strings.TrimSpace(h.Name),
		})
	}

	cal := domain.HolidayCalendar{
		Year:     in.Year,
		Holidays: holidayList,
		Draft:    in.Draft,
	}

	if err := a.services.Holiday.Save(r.Context(), cal); err != nil {
		writeError(w, http.StatusInternalServerError, "save_failed", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"message": "บันทึกปฏิทินวันหยุดสำเร็จ", "data": cal})
}

func (a *API) handleDeleteHoliday(w http.ResponseWriter, r *http.Request) {
	if a.services.Holiday == nil {
		writeError(w, http.StatusNotImplemented, "not_implemented", "holiday service not initialized")
		return
	}
	yearStr := r.URL.Query().Get("year")
	dateStr := r.URL.Query().Get("date")
	year, _ := strconv.Atoi(yearStr)
	if year <= 0 || dateStr == "" {
		writeError(w, http.StatusBadRequest, "invalid_input", "กรุณาระบุ year และ date ที่ต้องการลบ")
		return
	}

	cal, err := a.services.Holiday.GetByYear(r.Context(), year)
	if err != nil {
		writeError(w, http.StatusNotFound, "not_found", "ไม่พบข้อมูลปีนี้")
		return
	}

	filtered := make([]domain.Holiday, 0, len(cal.Holidays))
	for _, h := range cal.Holidays {
		if h.Date.Format("2006-01-02") != dateStr {
			filtered = append(filtered, h)
		}
	}
	cal.Holidays = filtered
	if err := a.services.Holiday.Save(r.Context(), cal); err != nil {
		writeError(w, http.StatusInternalServerError, "delete_failed", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"message": "ลบวันหยุดสำเร็จ", "data": cal})
}

func (a *API) handleCopyHolidayYear(w http.ResponseWriter, r *http.Request) {
	if a.services.Holiday == nil {
		writeError(w, http.StatusNotImplemented, "not_implemented", "holiday service not initialized")
		return
	}
	var in struct {
		SourceYear      int `json:"sourceYear,omitempty"`
		DestinationYear int `json:"destinationYear,omitempty"`
		FromYear        int `json:"fromYear,omitempty"`
		ToYear          int `json:"toYear,omitempty"`
	}
	if !decode(w, r, &in) {
		return
	}
	src := in.SourceYear
	if src <= 0 {
		src = in.FromYear
	}
	dst := in.DestinationYear
	if dst <= 0 {
		dst = in.ToYear
	}
	if src <= 0 || dst <= 0 {
		writeError(w, http.StatusBadRequest, "invalid_input", "กรุณาระบุ sourceYear และ destinationYear")
		return
	}

	if err := a.services.Holiday.CopyYearToDraft(r.Context(), src, dst); err != nil {
		writeError(w, http.StatusInternalServerError, "copy_failed", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"message": "คัดลอกวันหยุดไปยังปีใหม่สำเร็จ",
		"year":    dst,
	})
}

// ---------- Leave Request Handlers ----------

func (a *API) handleListLeaveRequests(w http.ResponseWriter, r *http.Request) {
	if a.services.LeaveRequest == nil {
		writeJSON(w, http.StatusOK, map[string]any{"data": []any{}})
		return
	}
	ward := r.URL.Query().Get("ward")
	status := r.URL.Query().Get("status")
	nurseID := r.URL.Query().Get("nurseId")

	list, err := a.services.LeaveRequest.ListByWard(r.Context(), domain.WardID(ward))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "ไม่สามารถดึงข้อมูลคำขอลาได้")
		return
	}

	data := make([]map[string]any, 0, len(list))
	for _, it := range list {
		if status != "" && string(it.Status) != status {
			continue
		}
		if nurseID != "" && it.NurseID != nurseID {
			continue
		}
		data = append(data, map[string]any{
			"id":        it.ID,
			"wardId":    it.WardID,
			"nurseId":   it.NurseID,
			"startDate": it.StartDate.Format("2006-01-02"),
			"endDate":   it.EndDate.Format("2006-01-02"),
			"reason":    it.Reason,
			"status":    it.Status,
			"approver":  it.Approver,
			"createdAt": it.CreatedAt.UTC().Format(time.RFC3339),
			"updatedAt": it.UpdatedAt.UTC().Format(time.RFC3339),
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": data})
}

func (a *API) handleCreateLeaveRequest(w http.ResponseWriter, r *http.Request) {
	if a.services.LeaveRequest == nil {
		writeError(w, http.StatusNotImplemented, "not_implemented", "leave service not initialized")
		return
	}
	var in struct {
		WardID    string `json:"wardId"`
		NurseID   string `json:"nurseId"`
		NurseName string `json:"nurseName,omitempty"`
		StartDate string `json:"startDate"`
		EndDate   string `json:"endDate"`
		LeaveType string `json:"leaveType,omitempty"`
		Reason    string `json:"reason,omitempty"`
	}
	if !decode(w, r, &in) {
		return
	}
	in.WardID = strings.TrimSpace(in.WardID)
	in.NurseID = strings.TrimSpace(in.NurseID)
	if in.WardID == "" || in.NurseID == "" || in.StartDate == "" || in.EndDate == "" {
		writeError(w, http.StatusBadRequest, "invalid_input", "กรุณาระบุ wardId, nurseId, startDate และ endDate")
		return
	}

	start, err1 := time.Parse("2006-01-02", in.StartDate)
	end, err2 := time.Parse("2006-01-02", in.EndDate)
	if err1 != nil || err2 != nil || end.Before(start) {
		writeError(w, http.StatusBadRequest, "invalid_input", "ช่วงวันที่ลาไม่ถูกต้อง")
		return
	}

	reason := strings.TrimSpace(in.Reason)
	if in.LeaveType != "" {
		if reason != "" {
			reason = "[" + in.LeaveType + "] " + reason
		} else {
			reason = "[" + in.LeaveType + "]"
		}
	}

	req := domain.LeaveRequest{
		WardID:    in.WardID,
		NurseID:   in.NurseID,
		StartDate: start,
		EndDate:   end,
		Reason:    reason,
		Status:    domain.LeavePending,
	}

	created, err := a.services.LeaveRequest.Create(r.Context(), req)
	if err != nil {
		writeError(w, http.StatusBadRequest, "create_failed", err.Error())
		return
	}

	writeJSON(w, http.StatusCreated, map[string]any{
		"message": "ยื่นคำขอลาเรียบร้อยแล้ว",
		"data": map[string]any{
			"id":        created.ID,
			"wardId":    created.WardID,
			"nurseId":   created.NurseID,
			"startDate": created.StartDate.Format("2006-01-02"),
			"endDate":   created.EndDate.Format("2006-01-02"),
			"reason":    created.Reason,
			"status":    created.Status,
		},
	})
}

func (a *API) handleApproveLeaveRequest(w http.ResponseWriter, r *http.Request) {
	if a.services.LeaveRequest == nil {
		writeError(w, http.StatusNotImplemented, "not_implemented", "leave service not initialized")
		return
	}
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id <= 0 {
		writeError(w, http.StatusBadRequest, "invalid_id", "รหัสคำขอไม่ถูกต้อง")
		return
	}
	approver := actor(r).ID
	if approver == "" {
		approver = "admin"
	}

	if err := a.services.LeaveRequest.Approve(r.Context(), id, approver); err != nil {
		writeError(w, http.StatusInternalServerError, "approval_failed", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"message":  "อนุมัติคำขอลาและลงเวร L ในตารางเวรเรียบร้อยแล้ว",
		"id":       id,
		"status":   "approved",
		"approver": approver,
	})
}

func (a *API) handleRejectLeaveRequest(w http.ResponseWriter, r *http.Request) {
	if a.services.LeaveRequest == nil {
		writeError(w, http.StatusNotImplemented, "not_implemented", "leave service not initialized")
		return
	}
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id <= 0 {
		writeError(w, http.StatusBadRequest, "invalid_id", "รหัสคำขอไม่ถูกต้อง")
		return
	}
	approver := actor(r).ID
	if approver == "" {
		approver = "admin"
	}

	if err := a.services.LeaveRequest.Reject(r.Context(), id, approver); err != nil {
		writeError(w, http.StatusInternalServerError, "reject_failed", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"message":  "ปฏิเสธคำขอลาเรียบร้อยแล้ว",
		"id":       id,
		"status":   "rejected",
		"approver": approver,
	})
}
