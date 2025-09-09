@echo off
echo Setting up ASEMB Database on luwi.dev server...
echo.

set PGPASSWORD=Semsiye!22
set PGHOST=91.99.229.96
set PGUSER=postgres

echo Creating asemb database...
psql -h %PGHOST% -U %PGUSER% -c "CREATE DATABASE asemb;"

echo Connecting to asemb and setting up tables...
psql -h %PGHOST% -U %PGUSER% -d asemb -f create-asemb-db.sql

echo.
echo Database setup complete!
echo.
echo Testing connection...
psql -h %PGHOST% -U %PGUSER% -d asemb -c "SELECT version();"

pause