@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo   Takalot - הרצת האתר לוקאלית לבדיקות
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-local.ps1"
set EXIT_CODE=%ERRORLEVEL%
if %EXIT_CODE% NEQ 0 (
    echo.
    echo   ההרצה נכשלה. ראה את ההודעות למעלה.
    pause
    exit /b %EXIT_CODE%
)
