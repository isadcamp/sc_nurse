package scheduler
import (
  "context"
  "testing"
  "time"
  "nurse-scheduler/backend/internal/platform/database"
  "nurse-scheduler/backend/internal/domain"
)
func TestLiveDiagnosticReadOnly(t *testing.T) {
  db,e:=database.NewConnection(database.NewConfigFromEnv()); if e!=nil {t.Fatal(e)}; defer db.Close()
  r,e:=(&database.RosterStore{DB:db}).Get(context.Background(),165); if e!=nil {t.Fatal(e)}
  date:="2026-04-01"
  for _,sh:=range r.Shifts { if sh.Code=="X"||sh.Code=="L" {continue}; allowed,safe:=0,0; for _,n:=range r.Staff { if !n.Active {continue}; for _,c:=range n.Allowed {if c==sh.Code {allowed++; if candidateSafe(r,nil,nil,nil,n,date,sh.Code) {safe++}; break}} }; t.Logf("code=%s allowed=%d safe=%d",sh.Code,allowed,safe) }
  snap,e:=Snapshot(r); if e!=nil {t.Fatal(e)}
  out,e:=solveGreedy(context.Background(),domain.SolverInput{Snapshot:snap,MaxDuration:3*time.Second,MaxNodes:3000}); if e!=nil {t.Fatal(e)}
  working:=0; for _,c:=range out.Assignments {if c.ShiftCode!=""&&c.ShiftCode!="X"&&c.ShiftCode!="L"&&c.ShiftCode!="อบ" {working++}}
  counts:=map[string]int{}; for _,v:=range out.Violations {if v.Severity=="error" {counts[v.RuleCode]++}}; t.Logf("greedy status=%s working=%d errors=%v",out.Status,working,counts)
}
