@echo off
echo ========================================
echo ASB-CLI Kopya Temizleyici
echo ========================================
echo.
echo Kullanilan ASB-CLI: C:\mcp-servers\asb-cli
echo.
echo Diger olasi kopyalar araniyor...
echo.

REM Check common locations
if exist "C:\asb-cli" if not "C:\asb-cli"=="C:\mcp-servers\asb-cli" (
    echo [!] Bulundu: C:\asb-cli
    echo    Silmek icin: rmdir /s /q "C:\asb-cli"
)

if exist "C:\Users\umut.demirci\asb-cli" (
    echo [!] Bulundu: C:\Users\umut.demirci\asb-cli
    echo    Silmek icin: rmdir /s /q "C:\Users\umut.demirci\asb-cli"
)

if exist "C:\xampp\htdocs\alice-semantic-bridge\asb-cli" (
    echo [!] Bulundu: C:\xampp\htdocs\alice-semantic-bridge\asb-cli
    echo    Silmek icin: rmdir /s /q "C:\xampp\htdocs\alice-semantic-bridge\asb-cli"
)

if exist "C:\xampp\htdocs\alice-semantic-bridge\nodes\asb-cli" (
    echo [!] Bulundu: C:\xampp\htdocs\alice-semantic-bridge\nodes\asb-cli
    echo    Silmek icin: rmdir /s /q "C:\xampp\htdocs\alice-semantic-bridge\nodes\asb-cli"
)

echo.
echo Not: Yukaridaki komutlari calistirmadan once emin olun!
echo Suanda kullanilan: C:\mcp-servers\asb-cli
echo.
pause
