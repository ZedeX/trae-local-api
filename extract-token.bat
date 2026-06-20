@echo off
chcp 65001 >nul 2>nul
setlocal enabledelayedexpansion

echo ============================================
echo   Trae Token Auto-Extractor
echo ============================================
echo.

set SCRIPT_DIR=%~dp0

set NODE_EXE=node
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [WARN] node.exe not found in PATH, trying common locations...
    if exist "D:\_program\node\node.exe" set NODE_EXE=D:\_program\node\node.exe
    if exist "C:\Program Files\nodejs\node.exe" set NODE_EXE="C:\Program Files\nodejs\node.exe"
    if exist "C:\Program Files (x86)\nodejs\node.exe" set NODE_EXE="C:\Program Files (x86)\nodejs\node.exe"
)

echo Using Node.js: %NODE_EXE%
echo.

%NODE_EXE% "%SCRIPT_DIR%scripts\log-analysis\extract-completion-jwt.js"

if %errorlevel% equ 0 (
    echo.
    echo [OK] Token extracted and saved to .env
) else (
    echo.
    echo [FAIL] Token extraction failed
    echo Make sure Trae IDE is running and you have logged in.
    echo If node.exe is not found, please install Node.js or set NODE_EXE environment variable.
)

echo.
pause