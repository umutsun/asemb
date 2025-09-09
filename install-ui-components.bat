@echo off
echo Installing shadcn/ui components...

cd frontend

REM Initialize shadcn/ui if not done
call npx shadcn-ui@latest init -y

REM Install required components
call npx shadcn-ui@latest add card
call npx shadcn-ui@latest add button
call npx shadcn-ui@latest add textarea

echo.
echo Done! Components installed.
echo.
echo Now restart your servers:
echo 1. Backend: cd backend ^&^& npm run dev
echo 2. Frontend: cd frontend ^&^& npm run dev
echo.
pause