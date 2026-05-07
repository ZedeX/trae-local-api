@echo off
chcp 65001 >nul 2>nul
setlocal enabledelayedexpansion

echo ============================================
echo   Trae Token Auto-Extractor
echo ============================================
echo.

set NODE_EXE=D:\_program\node\node.exe
set SCRIPT_DIR=%~dp0

%NODE_EXE% "%SCRIPT_DIR%scripts\log-analysis\extract-completion-jwt.js"

if %errorlevel% equ 0 (
    echo.
    echo [OK] Token extracted and saved to .env
) else (
    echo.
    echo [FAIL] Token extraction failed
    echo Make sure Trae IDE is running and you have logged in.
)

echo.
pause
