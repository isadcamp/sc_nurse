package httpapi

import (
	"net/http"
	"nurse-scheduler/backend/internal/domain"
	"strings"
)

func (a *API) authRoutes(mux *http.ServeMux) {
	mux.HandleFunc("POST /api/v1/auth/login", a.handleLogin)
	mux.HandleFunc("POST /api/v1/auth/logout", a.handleLogout)
	mux.HandleFunc("GET /api/v1/auth/me", a.handleGetMe)
	mux.HandleFunc("PUT /api/v1/auth/password", a.handleChangePassword)
}

func (a *API) handleLogin(w http.ResponseWriter, r *http.Request) {
	if a.services.User == nil {
		writeError(w, http.StatusNotImplemented, "not_implemented", "user service not initialized")
		return
	}

	var in struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if !decode(w, r, &in) {
		return
	}

	token, user, err := a.services.User.Login(r.Context(), in.Username, in.Password)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "invalid_credentials", err.Error())
		return
	}

	// If admin, they can access all wards
	allWards := user.Wards
	if user.Role == domain.RoleAdmin && a.services.Ward != nil {
		wards, _ := a.services.Ward.ListWards(r.Context())
		if len(allWards) == 0 && len(wards) > 0 {
			for _, wd := range wards {
				allWards = append(allWards, string(wd.ID))
			}
		}
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"token": token,
		"user": map[string]any{
			"id":          user.ID,
			"username":    user.Username,
			"displayName": user.DisplayName,
			"email":       user.Email,
			"role":        user.Role,
			"wards":       allWards,
			"isActive":    user.IsActive,
			"lastLoginAt": user.LastLoginAt,
		},
	})
}

func (a *API) handleLogout(w http.ResponseWriter, r *http.Request) {
	if a.services.User == nil {
		writeJSON(w, http.StatusOK, map[string]any{"message": "ออกจากระบบสำเร็จ"})
		return
	}
	token := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
	if token != "" {
		_ = a.services.User.Logout(r.Context(), token)
	}
	writeJSON(w, http.StatusOK, map[string]any{"message": "ออกจากระบบสำเร็จ"})
}

func (a *API) handleGetMe(w http.ResponseWriter, r *http.Request) {
	act := actor(r)
	if act.ID == "" {
		writeError(w, http.StatusUnauthorized, "unauthorized", "กรุณายืนยันตัวตน")
		return
	}

	// If DB user exists
	if a.services.User != nil {
		token := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
		u, err := a.services.User.ValidateToken(r.Context(), token)
		if err == nil && u != nil {
			allWards := u.Wards
			if u.Role == domain.RoleAdmin && a.services.Ward != nil {
				wards, _ := a.services.Ward.ListWards(r.Context())
				allWards = make([]string, 0, len(wards))
				for _, wd := range wards {
					allWards = append(allWards, string(wd.ID))
				}
			}
			writeJSON(w, http.StatusOK, map[string]any{
				"id":          u.Username,
				"username":    u.Username,
				"displayName": u.DisplayName,
				"email":       u.Email,
				"role":        u.Role,
				"wards":       allWards,
			})
			return
		}
	}

	// Fallback for static token
	writeJSON(w, http.StatusOK, map[string]any{
		"id":          act.ID,
		"username":    act.ID,
		"displayName": act.ID,
		"role":        act.Role,
		"wards":       act.Wards,
	})
}

func (a *API) handleChangePassword(w http.ResponseWriter, r *http.Request) {
	if a.services.User == nil {
		writeError(w, http.StatusNotImplemented, "not_implemented", "user service not initialized")
		return
	}
	token := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
	u, err := a.services.User.ValidateToken(r.Context(), token)
	if err != nil || u == nil {
		writeError(w, http.StatusUnauthorized, "unauthorized", "ไม่สามารถเปลี่ยนรหัสผ่านสำหรับผู้ใช้นี้ได้")
		return
	}

	var in struct {
		OldPassword string `json:"oldPassword"`
		NewPassword string `json:"newPassword"`
	}
	if !decode(w, r, &in) {
		return
	}

	// Verify old password
	_, _, err = a.services.User.Login(r.Context(), u.Username, in.OldPassword)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_password", "รหัสผ่านเดิมไม่ถูกต้อง")
		return
	}

	if err := a.services.User.UpdatePassword(r.Context(), u.ID, in.NewPassword, u.Username); err != nil {
		writeError(w, http.StatusBadRequest, "password_error", err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"message": "เปลี่ยนรหัสผ่านสำเร็จ"})
}
