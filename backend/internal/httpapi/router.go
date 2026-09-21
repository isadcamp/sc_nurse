package httpapi

import (
	"encoding/json"
	"log"
	"net/http"
	"nurse-scheduler/backend/internal/domain"
	"time"
)

// API holds the service bundle for handlers.
type API struct {
	services Services
}

// NewRouter creates a new router with the provided services.
func NewRouter(services Services, frontendOrigin string) http.Handler {
	api := &API{services: services}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", api.health)
	mux.HandleFunc("POST /api/v1/schedules/generate", api.generate)

	// Sprint 8: Ward and Nurse management
	api.wardNurseRoutes(mux)

	// Auth and User Management
	api.authRoutes(mux)
	api.userManagementRoutes(mux)

	// Shift types endpoint
	mux.HandleFunc("GET /api/v1/shift-types", api.listShiftTypes)
	if services.ShiftType != nil {
		mux.HandleFunc("GET /api/v1/wards/{ward}/shift-types", api.listWardShiftTypes)
		mux.HandleFunc("POST /api/v1/wards/{ward}/shift-types", api.createWardShiftType)
	}

	// Sprint 9: Holiday and Leave Request management
	api.holidayLeaveRoutes(mux)

	if services.Roster != nil {
		api.rosterRoutes(mux)
	}
	if services.Solver != nil {
		api.solverRoutes(mux)
	}
	api.aiRoutes(mux)
	return logging(cors(frontendOrigin, recoverer(authenticate(services.User, services.Credentials, mux))))
}

func (a *API) health(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"status": "ok", "time": time.Now().UTC()})
}

// generate is a placeholder indicating not implemented yet.
func (a *API) generate(w http.ResponseWriter, r *http.Request) {
	writeError(w, http.StatusNotImplemented, "not_implemented", "schedule generation not implemented yet")
}

func (a *API) listWardShiftTypes(w http.ResponseWriter, r *http.Request) {
	ward := r.PathValue("ward")
	data, err := a.services.ShiftType.ListShiftTypes(r.Context(), domain.WardID(ward))
	if err != nil {
		fail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": data})
}
func (a *API) createWardShiftType(w http.ResponseWriter, r *http.Request) {
	var st domain.ShiftType
	if !decode(w, r, &st) {
		return
	}
	st.WardID = domain.WardID(r.PathValue("ward"))
	if err := a.services.ShiftType.CreateShiftType(r.Context(), st); err != nil {
		fail(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"data": st})
}

// listShiftTypes is a stub handler for future implementation.
func (a *API) listShiftTypes(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"data": []any{}})
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	if body, ok := payload.(map[string]any); ok {
		if _, exists := body["error"]; exists {
			body["requestId"] = w.Header().Get("X-Request-ID")
		}
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func writeError(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, map[string]any{"error": map[string]any{"code": code, "message": message, "details": []any{}}})
}

func cors(origin string, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		reqOrigin := r.Header.Get("Origin")
		if reqOrigin != "" {
			w.Header().Set("Access-Control-Allow-Origin", reqOrigin)
		} else if origin != "" {
			w.Header().Set("Access-Control-Allow-Origin", origin)
		} else {
			w.Header().Set("Access-Control-Allow-Origin", "*")
		}
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Request-ID")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Credentials", "true")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func recoverer(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if recovered := recover(); recovered != nil {
				log.Printf("panic: %v", recovered)
				writeError(w, http.StatusInternalServerError, "internal_error", "internal server error")
			}
		}()
		next.ServeHTTP(w, r)
	})
}

func logging(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		started := time.Now()
		next.ServeHTTP(w, r)
		log.Printf("%s %s %s", r.Method, r.URL.Path, time.Since(started))
	})
}
