@echo off
REM Starts the MeetMind backend (port 8000) and frontend (port 3000) in two windows.
cd /d "%~dp0"
start "MeetMind API" cmd /k "cd backend && .venv\Scripts\python -m uvicorn app:app --reload --port 8000"
start "MeetMind Web" cmd /k "cd frontend && npm run dev"
timeout /t 6 >nul
start http://localhost:3000
