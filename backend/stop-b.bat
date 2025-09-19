@echo off
echo ================================================================
echo                   ASB Backend Stop
echo ================================================================
echo.

echo Backend processes sonlandiriliyor...
wmic process where "name='node.exe' AND commandline LIKE '%%alice-semantic-bridge%%backend%%'" delete

echo.
echo ================================================================
echo                    Backend Durdu!
echo ================================================================
echo.
timeout /t 2
exit