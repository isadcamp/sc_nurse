// Test-only HTTP fixture server. Never used by cmd/api or connected to MySQL.
package main

import (
	"log"
	"net/http"
	"nurse-scheduler/backend/internal/httpapi"
	"nurse-scheduler/backend/internal/scheduler"
	"nurse-scheduler/backend/internal/service"
	"nurse-scheduler/backend/internal/testfixture"
	"os"
)

func main() {
	if os.Getenv("ROSTER_TEST_MODE") != "1" {
		log.Fatal("test fixture requires ROSTER_TEST_MODE=1")
	}
	store := &testfixture.Memory{R: testfixture.ReadyRoster(testfixture.Roster())}
	nurseRepo := testfixture.NewNurseRepo()
	solverStore := testfixture.NewSolverStore()
	holidayRepo := testfixture.NewHolidayRepo()
	rosterSvc := &service.RosterService{Store: store}
	solverSvc := &service.SolverService{Roster: rosterSvc, Jobs: solverStore, Solver: scheduler.ConstraintSolver{}}
	handler := httpapi.NewRouter(httpapi.Services{Ward: service.NewWardService(testfixture.WardRepo{}), Nurse: service.NewNurseService(nurseRepo), Solver: solverSvc, Holiday: service.NewHolidayService(holidayRepo), Roster: rosterSvc, Credentials: []httpapi.Credential{{Token: "synthetic-head-token-for-tests-only", ID: "test-head", Role: "head", Wards: []string{"test-ward"}}}}, "http://127.0.0.1:3100")
	log.Fatal(http.ListenAndServe("127.0.0.1:8180", handler))
}
