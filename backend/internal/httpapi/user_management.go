package httpapi

import (
	"net/http"
	"nurse-scheduler/backend/internal/domain"
	"strconv"
	"strings"
)

func (a *API) userManagementRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/v1/users", a.handleListUsers)
	mux.HandleFunc("POST /api/v1/users", a.handleCreateUser)
	mux.HandleFunc("GET /api/v1/users/{id}", a.handleGetUser)
	mux.HandleFunc("PUT /api/v1/users/{id}", a.handleUpdateUser)
	mux.HandleFunc("PUT /api/v1/users/{id}/password", a.handleAdminResetPassword)
	mux.HandleFunc("PATCH /api/v1/users/{id}/status", a.handleToggleUserStatus)
	mux.HandleFunc("DELETE /api/v1/users/{id}", a.handleDeleteUser)
}

func (a *API) handleListUsers(w http.ResponseWriter, r *http.Request) {
	if a.services.User == nil {
		writeJSON(w, http.StatusOK, map[string]any{"data": []any{}})
		return
	}
	act := actor(r)
	if act.Role != "admin" {
		writeError(w, http.StatusForbidden, "forbidden", "เฉพาะผู้ดูแลระบบ (Admin) เท่านั้นที่สามารถจัดการผู้ใช้งานได้")
		return
	}

	users, err := a.services.User.ListUsers(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "ไม่สามารถดึงรายชื่อผู้ใช้ได้")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"data": users})
}

func (a *API) handleCreateUser(w http.ResponseWriter, r *http.Request) {
	if a.services.User == nil {
		writeError(w, http.StatusNotImplemented, "not_implemented", "user service not initialized")
		return
	}
	act := actor(r)
	if act.Role != "admin" {
		writeError(w, http.StatusForbidden, "forbidden", "เฉพาะผู้ดูแลระบบ (Admin) เท่านั้นที่สามารถสร้างผู้ใช้งานได้")
		return
	}

	var in struct {
		Username    string   `json:"username"`
		Password    string   `json:"password"`
		DisplayName string   `json:"displayName"`
		Email       string   `json:"email"`
		Role        string   `json:"role"`
		IsActive    *bool    `json:"isActive"`
		Wards       []string `json:"wards"`
	}
	if !decode(w, r, &in) {
		return
	}

	isActive := true
	if in.IsActive != nil {
		isActive = *in.IsActive
	}

	role := domain.UserRole(strings.TrimSpace(in.Role))
	if role != domain.RoleAdmin && role != domain.RoleHead && role != domain.RoleNurse && role != domain.RoleViewer {
		role = domain.RoleViewer
	}

	u := domain.User{
		Username:    strings.TrimSpace(in.Username),
		DisplayName: strings.TrimSpace(in.DisplayName),
		Email:       strings.TrimSpace(in.Email),
		Role:        role,
		IsActive:    isActive,
		Wards:       in.Wards,
		CreatedBy:   act.ID,
	}

	id, err := a.services.User.CreateUser(r.Context(), u, in.Password)
	if err != nil {
		writeError(w, http.StatusBadRequest, "user_creation_failed", err.Error())
		return
	}

	u.ID = id
	writeJSON(w, http.StatusCreated, map[string]any{
		"message": "สร้างผู้ใช้งานสำเร็จ",
		"data":    u,
	})
}

func (a *API) handleGetUser(w http.ResponseWriter, r *http.Request) {
	if a.services.User == nil {
		writeError(w, http.StatusNotFound, "not_found", "ไม่พบข้อมูลผู้ใช้")
		return
	}
	act := actor(r)
	if act.Role != "admin" {
		writeError(w, http.StatusForbidden, "forbidden", "ไม่มีสิทธิ์เข้าถึง")
		return
	}

	id, err := strconv.Atoi(r.PathValue("id"))
	if err != nil || id < 1 {
		writeError(w, http.StatusBadRequest, "invalid_id", "รหัสผู้ใช้ไม่ถูกต้อง")
		return
	}

	u, err := a.services.User.GetUser(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusNotFound, "not_found", err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"data": u})
}

func (a *API) handleUpdateUser(w http.ResponseWriter, r *http.Request) {
	if a.services.User == nil {
		writeError(w, http.StatusNotFound, "not_found", "ไม่พบข้อมูลผู้ใช้")
		return
	}
	act := actor(r)
	if act.Role != "admin" {
		writeError(w, http.StatusForbidden, "forbidden", "ไม่มีสิทธิ์เข้าถึง")
		return
	}

	id, err := strconv.Atoi(r.PathValue("id"))
	if err != nil || id < 1 {
		writeError(w, http.StatusBadRequest, "invalid_id", "รหัสผู้ใช้ไม่ถูกต้อง")
		return
	}

	u, err := a.services.User.GetUser(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusNotFound, "not_found", err.Error())
		return
	}

	var in struct {
		DisplayName string   `json:"displayName"`
		Email       string   `json:"email"`
		Role        string   `json:"role"`
		IsActive    *bool    `json:"isActive"`
		Wards       []string `json:"wards"`
	}
	if !decode(w, r, &in) {
		return
	}

	if in.DisplayName != "" {
		u.DisplayName = strings.TrimSpace(in.DisplayName)
	}
	if in.Email != "" {
		u.Email = strings.TrimSpace(in.Email)
	}
	if in.Role != "" {
		role := domain.UserRole(strings.TrimSpace(in.Role))
		if role == domain.RoleAdmin || role == domain.RoleHead || role == domain.RoleNurse || role == domain.RoleViewer {
			u.Role = role
		}
	}
	if in.IsActive != nil {
		u.IsActive = *in.IsActive
	}
	if in.Wards != nil {
		u.Wards = in.Wards
	}
	u.UpdatedBy = act.ID

	if err := a.services.User.UpdateUser(r.Context(), *u); err != nil {
		writeError(w, http.StatusBadRequest, "update_failed", err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"message": "แก้ไขข้อมูลผู้ใช้สำเร็จ", "data": u})
}

func (a *API) handleAdminResetPassword(w http.ResponseWriter, r *http.Request) {
	if a.services.User == nil {
		writeError(w, http.StatusNotFound, "not_found", "ไม่พบข้อมูลผู้ใช้")
		return
	}
	act := actor(r)
	if act.Role != "admin" {
		writeError(w, http.StatusForbidden, "forbidden", "เฉพาะผู้ดูแลระบบ (Admin) เท่านั้นที่สามารถรีเซ็ตรหัสผ่านได้")
		return
	}

	id, err := strconv.Atoi(r.PathValue("id"))
	if err != nil || id < 1 {
		writeError(w, http.StatusBadRequest, "invalid_id", "รหัสผู้ใช้ไม่ถูกต้อง")
		return
	}

	var in struct {
		NewPassword string `json:"newPassword"`
	}
	if !decode(w, r, &in) {
		return
	}

	if err := a.services.User.UpdatePassword(r.Context(), id, in.NewPassword, act.ID); err != nil {
		writeError(w, http.StatusBadRequest, "password_error", err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"message": "รีเซ็ตรหัสผ่านสำเร็จ"})
}

func (a *API) handleToggleUserStatus(w http.ResponseWriter, r *http.Request) {
	if a.services.User == nil {
		writeError(w, http.StatusNotFound, "not_found", "ไม่พบข้อมูลผู้ใช้")
		return
	}
	act := actor(r)
	if act.Role != "admin" {
		writeError(w, http.StatusForbidden, "forbidden", "ไม่มีสิทธิ์เข้าถึง")
		return
	}

	id, err := strconv.Atoi(r.PathValue("id"))
	if err != nil || id < 1 {
		writeError(w, http.StatusBadRequest, "invalid_id", "รหัสผู้ใช้ไม่ถูกต้อง")
		return
	}

	var in struct {
		IsActive bool `json:"isActive"`
	}
	if !decode(w, r, &in) {
		return
	}

	if err := a.services.User.SetUserStatus(r.Context(), id, in.IsActive, act.ID); err != nil {
		writeError(w, http.StatusBadRequest, "status_error", err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"message": "เปลี่ยนสถานะผู้ใช้สำเร็จ", "isActive": in.IsActive})
}

func (a *API) handleDeleteUser(w http.ResponseWriter, r *http.Request) {
	if a.services.User == nil {
		writeError(w, http.StatusNotFound, "not_found", "ไม่พบข้อมูลผู้ใช้")
		return
	}
	act := actor(r)
	if act.Role != "admin" {
		writeError(w, http.StatusForbidden, "forbidden", "ไม่มีสิทธิ์เข้าถึง")
		return
	}

	id, err := strconv.Atoi(r.PathValue("id"))
	if err != nil || id < 1 {
		writeError(w, http.StatusBadRequest, "invalid_id", "รหัสผู้ใช้ไม่ถูกต้อง")
		return
	}

	if err := a.services.User.DeleteUser(r.Context(), id); err != nil {
		writeError(w, http.StatusBadRequest, "delete_error", err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"message": "ลบผู้ใช้งานสำเร็จ"})
}
