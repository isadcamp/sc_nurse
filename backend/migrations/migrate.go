package migrations

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
)

type Migration struct {
	Version int
	Path    string
}

func LoadMigrations(dir string) ([]Migration, error) {
	entries, e := os.ReadDir(dir)
	if e != nil {
		return nil, e
	}
	out := []Migration{}
	seen := map[int]bool{}
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".sql") {
			continue
		}
		parts := strings.SplitN(entry.Name(), "_", 2)
		if len(parts) != 2 {
			return nil, fmt.Errorf("invalid migration name %s", entry.Name())
		}
		v, e := strconv.Atoi(parts[0])
		if e != nil || v < 1 || seen[v] {
			return nil, fmt.Errorf("invalid or duplicate migration version %s", entry.Name())
		}
		seen[v] = true
		out = append(out, Migration{v, filepath.Join(dir, entry.Name())})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Version < out[j].Version })
	return out, nil
}
func EnsureSchemaMigrations(db *sql.DB) error {
	_, e := db.Exec("CREATE TABLE IF NOT EXISTS schema_migrations(version INT PRIMARY KEY,applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB")
	return e
}
func GetAppliedVersions(db *sql.DB) (map[int]bool, error) {
	rows, e := db.Query("SELECT version FROM schema_migrations")
	if e != nil {
		return nil, e
	}
	defer rows.Close()
	out := map[int]bool{}
	for rows.Next() {
		var v int
		if e = rows.Scan(&v); e != nil {
			return nil, e
		}
		out[v] = true
	}
	return out, rows.Err()
}

// Apply executes single-statement DDL migrations. MySQL DDL commits implicitly;
// recording the version follows successful DDL. See docs/sprint3-operations.md for crash recovery.
func Apply(db *sql.DB, dir string) error {
	if e := EnsureSchemaMigrations(db); e != nil {
		return e
	}
	migs, e := LoadMigrations(dir)
	if e != nil {
		return e
	}
	done, e := GetAppliedVersions(db)
	if e != nil {
		return e
	}
	for _, m := range migs {
		if done[m.Version] {
			continue
		}
		b, e := os.ReadFile(m.Path)
		if e != nil {
			return e
		}
		if _, e = db.Exec(string(b)); e != nil {
			return fmt.Errorf("migration %d: %w", m.Version, e)
		}
		if _, e = db.Exec("INSERT INTO schema_migrations(version) VALUES(?)", m.Version); e != nil {
			return fmt.Errorf("record migration %d after DDL: %w", m.Version, e)
		}
	}
	return nil
}
