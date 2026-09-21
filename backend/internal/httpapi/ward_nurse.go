package httpapi

import (
	"net/http"
	"nurse-scheduler/backend/internal/domain"
	"strings"
	"time"
)

func (a *API) wardNurseRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/v1/wards", a.handleListWards)
	mux.HandleFunc("POST /api/v1/wards", a.handleCreateWard)
	mux.HandleFunc("GET /api/v1/wards/{id}", a.handleGetWard)
	mux.HandleFunc("PUT /api/v1/wards/{id}", a.handleUpdateWard)
	mux.HandleFunc("PATCH /api/v1/wards/{id}/status", a.handleToggleWardStatus)
	mux.HandleFunc("GET /api/v1/wards/{id}/nurses", a.handleListWardNurses)

	mux.HandleFunc("GET /api/v1/nurses", a.handleListAllNurses)
	mux.HandleFunc("POST /api/v1/nurses", a.handleCreateNurse)
	mux.HandleFunc("GET /api/v1/nurses/{id}", a.handleGetNurse)
	mux.HandleFunc("PUT /api/v1/nurses/{id}", a.handleUpdateNurse)
	mux.HandleFunc("PATCH /api/v1/nurses/{id}/status", a.handleToggleNurseStatus)
}

// ---------- Ward Handlers ----------

func (a *API) handleListWards(w http.ResponseWriter, r *http.Request) {
	if a.services.Ward == nil {
		writeJSON(w, http.StatusOK, map[string]any{"data": []any{}})
		return
	}
	wards, err := a.services.Ward.ListWards(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "ไม่สามารถดึงรายชื่อหน่วยงานได้")
		return
	}
	data := make([]map[string]any, 0, len(wards))
	for _, ward := range wards {
		staffCount := 0
		if a.services.Nurse != nil {
			nurses, _ := a.services.Nurse.ListByWard(r.Context(), ward.ID, true)
			staffCount = len(nurses)
		}
		data = append(data, map[string]any{
			"id":          ward.ID,
			"name":        ward.Name,
			"description": ward.Description,
			"timezone":    ward.Timezone,
			"isActive":    ward.IsActive,
			"staffCount":  staffCount,
			"version":     ward.Version,
			"createdAt":   ward.CreatedAt.UTC().Format(time.RFC3339),
			"updatedAt":   ward.UpdatedAt.UTC().Format(time.RFC3339),
			"createdBy":   ward.CreatedBy,
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": data})
}

func (a *API) handleCreateWard(w http.ResponseWriter, r *http.Request) {
	if a.services.Ward == nil {
		writeError(w, http.StatusNotImplemented, "not_implemented", "ward service not initialized")
		return
	}
	var in struct {
		ID          string `json:"id"`
		Name        string `json:"name"`
		Description string `json:"description"`
		Timezone    string `json:"timezone"`
		IsActive    *bool  `json:"isActive"`
	}
	if !decode(w, r, &in) {
		return
	}
	in.ID = strings.TrimSpace(in.ID)
	in.Name = strings.TrimSpace(in.Name)
	if in.ID == "" || in.Name == "" {
		writeError(w, http.StatusBadRequest, "invalid_input", "กรุณาระบุรหัสและชื่อหน่วยงาน")
		return
	}
	if in.Timezone == "" {
		in.Timezone = "Asia/Bangkok"
	}
	isActive := true
	if in.IsActive != nil {
		isActive = *in.IsActive
	}
	act := actor(r)
	ward := domain.Ward{
		ID:          domain.WardID(in.ID),
		Name:        in.Name,
		Description: strings.TrimSpace(in.Description),
		Timezone:    in.Timezone,
		IsActive:    isActive,
		Version:     1,
		CreatedBy:   act.ID,
	}
	if err := a.services.Ward.CreateWard(r.Context(), ward); err != nil {
		writeError(w, http.StatusBadRequest, "ward_creation_failed", err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{
		"message": "สร้างหน่วยงานสำเร็จ",
		"data": map[string]any{
			"id":          ward.ID,
			"name":        ward.Name,
			"description": ward.Description,
			"timezone":    ward.Timezone,
			"isActive":    ward.IsActive,
		},
	})
}

func (a *API) handleGetWard(w http.ResponseWriter, r *http.Request) {
	if a.services.Ward == nil {
		writeError(w, http.StatusNotFound, "not_found", "ไม่พบข้อมูลหน่วยงาน")
		return
	}
	id := r.PathValue("id")
	ward, err := a.services.Ward.GetWard(r.Context(), domain.WardID(id))
	if err != nil {
		writeError(w, http.StatusNotFound, "not_found", "ไม่พบข้อมูลหน่วยงาน")
		return
	}
	staffCount := 0
	if a.services.Nurse != nil {
		nurses, _ := a.services.Nurse.ListByWard(r.Context(), ward.ID, true)
		staffCount = len(nurses)
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"data": map[string]any{
			"id":          ward.ID,
			"name":        ward.Name,
			"description": ward.Description,
			"timezone":    ward.Timezone,
			"isActive":    ward.IsActive,
			"staffCount":  staffCount,
			"version":     ward.Version,
		},
	})
}

func (a *API) handleUpdateWard(w http.ResponseWriter, r *http.Request) {
	if a.services.Ward == nil {
		writeError(w, http.StatusNotFound, "not_found", "ไม่พบข้อมูลหน่วยงาน")
		return
	}
	id := r.PathValue("id")
	var in struct {
		Name        string `json:"name"`
		Description string `json:"description"`
		Timezone    string `json:"timezone"`
		IsActive    *bool  `json:"isActive"`
	}
	if !decode(w, r, &in) {
		return
	}
	ward, err := a.services.Ward.GetWard(r.Context(), domain.WardID(id))
	if err != nil {
		writeError(w, http.StatusNotFound, "not_found", "ไม่พบข้อมูลหน่วยงาน")
		return
	}
	if in.Name != "" {
		ward.Name = strings.TrimSpace(in.Name)
	}
	if in.Description != "" {
		ward.Description = strings.TrimSpace(in.Description)
	}
	if in.Timezone != "" {
		ward.Timezone = strings.TrimSpace(in.Timezone)
	}
	if in.IsActive != nil {
		ward.IsActive = *in.IsActive
	}
	ward.UpdatedBy = actor(r).ID
	if err := a.services.Ward.UpdateWard(r.Context(), ward); err != nil {
		writeError(w, http.StatusInternalServerError, "update_failed", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"message": "แก้ไขหน่วยงานสำเร็จ", "data": ward})
}

func (a *API) handleToggleWardStatus(w http.ResponseWriter, r *http.Request) {
	if a.services.Ward == nil {
		writeError(w, http.StatusNotFound, "not_found", "ไม่พบข้อมูลหน่วยงาน")
		return
	}
	id := domain.WardID(r.PathValue("id"))
	var in struct {
		IsActive bool `json:"isActive"`
	}
	if !decode(w, r, &in) {
		return
	}
	act := actor(r)
	if err := a.services.Ward.SetStatus(r.Context(), id, in.IsActive, act.ID); err != nil {
		writeError(w, http.StatusBadRequest, "status_change_failed", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"message": "เปลี่ยนสถานะหน่วยงานสำเร็จ", "isActive": in.IsActive})
}

// ---------- Nurse Handlers ----------

func (a *API) handleListWardNurses(w http.ResponseWriter, r *http.Request) {
	if a.services.Nurse == nil {
		writeJSON(w, http.StatusOK, map[string]any{"data": []any{}})
		return
	}
	wardID := domain.WardID(r.PathValue("id"))
	activeOnly := r.URL.Query().Get("active") == "true"
	nurses, err := a.services.Nurse.ListByWard(r.Context(), wardID, activeOnly)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "ไม่สามารถดึงรายชื่อบุคลากรได้")
		return
	}
	data := make([]map[string]any, 0, len(nurses))
	for _, n := range nurses {
		data = append(data, map[string]any{
			"id":                n.ID,
			"wardId":            n.WardID,
			"name":              n.Name,
			"position":          n.Position,
			"isChargeEligible":  n.IsChargeEligible,
			"canDoubleShift":    n.CanDoubleShift,
			"isPartTime":        n.IsPartTime,
			"isActive":          n.IsActive,
			"skills":            n.Skills,
			"allowedShiftCodes": n.AllowedShiftCodes,
			"version":           n.Version,
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": data})
}

func (a *API) handleListAllNurses(w http.ResponseWriter, r *http.Request) {
	ward := r.URL.Query().Get("ward")
	if ward != "" {
		r.SetPathValue("id", ward)
		a.handleListWardNurses(w, r)
		return
	}
	if a.services.Nurse == nil {
		writeJSON(w, http.StatusOK, map[string]any{"data": []any{}})
		return
	}
	nurses, err := a.services.Nurse.ListNurses(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "ไม่สามารถดึงรายชื่อบุคลากรได้")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": nurses})
}

func (a *API) handleCreateNurse(w http.ResponseWriter, r *http.Request) {
	if a.services.Nurse == nil {
		writeError(w, http.StatusNotImplemented, "not_implemented", "nurse service not initialized")
		return
	}
	var in struct {
		ID                string   `json:"id"`
		WardID            string   `json:"wardId"`
		Name              string   `json:"name"`
		Position          string   `json:"position"`
		IsChargeEligible  bool     `json:"isChargeEligible"`
		CanDoubleShift    bool     `json:"canDoubleShift"`
		IsPartTime        bool     `json:"isPartTime"`
		IsActive          *bool    `json:"isActive"`
		Skills            []string `json:"skills"`
		AllowedShiftCodes []string `json:"allowedShiftCodes"`
	}
	if !decode(w, r, &in) {
		return
	}
	in.Name = strings.TrimSpace(in.Name)
	in.WardID = strings.TrimSpace(in.WardID)
	if in.Name == "" || in.WardID == "" {
		writeError(w, http.StatusBadRequest, "invalid_input", "กรุณาระบุชื่อและสังกัดหน่วยงาน")
		return
	}
	pos := domain.Position(in.Position)
	if pos != domain.PositionRN && pos != domain.PositionPN {
		pos = domain.PositionRN
	}
	isActive := true
	if in.IsActive != nil {
		isActive = *in.IsActive
	}
	if in.Skills == nil {
		in.Skills = []string{}
	}
	if len(in.AllowedShiftCodes) == 0 {
		in.AllowedShiftCodes = []string{"ช", "บ", "ด", "ชบ", "บด", "Day", "Night", "X", "L"}
	}
	nurse := domain.Nurse{
		ID:                domain.NurseID(strings.TrimSpace(in.ID)),
		WardID:            domain.WardID(in.WardID),
		Name:              in.Name,
		Position:          pos,
		IsChargeEligible:  in.IsChargeEligible,
		CanDoubleShift:    in.CanDoubleShift,
		IsPartTime:        in.IsPartTime,
		IsActive:          isActive,
		Skills:            in.Skills,
		AllowedShiftCodes: in.AllowedShiftCodes,
		Version:           1,
		CreatedBy:         actor(r).ID,
	}
	if err := a.services.Nurse.CreateNurse(r.Context(), nurse); err != nil {
		writeError(w, http.StatusBadRequest, "nurse_creation_failed", err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{
		"message": "เพิ่มบุคลากรสำเร็จ",
		"data": map[string]any{
			"id":                nurse.ID,
			"wardId":            nurse.WardID,
			"name":              nurse.Name,
			"position":          nurse.Position,
			"isChargeEligible":  nurse.IsChargeEligible,
			"canDoubleShift":    nurse.CanDoubleShift,
			"isPartTime":        nurse.IsPartTime,
			"isActive":          nurse.IsActive,
			"skills":            nurse.Skills,
			"allowedShiftCodes": nurse.AllowedShiftCodes,
		},
	})
}

func (a *API) handleGetNurse(w http.ResponseWriter, r *http.Request) {
	if a.services.Nurse == nil {
		writeError(w, http.StatusNotFound, "not_found", "ไม่พบข้อมูลบุคลากร")
		return
	}
	id := domain.NurseID(r.PathValue("id"))
	n, err := a.services.Nurse.GetNurse(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusNotFound, "not_found", "ไม่พบข้อมูลบุคลากร")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"data": map[string]any{
			"id":                n.ID,
			"wardId":            n.WardID,
			"name":              n.Name,
			"position":          n.Position,
			"isChargeEligible":  n.IsChargeEligible,
			"canDoubleShift":    n.CanDoubleShift,
			"isPartTime":        n.IsPartTime,
			"isActive":          n.IsActive,
			"skills":            n.Skills,
			"allowedShiftCodes": n.AllowedShiftCodes,
			"version":           n.Version,
		},
	})
}

func (a *API) handleUpdateNurse(w http.ResponseWriter, r *http.Request) {
	if a.services.Nurse == nil {
		writeError(w, http.StatusNotFound, "not_found", "ไม่พบข้อมูลบุคลากร")
		return
	}
	id := domain.NurseID(r.PathValue("id"))
	n, err := a.services.Nurse.GetNurse(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusNotFound, "not_found", "ไม่พบข้อมูลบุคลากร")
		return
	}
	var in struct {
		Name              string   `json:"name"`
		Position          string   `json:"position"`
		IsChargeEligible  *bool    `json:"isChargeEligible"`
		CanDoubleShift    *bool    `json:"canDoubleShift"`
		IsPartTime        *bool    `json:"isPartTime"`
		IsActive          *bool    `json:"isActive"`
		Skills            []string `json:"skills"`
		AllowedShiftCodes []string `json:"allowedShiftCodes"`
	}
	if !decode(w, r, &in) {
		return
	}
	if in.Name != "" {
		n.Name = strings.TrimSpace(in.Name)
	}
	if in.Position != "" {
		pos := domain.Position(in.Position)
		if pos == domain.PositionRN || pos == domain.PositionPN {
			n.Position = pos
		}
	}
	if in.IsChargeEligible != nil {
		n.IsChargeEligible = *in.IsChargeEligible
	}
	if in.CanDoubleShift != nil {
		n.CanDoubleShift = *in.CanDoubleShift
	}
	if in.IsPartTime != nil {
		n.IsPartTime = *in.IsPartTime
	}
	if in.IsActive != nil {
		n.IsActive = *in.IsActive
	}
	if in.Skills != nil {
		n.Skills = in.Skills
	}
	if in.AllowedShiftCodes != nil {
		n.AllowedShiftCodes = in.AllowedShiftCodes
	}
	n.UpdatedBy = actor(r).ID
	if err := a.services.Nurse.UpdateNurse(r.Context(), n); err != nil {
		writeError(w, http.StatusInternalServerError, "update_failed", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"message": "แก้ไขข้อมูลบุคลากรสำเร็จ", "data": n})
}

func (a *API) handleToggleNurseStatus(w http.ResponseWriter, r *http.Request) {
	if a.services.Nurse == nil {
		writeError(w, http.StatusNotFound, "not_found", "ไม่พบข้อมูลบุคลากร")
		return
	}
	id := domain.NurseID(r.PathValue("id"))
	var in struct {
		IsActive bool `json:"isActive"`
	}
	if !decode(w, r, &in) {
		return
	}
	act := actor(r)
	if err := a.services.Nurse.SetStatus(r.Context(), id, in.IsActive, act.ID); err != nil {
		writeError(w, http.StatusBadRequest, "status_change_failed", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"message": "เปลี่ยนสถานะบุคลากรสำเร็จ", "isActive": in.IsActive})
}
