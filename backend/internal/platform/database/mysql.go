package database

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"time"

	"github.com/go-sql-driver/mysql"
)

type Config struct {
	Host     string
	Port     string
	User     string
	Password string
	DBName   string
}

func NewConfigFromEnv() Config {
	return Config{
		Host:     getEnv("DB_HOST", "127.0.0.1"),
		Port:     getEnv("DB_PORT", "3306"),
		User:     getEnv("DB_USER", "root"),
		Password: getEnv("DB_PASSWORD", ""),
		DBName:   getEnv("DB_NAME", "nurse"),
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// NewConnection creates a *sql.DB with appropriate DSN and connection pool settings.
func NewConnection(cfg Config) (*sql.DB, error) {
	settings := mysql.NewConfig()
	settings.User = cfg.User
	settings.Passwd = cfg.Password
	settings.Net = "tcp"
	settings.Addr = cfg.Host + ":" + cfg.Port
	settings.DBName = cfg.DBName
	settings.ParseTime = true
	settings.Loc = time.UTC
	settings.Collation = "utf8mb4_unicode_ci"
	settings.Params = map[string]string{"charset": "utf8mb4", "time_zone": "'+00:00'"}
	db, err := sql.Open("mysql", settings.FormatDSN())
	if err != nil {
		return nil, fmt.Errorf("open mysql: %w", err)
	}
	// Connection pool settings
	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(25)
	db.SetConnMaxLifetime(5 * time.Minute)

	// Verify connection
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := db.PingContext(ctx); err != nil {
		return nil, fmt.Errorf("ping mysql: %w", err)
	}
	return db, nil
}

// HealthCheck pings the DB
func HealthCheck(ctx context.Context, db *sql.DB) error {
	return db.PingContext(ctx)
}
