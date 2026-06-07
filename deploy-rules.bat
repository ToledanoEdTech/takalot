@echo off
chcp 65001 >nul
cd /d "%~dp0"
set NODE_OPTIONS=--use-system-ca
echo.
echo   פריסת כללי Firestore ל-Firebase...
echo.
firebase deploy --only firestore:rules
set EXIT_CODE=%ERRORLEVEL%
if %EXIT_CODE% NEQ 0 (
    echo.
    echo   הפריסה נכשלה.
    pause
    exit /b %EXIT_CODE%
)
echo.
echo   הכללים עודכנו בהצלחה.
pause
