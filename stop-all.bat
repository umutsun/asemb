@echo off
echo ================================================================
echo                 ASB All Services Stop
echo ================================================================
echo.

echo 1. Backend processes sonlandiriliyor...
wmic process where "name='node.exe' AND commandline LIKE '%%alice-semantic-bridge%%backend%%'" delete

echo 2. Frontend processes sonlandiriliyor...
wmic process where "name='node.exe' AND commandline LIKE '%%alice-semantic-bridge%%frontend%%'" delete

echo.
echo ================================================================
echo                Tum Servisler Durdu!
echo ================================================================
echo.
timeout /t 2
exit