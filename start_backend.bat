@echo off
title Nurse Scheduler - Backend API
cd /d "%~dp0backend"
set ROSTER_CREDENTIALS=[{"id":"head-nurse","token":"1234","role":"head","wards":["A","ward-1","ward-icu"]},{"id":"head-nurse-full","token":"head-nurse-secret-token-2026","role":"head","wards":["A","ward-1","ward-icu"]}]
set HTTP_ADDR=:8080
set FRONTEND_ORIGIN=http://localhost:3000
set DB_HOST=127.0.0.1
set DB_PORT=3306
set DB_USER=root
set DB_PASSWORD=
set DB_NAME=nurse

echo Starting Backend API on :8080...
go run ./cmd/api
pause
