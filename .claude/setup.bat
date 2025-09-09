@echo off
REM Claude Code Frontend Sandbox Setup for Windows

echo.
echo =====================================
echo 🎨 Claude Code Frontend Sandbox Setup
echo =====================================
echo.

REM Check if frontend directory exists
IF NOT EXIST ".\frontend" (
    echo Creating frontend directory...
    mkdir frontend
)

REM Check if package.json exists
IF NOT EXIST ".\frontend\package.json" (
    echo Initializing Next.js project...
    cd frontend
    call npx create-next-app@latest . --typescript --tailwind --app --src-dir --import-alias "@/*" --no-git
    cd ..
) ELSE (
    echo ✓ Next.js project already initialized
)

REM Install additional dependencies
echo.
echo Installing additional dependencies...
cd frontend

call npm install @radix-ui/react-accordion @radix-ui/react-alert-dialog @radix-ui/react-dialog @radix-ui/react-dropdown-menu @radix-ui/react-label @radix-ui/react-select @radix-ui/react-slot @radix-ui/react-tabs @radix-ui/react-toast @radix-ui/react-tooltip class-variance-authority clsx tailwind-merge lucide-react recharts @tanstack/react-query zustand socket.io-client framer-motion

REM Install dev dependencies
call npm install -D @types/node @types/react @types/react-dom eslint-config-next prettier prettier-plugin-tailwindcss

REM Setup shadcn/ui
echo.
echo Setting up shadcn/ui...
call npx shadcn-ui@latest init -y

REM Create directory structure
echo.
echo Creating directory structure...
mkdir src\components\ui 2>nul
mkdir src\components\dashboard 2>nul
mkdir src\components\common 2>nul
mkdir src\hooks 2>nul
mkdir src\utils 2>nul
mkdir src\lib 2>nul
mkdir src\styles 2>nul
mkdir src\app 2>nul

cd ..

echo.
echo ✅ Claude Code Sandbox Setup Complete!
echo.
echo To start development:
echo   1. cd frontend
echo   2. npm run dev
echo.
echo Or use VS Code: code .claude\claude.code-workspace
echo.
pause
