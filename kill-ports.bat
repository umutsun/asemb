@echo off
echo Killing all Node.js processes on ports 8080 and 3000...

REM Kill port 8080
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8080') do (
    echo Killing process on port 8080 (PID: %%a)
    taskkill /F /PID %%a 2>nul
)

REM Kill port 3000  
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000') do (
    echo Killing process on port 3000 (PID: %%a)
    taskkill /F /PID %%a 2>nul
)

echo.
echo Ports cleared! Now you can start:
echo 1. Backend: cd backend ^&^& npm run dev
echo 2. Frontend: cd frontend ^&^& npm run dev
echo.
pause