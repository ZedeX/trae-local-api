@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

set API_BASE=http://localhost:9900
set API_KEY=trae-local-api-key

:menu
cls
echo ========================================
echo   Trae Local API - Quick Test Tool
echo ========================================
echo.
echo  [Chat]
echo  1. Chat (Stream) - auto model
echo  2. Chat (Stream) - glm-5.1
echo  3. Chat (Stream) - deepseek-v3
echo  4. Chat (Non-Stream)
echo  5. Chat with solo_coder (Reasoning)
echo.
echo  [File Output]
echo  6. Generate File (MD/HTML/etc)
echo  7. Chat + Save to File (Stream)
echo  8. List Workspace Files
echo  9. Read File Content
echo.
echo  [Tools]
echo  10. Check Server Status
echo  11. List Available Models
echo  12. Encrypt Text
echo  13. Decrypt Text
echo  14. Custom Request
echo  0. Exit
echo.
echo ========================================
set /p choice="Select option: "

if "%choice%"=="1" goto chat_auto
if "%choice%"=="2" goto chat_glm
if "%choice%"=="3" goto chat_deepseek
if "%choice%"=="4" goto chat_nonstream
if "%choice%"=="5" goto chat_solo
if "%choice%"=="6" goto gen_file
if "%choice%"=="7" goto chat_save
if "%choice%"=="8" goto list_files
if "%choice%"=="9" goto read_file
if "%choice%"=="10" goto status
if "%choice%"=="11" goto models
if "%choice%"=="12" goto encrypt
if "%choice%"=="13" goto decrypt
if "%choice%"=="14" goto custom
if "%choice%"=="0" goto end
goto menu

:chat_auto
echo.
set /p msg="You: "
echo.
curl -N "%API_BASE%/v1/chat/completions" -H "Authorization: Bearer %API_KEY%" -H "Content-Type: application/json" -d "{\"model\":\"auto\",\"messages\":[{\"role\":\"user\",\"content\":\"%msg%\"}],\"stream\":true}"
echo.
echo.
pause
goto menu

:chat_glm
echo.
set /p msg="You: "
echo.
curl -N "%API_BASE%/v1/chat/completions" -H "Authorization: Bearer %API_KEY%" -H "Content-Type: application/json" -d "{\"model\":\"glm-5.1\",\"messages\":[{\"role\":\"user\",\"content\":\"%msg%\"}],\"stream\":true}"
echo.
echo.
pause
goto menu

:chat_deepseek
echo.
set /p msg="You: "
echo.
curl -N "%API_BASE%/v1/chat/completions" -H "Authorization: Bearer %API_KEY%" -H "Content-Type: application/json" -d "{\"model\":\"deepseek-v3\",\"messages\":[{\"role\":\"user\",\"content\":\"%msg%\"}],\"stream\":true}"
echo.
echo.
pause
goto menu

:chat_nonstream
echo.
set /p msg="You: "
echo.
curl -s "%API_BASE%/v1/chat/completions" -H "Authorization: Bearer %API_KEY%" -H "Content-Type: application/json" -d "{\"model\":\"auto\",\"messages\":[{\"role\":\"user\",\"content\":\"%msg%\"}],\"stream\":false}"
echo.
echo.
pause
goto menu

:chat_solo
echo.
set /p msg="You: "
echo.
curl -N "%API_BASE%/v1/chat/completions" -H "Authorization: Bearer %API_KEY%" -H "Content-Type: application/json" -d "{\"model\":\"auto\",\"messages\":[{\"role\":\"user\",\"content\":\"%msg%\"}],\"stream\":true,\"function\":\"solo_coder\"}"
echo.
echo.
pause
goto menu

:gen_file
echo.
echo Generate File - AI creates content and saves to disk
echo -------------------------------------------------------
echo.
set /p filename="Output filename (e.g. report.md, page.html): "
if "%filename%"=="" goto menu
echo.
set /p msg="Describe what to generate: "
if "%msg%"=="" goto menu
echo.
echo [Generating %filename% ...]
echo.
curl -s "%API_BASE%/v1/chat/file" -H "Authorization: Bearer %API_KEY%" -H "Content-Type: application/json" -d "{\"model\":\"auto\",\"messages\":[{\"role\":\"user\",\"content\":\"%msg%\"}],\"filename\":\"%filename%\",\"overwrite\":true}"
echo.
echo.
pause
goto menu

:chat_save
echo.
echo Chat + Save to File - Stream output and save to disk
echo -------------------------------------------------------
echo.
set /p filename="Output filename (e.g. notes.md): "
if "%filename%"=="" goto menu
echo.
set /p msg="You: "
if "%msg%"=="" goto menu
echo.
echo [Streaming and saving to %filename% ...]
echo.
curl -N "%API_BASE%/v1/chat/completions" -H "Authorization: Bearer %API_KEY%" -H "Content-Type: application/json" -d "{\"model\":\"auto\",\"messages\":[{\"role\":\"user\",\"content\":\"%msg%\"}],\"stream\":true,\"save_to\":\"%filename%\"}"
echo.
echo.
pause
goto menu

:list_files
echo.
echo [Workspace Files]
echo.
curl -s "%API_BASE%/v1/files" -H "Authorization: Bearer %API_KEY%"
echo.
echo.
pause
goto menu

:read_file
echo.
set /p filepath="File path (relative to workspace): "
if "%filepath%"=="" goto menu
echo.
echo [Reading %filepath% ...]
echo.
curl -s "%API_BASE%/v1/files/read?path=%filepath%" -H "Authorization: Bearer %API_KEY%"
echo.
echo.
pause
goto menu

:status
echo.
echo [Server Status]
echo.
curl -s "%API_BASE%/v1/status" -H "Authorization: Bearer %API_KEY%"
echo.
echo.
pause
goto menu

:models
echo.
echo [Available Models]
echo.
curl -s "%API_BASE%/v1/models" -H "Authorization: Bearer %API_KEY%"
echo.
echo.
pause
goto menu

:encrypt
echo.
set /p text="Enter text to encrypt: "
echo.
curl -s "%API_BASE%/v1/encrypt" -H "Authorization: Bearer %API_KEY%" -H "Content-Type: application/json" -d "{\"text\":\"%text%\"}"
echo.
echo.
pause
goto menu

:decrypt
echo.
set /p enc="Enter encrypted string: "
echo.
curl -s "%API_BASE%/v1/decrypt" -H "Authorization: Bearer %API_KEY%" -H "Content-Type: application/json" -d "{\"encrypted\":\"%enc%\"}"
echo.
echo.
pause
goto menu

:custom
echo.
echo Custom JSON Request
echo --------------------
set /p endpoint="Endpoint (e.g. /v1/chat/completions): "
if "%endpoint%"=="" set endpoint=/v1/chat/completions
echo.
echo Enter JSON body (single line, no line breaks):
echo Example: {"model":"auto","messages":[{"role":"user","content":"Hello"}],"stream":true}
echo.
set /p jsonbody="JSON: "
echo.
echo [Sending request to %endpoint%...]
echo.
curl -N "%API_BASE%%endpoint%" -H "Authorization: Bearer %API_KEY%" -H "Content-Type: application/json" -d "%jsonbody%"
echo.
echo.
pause
goto menu

:end
echo.
echo Goodbye!
echo.
endlocal
