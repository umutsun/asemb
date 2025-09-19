@echo off
echo Frontend node processes'i sonlandiriliyor...
for /f "tokens=2" %%a in ('tasklist ^| findstr "node.*3000"') do taskkill //F //PID %%a
echo Frontend sonlandi.
pause