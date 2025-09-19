@echo off
echo ================================================================
echo                   ASB Frontend Stop
echo ================================================================
echo.

echo Frontend processes sonlandiriliyor...
wmic process where "name='node.exe' AND commandline LIKE '%%alice-semantic-bridge%%frontend%%'" delete

echo.
echo ================================================================
echo                    Frontend Durdu!
echo ================================================================
echo.
timeout /t 2
exit