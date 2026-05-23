@echo off
chcp 65001 >nul 2>nul
setlocal enabledelayedexpansion

set SOURCE_DIR=%~dp0output
set DEST_DIR=%WORKSPACE_DIR%

if not exist "%DEST_DIR%" (
    echo Creating destination directory: %DEST_DIR%
    mkdir "%DEST_DIR%"
)

echo ============================================
echo   Trae Local API - Output Sync Tool
echo ============================================
echo.
echo Source: %SOURCE_DIR%
echo Dest:   %DEST_DIR%
echo.

set /a count=0
set /a skipped=0

for /r "%SOURCE_DIR%" %%F in (*) do (
    set "rel=%%F"
    set "rel=!rel:%SOURCE_DIR%\=!"
    set "dest=%DEST_DIR%\!rel!"
    
    if exist "!dest!" (
        echo [SKIP] !rel! - already exists
        set /a skipped+=1
    ) else (
        set "dest_dir=!dest!"
        if not exist "!dest:\!rel!=!\!" mkdir "!dest:\!rel!=!\!" 2>nul
        copy "%%F" "!dest!" >nul 2>nul
        if !errorlevel! equ 0 (
            echo [COPY] !rel!
            set /a count+=1
        ) else (
            echo [FAIL] !rel!
        )
    )
)

echo.
echo ============================================
echo   Copied: %count% files
echo   Skipped: %skipped% files (already exist)
echo ============================================
echo.
pause
