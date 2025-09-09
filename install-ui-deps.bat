@echo off
echo Installing UI dependencies...

cd frontend

echo Installing class-variance-authority and clsx...
npm install class-variance-authority clsx tailwind-merge @radix-ui/react-slot lucide-react

echo.
echo Done! Now restart the frontend:
echo npm run dev
echo.
pause