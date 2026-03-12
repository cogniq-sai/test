@echo off
echo =======================================
echo    AI SEO PROJECT - AUTO START
echo =======================================

:: Kill any old processes on Port 3000 (Frontend) and 8000 (Backend)
echo [1/3] Cleaning up old sessions...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3000') do taskkill /f /pid %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8000') do taskkill /f /pid %%a >nul 2>&1

:: Start Backend in a new window
echo [2/3] Starting Backend (Port 8000)...
start "Backend Service" cmd /k "cd backend && .\venv\Scripts\python main.py"

:: Start Frontend in a new window
echo [3/3] Starting Frontend (Port 3000)...
start "Frontend UI" cmd /k "cd ai-seo-frontend-latest-main && npm run dev"

echo.
echo =======================================
echo SUCCESS: Everything is starting!
echo.
echo 1. Wait for both terminals to show "Ready" or "Started"
echo 2. Open: http://localhost:3000
echo 3. If you see "JWT expired", just refresh or Log In again.
echo =======================================
pause
