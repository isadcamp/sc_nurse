package database

import (
	"context"
	"database/sql"
	"encoding/json"
	"nurse-scheduler/backend/internal/domain"
	"nurse-scheduler/backend/internal/repository"
)

type SolverStore struct{ DB *sql.DB }

func (s *SolverStore) CreateJob(ctx context.Context, j domain.SolverJob) error {
	b, e := json.Marshal(j)
	if e != nil {
		return e
	}
	snapshot, e := json.Marshal(j.Input.Snapshot)
	if e != nil {
		return e
	}
	tx, e := s.DB.BeginTx(ctx, nil)
	if e != nil {
		return e
	}
	defer tx.Rollback()
	if _, e = tx.ExecContext(ctx, "INSERT INTO solver_jobs(id,schedule_id,status,data,created_at,updated_at) VALUES(?,?,?,?,?,?)", j.ID, j.ScheduleID, j.Status, b, j.CreatedAt, j.UpdatedAt); e != nil {
		return dbError(e)
	}
	if _, e = tx.ExecContext(ctx, "INSERT INTO policy_snapshots(job_id,snapshot_hash,data) VALUES(?,?,?)", j.ID, j.Input.Snapshot.Hash, snapshot); e != nil {
		return e
	}
	return tx.Commit()
}
func (s *SolverStore) GetJob(ctx context.Context, id string) (domain.SolverJob, error) {
	var j domain.SolverJob
	var b []byte
	var status string
	e := s.DB.QueryRowContext(ctx, "SELECT data,status FROM solver_jobs WHERE id=?", id).Scan(&b, &status)
	if e != nil {
		return j, dbError(e)
	}
	if e = json.Unmarshal(b, &j); e != nil {
		return j, e
	}
	j.Status = status
	return j, nil
}
func (s *SolverStore) UpdateJob(ctx context.Context, j domain.SolverJob, previous string) error {
	b, e := json.Marshal(j)
	if e != nil {
		return e
	}
	tx, e := s.DB.BeginTx(ctx, nil)
	if e != nil {
		return e
	}
	defer tx.Rollback()
	result, e := tx.ExecContext(ctx, "UPDATE solver_jobs SET status=?,data=?,updated_at=? WHERE id=? AND status=?", j.Status, b, j.UpdatedAt, j.ID, previous)
	if e != nil {
		return e
	}
	n, e := result.RowsAffected()
	if e != nil {
		return e
	}
	if n != 1 {
		return repository.ErrConflict
	}
	if j.Result != nil {
		score, e := json.Marshal(j.Result.Score)
		if e != nil {
			return e
		}
		if _, e = tx.ExecContext(ctx, "INSERT INTO schedule_scores(job_id,data) VALUES(?,?) ON DUPLICATE KEY UPDATE data=VALUES(data)", j.ID, score); e != nil {
			return e
		}
	}
	return tx.Commit()
}

// Deployment runs one job executor. Interrupted computations never resume with fresh input.
func (s *SolverStore) InterruptJobs(ctx context.Context) error {
	_, e := s.DB.ExecContext(ctx, "UPDATE solver_jobs SET status='failed',data=JSON_SET(data,'$.status','failed','$.error','interrupted by server restart'),updated_at=UTC_TIMESTAMP(6) WHERE status IN ('pending','running')")
	return e
}
