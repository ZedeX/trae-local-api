@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

set API_BASE=http://localhost:19900
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
echo  6. Chat with deepseek-r1 (Reasoning)
echo.
echo  [Agent - Auto Tool Calling]
echo  7. Agent Chat (Stream) - auto tools
echo  8. Agent Chat - Read File
echo  9. Agent Chat - Search Internet
echo.
echo  [File Output]
echo  10. Generate File (MD/HTML/etc)
echo  11. Chat + Save to File (Stream)
echo  12. List Workspace Files
echo  13. Read File Content
echo.
echo  [Tools]
echo  14. Check Server Status
echo  15. List Available Models
echo  16. Get Model Details
echo  17. List Agent Tools
echo  18. Check Auth / Decrypt Status
echo  19. Custom Request
echo  0. Exit
echo.
echo ========================================
set /p choice="Select option: "

if "%choice%"=="1" goto chat_auto
if "%choice%"=="2" goto chat_glm
if "%choice%"=="3" goto chat_deepseek
if "%choice%"=="4" goto chat_nonstream
if "%choice%"=="5" goto chat_solo
if "%choice%"=="6" goto chat_r1
if "%choice%"=="7" goto agent_chat
if "%choice%"=="8" goto agent_read
if "%choice%"=="9" goto agent_search
if "%choice%"=="10" goto gen_file
if "%choice%"=="11" goto chat_save
if "%choice%"=="12" goto list_files
if "%choice%"=="13" goto read_file
if "%choice%"=="14" goto status
if "%choice%"=="15" goto models
if "%choice%"=="16" goto model_details
if "%choice%"=="17" goto list_tools
if "%choice%"=="18" goto auth_status
if "%choice%"=="19" goto custom
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

:chat_r1
echo.
set /p msg="You: "
echo.
curl -N "%API_BASE%/v1/chat/completions" -H "Authorization: Bearer %API_KEY%" -H "Content-Type: application/json" -d "{\"model\":\"deepseek-r1\",\"messages\":[{\"role\":\"user\",\"content\":\"%msg%\"}],\"stream\":true}"
echo.
echo.
pause
goto menu

:agent_chat
echo.
echo Agent Chat - AI auto-detects and calls tools
echo ------------------------------------------------
echo.
set /p msg="You: "
echo.
echo [Agent processing - may call tools automatically...]
echo.
curl -N "%API_BASE%/v1/chat/agent" -H "Authorization: Bearer %API_KEY%" -H "Content-Type: application/json" -d "{\"model\":\"auto\",\"messages\":[{\"role\":\"user\",\"content\":\"%msg%\"}],\"stream\":true}"
echo.
echo.
pause
goto menu

:agent_read
echo.
echo Agent Read File - Ask AI to read a file for you
echo -------------------------------------------------
echo.
set /p filepath="File path: "
echo.
echo [Agent will read the file and summarize...]
echo.
curl -N "%API_BASE%/v1/chat/agent" -H "Authorization: Bearer %API_KEY%" -H "Content-Type: application/json" -d "{\"model\":\"auto\",\"messages\":[{\"role\":\"user\",\"content\":\"Please read the file %filepath% and tell me what it contains.\"}],\"stream\":true}"
echo.
echo.
pause
goto menu

:agent_search
echo.
echo Agent Search - Ask AI to search the internet
echo ----------------------------------------------
echo.
set /p query="Search query: "
echo.
echo [Agent will search the internet...]
echo.
curl -N "%API_BASE%/v1/chat/agent" -H "Authorization: Bearer %API_KEY%" -H "Content-Type: application/json" -d "{\"model\":\"auto\",\"messages\":[{\"role\":\"user\",\"content\":\"Please search the internet for: %query%\"}],\"stream\":true}"
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

:model_details
echo.
set /p func="Function (default: chat_v3): "
if "%func%"=="" set func=chat_v3
echo.
echo [Model Details for %func%]
echo.
curl -s "%API_BASE%/v1/models/detail?function=%func%" -H "Authorization: Bearer %API_KEY%"
echo.
echo.
pause
goto menu

:list_tools
echo.
echo [Available Agent Tools]
echo.
curl -s "%API_BASE%/v1/tools" -H "Authorization: Bearer %API_KEY%"
echo.
echo.
pause
goto menu

:auth_status
echo.
echo [Auth / Decrypt Status]
echo.
curl -s "%API_BASE%/v1/status" -H "Authorization: Bearer %API_KEY%"
echo.
echo.
echo [Testing Trae CN Decrypt Module]
echo.
node -e "try{const d=require('./src/trae-decrypt');const r=d.decryptAuthData();console.log('Decrypt: OK');console.log('Edition:',r.host?'CN':'SG');console.log('User:',r.account||r.userId||'N/A');console.log('Token exp:',r.expiredAt||'N/A')}catch(e){console.log('Decrypt error:',e.message)}"
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
