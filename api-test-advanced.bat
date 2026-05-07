@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

set API_BASE=http://localhost:9900
set API_KEY=trae-local-api-key
set TEMP_FILE=%TEMP%\trae_api_temp.json
set HISTORY_FILE=chat_history.txt

:menu
cls
echo ========================================
echo   Trae Local API - Advanced Test Tool
echo ========================================
echo.
echo  [Chat]
echo  1. Quick Chat (auto, stream)
echo  2. Chat with Model Selection
echo  3. Chat with Function Selection
echo  4. Multi-turn Conversation
echo  5. Chat from File
echo.
echo  [Models]
echo  6. List Models
echo  7. Get Model Details
echo  8. Check Server Status
echo.
echo  [Tools]
echo  9. Encrypt Text
echo  10. Decrypt Text
echo  11. View Chat History
echo  12. Clear History
echo.
echo  0. Exit
echo.
echo ========================================
set /p choice="Select option: "

if "%choice%"=="1" goto quick_chat
if "%choice%"=="2" goto model_chat
if "%choice%"=="3" goto func_chat
if "%choice%"=="4" goto multi_turn
if "%choice%"=="5" goto file_chat
if "%choice%"=="6" goto list_models
if "%choice%"=="7" goto model_details
if "%choice%"=="8" goto status
if "%choice%"=="9" goto encrypt
if "%choice%"=="10" goto decrypt
if "%choice%"=="11" goto view_history
if "%choice%"=="12" goto clear_history
if "%choice%"=="0" goto end
goto menu

:quick_chat
echo.
echo [Quick Chat - auto model, stream mode]
echo Enter your message (or 'back' to return):
echo.
set /p msg="You: "
if "%msg%"=="back" goto menu
if "%msg%"=="" goto quick_chat
echo.
echo [AI]: 
curl -N "%API_BASE%/v1/chat/completions" -H "Authorization: Bearer %API_KEY%" -H "Content-Type: application/json" -d "{\"model\":\"auto\",\"messages\":[{\"role\":\"user\",\"content\":\"%msg%\"}],\"stream\":true}" 2>nul
echo.
echo.
goto quick_chat

:model_chat
echo.
echo Available models: auto, glm-5, glm-5.1, deepseek-v3, deepseek-r1, doubao-1-6
echo.
set /p model="Select model: "
if "%model%"=="" set model=auto
set /p msg="You: "
if "%msg%"=="back" goto menu
echo.
echo [AI (%model%)]: 
curl -N "%API_BASE%/v1/chat/completions" -H "Authorization: Bearer %API_KEY%" -H "Content-Type: application/json" -d "{\"model\":\"%model%\",\"messages\":[{\"role\":\"user\",\"content\":\"%msg%\"}],\"stream\":true}" 2>nul
echo.
echo.
goto model_chat

:func_chat
echo.
echo Available functions: inline_chat, solo_coder, chat_v3, builder_v3
echo.
set /p func="Select function: "
if "%func%"=="" set func=inline_chat
set /p msg="You: "
if "%msg%"=="back" goto menu
echo.
echo [AI (%func%)]: 
curl -N "%API_BASE%/v1/chat/completions" -H "Authorization: Bearer %API_KEY%" -H "Content-Type: application/json" -d "{\"model\":\"auto\",\"messages\":[{\"role\":\"user\",\"content\":\"%msg%\"}],\"stream\":true,\"function\":\"%func%\"}" 2>nul
echo.
echo.
goto func_chat

:multi_turn
echo.
echo [Multi-turn Conversation]
echo Enter messages one by one. Type 'done' to send, 'clear' to reset.
echo.
set msg_count=0
set "messages="

:multi_input
set /p msg="Message %msg_count%: "
if "%msg%"=="done" goto multi_send
if "%msg%"=="clear" goto multi_turn
if "%msg%"=="back" goto menu
if "%msg%"=="" goto multi_input

if %msg_count%==0 (
    set "messages={\"role\":\"user\",\"content\":\"%msg%\"}"
) else (
    set "messages=%messages%,{\"role\":\"user\",\"content\":\"%msg%\"}"
)
set /a msg_count+=1
goto multi_input

:multi_send
if "%messages%"=="" goto menu
echo.
echo [AI]: 
curl -N "%API_BASE%/v1/chat/completions" -H "Authorization: Bearer %API_KEY%" -H "Content-Type: application/json" -d "{\"model\":\"auto\",\"messages\":[%messages%],\"stream\":true}" 2>nul
echo.
echo.
goto multi_turn

:file_chat
echo.
echo [Chat from File]
echo Enter file path (relative to current directory):
set /p filepath="File: "
if not exist "%filepath%" (
    echo File not found: %filepath%
    pause
    goto menu
)
echo.
echo Reading file content...
for /f "usebackq delims=" %%a in ("%filepath%") do set "filecontent=%%a"
echo Content: %filecontent%
echo.
echo [AI]: 
curl -N "%API_BASE%/v1/chat/completions" -H "Authorization: Bearer %API_KEY%" -H "Content-Type: application/json" -d "{\"model\":\"auto\",\"messages\":[{\"role\":\"user\",\"content\":\"%filecontent%\"}],\"stream\":true}" 2>nul
echo.
echo.
pause
goto menu

:list_models
echo.
echo [Available Models]
echo.
curl -s "%API_BASE%/v1/models" -H "Authorization: Bearer %API_KEY%" 2>nul
echo.
echo.
pause
goto menu

:model_details
echo.
set /p func="Function (default: chat_v3): "
if "%func%"=="" set func=chat_v3
echo.
echo [Model Details for %func%]
echo.
curl -s "%API_BASE%/v1/models/detail?function=%func%" -H "Authorization: Bearer %API_KEY%" 2>nul
echo.
echo.
pause
goto menu

:status
echo.
echo [Server Status]
echo.
curl -s "%API_BASE%/v1/status" -H "Authorization: Bearer %API_KEY%" 2>nul
echo.
echo.
pause
goto menu

:encrypt
echo.
set /p text="Enter text to encrypt: "
echo.
echo [Encrypted]
curl -s "%API_BASE%/v1/encrypt" -H "Authorization: Bearer %API_KEY%" -H "Content-Type: application/json" -d "{\"text\":\"%text%\"}" 2>nul
echo.
echo.
pause
goto menu

:decrypt
echo.
set /p enc="Enter encrypted string: "
echo.
echo [Decrypted]
curl -s "%API_BASE%/v1/decrypt" -H "Authorization: Bearer %API_KEY%" -H "Content-Type: application/json" -d "{\"encrypted\":\"%enc%\"}" 2>nul
echo.
echo.
pause
goto menu

:view_history
echo.
echo [Chat History]
echo.
if exist "%HISTORY_FILE%" (
    type "%HISTORY_FILE%"
) else (
    echo No history found.
)
echo.
pause
goto menu

:clear_history
if exist "%HISTORY_FILE%" del "%HISTORY_FILE%"
echo History cleared.
pause
goto menu

:end
echo.
echo Goodbye!
echo.
endlocal
