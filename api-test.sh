#!/bin/bash
# Trae Local API - Quick Test Tool for Linux/Mac

API_BASE="http://localhost:19900"
API_KEY="trae-local-api-key"

function show_menu() {
    clear
    echo "========================================"
    echo "   Trae Local API - Quick Test Tool"
    echo "========================================"
    echo ""
    echo "  [Chat]"
    echo "  1. Chat (Stream) - auto model"
    echo "  2. Chat (Stream) - glm-5.1"
    echo "  3. Chat (Stream) - deepseek-v3"
    echo "  4. Chat (Non-Stream)"
    echo "  5. Chat with solo_coder (Reasoning)"
    echo "  6. Chat with deepseek-r1 (Reasoning)"
    echo ""
    echo "  [Agent - Auto Tool Calling]"
    echo "  7. Agent Chat (Stream) - auto tools"
    echo "  8. Agent Chat - Read File"
    echo "  9. Agent Chat - Search Internet"
    echo ""
    echo "  [File Output]"
    echo "  10. Generate File (MD/HTML/etc)"
    echo "  11. Chat + Save to File (Stream)"
    echo "  12. List Workspace Files"
    echo "  13. Read File Content"
    echo ""
    echo "  [Tools]"
    echo "  14. Check Server Status"
    echo "  15. List Available Models"
    echo "  16. Get Model Details"
    echo "  17. List Agent Tools"
    echo "  18. Check Auth / Decrypt Status"
    echo "  19. Custom Request"
    echo "  0. Exit"
    echo ""
    echo "========================================"
}

function chat_auto() {
    echo ""
    read -p "You: " msg
    echo ""
    curl -N "$API_BASE/v1/chat/completions" -H "Authorization: Bearer $API_KEY" -H "Content-Type: application/json" -d "{\"model\":\"auto\",\"messages\":[{\"role\":\"user\",\"content\":\"$msg\"}],\"stream\":true}"
    echo -e "\n\nPress Enter to continue..."
    read
}

function chat_glm() {
    echo ""
    read -p "You: " msg
    echo ""
    curl -N "$API_BASE/v1/chat/completions" -H "Authorization: Bearer $API_KEY" -H "Content-Type: application/json" -d "{\"model\":\"glm-5.1\",\"messages\":[{\"role\":\"user\",\"content\":\"$msg\"}],\"stream\":true}"
    echo -e "\n\nPress Enter to continue..."
    read
}

function chat_deepseek() {
    echo ""
    read -p "You: " msg
    echo ""
    curl -N "$API_BASE/v1/chat/completions" -H "Authorization: Bearer $API_KEY" -H "Content-Type: application/json" -d "{\"model\":\"deepseek-v3\",\"messages\":[{\"role\":\"user\",\"content\":\"$msg\"}],\"stream\":true}"
    echo -e "\n\nPress Enter to continue..."
    read
}

function chat_nonstream() {
    echo ""
    read -p "You: " msg
    echo ""
    curl -s "$API_BASE/v1/chat/completions" -H "Authorization: Bearer $API_KEY" -H "Content-Type: application/json" -d "{\"model\":\"auto\",\"messages\":[{\"role\":\"user\",\"content\":\"$msg\"}],\"stream\":false}"
    echo -e "\n\nPress Enter to continue..."
    read
}

function chat_solo() {
    echo ""
    read -p "You: " msg
    echo ""
    curl -N "$API_BASE/v1/chat/completions" -H "Authorization: Bearer $API_KEY" -H "Content-Type: application/json" -d "{\"model\":\"auto\",\"messages\":[{\"role\":\"user\",\"content\":\"$msg\"}],\"stream\":true,\"function\":\"solo_coder\"}"
    echo -e "\n\nPress Enter to continue..."
    read
}

function chat_r1() {
    echo ""
    read -p "You: " msg
    echo ""
    curl -N "$API_BASE/v1/chat/completions" -H "Authorization: Bearer $API_KEY" -H "Content-Type: application/json" -d "{\"model\":\"deepseek-r1\",\"messages\":[{\"role\":\"user\",\"content\":\"$msg\"}],\"stream\":true}"
    echo -e "\n\nPress Enter to continue..."
    read
}

function agent_chat() {
    echo ""
    echo "Agent Chat - AI auto-detects and calls tools"
    echo "------------------------------------------------"
    echo ""
    read -p "You: " msg
    echo ""
    echo "[Agent processing - may call tools automatically...]"
    echo ""
    curl -N "$API_BASE/v1/chat/agent" -H "Authorization: Bearer $API_KEY" -H "Content-Type: application/json" -d "{\"model\":\"auto\",\"messages\":[{\"role\":\"user\",\"content\":\"$msg\"}],\"stream\":true}"
    echo -e "\n\nPress Enter to continue..."
    read
}

function agent_read() {
    echo ""
    echo "Agent Read File - Ask AI to read a file for you"
    echo "-------------------------------------------------"
    echo ""
    read -p "File path: " filepath
    echo ""
    echo "[Agent will read the file and summarize...]"
    echo ""
    curl -N "$API_BASE/v1/chat/agent" -H "Authorization: Bearer $API_KEY" -H "Content-Type: application/json" -d "{\"model\":\"auto\",\"messages\":[{\"role\":\"user\",\"content\":\"Please read the file $filepath and tell me what it contains.\"}],\"stream\":true}"
    echo -e "\n\nPress Enter to continue..."
    read
}

function agent_search() {
    echo ""
    echo "Agent Search - Ask AI to search the internet"
    echo "----------------------------------------------"
    echo ""
    read -p "Search query: " query
    echo ""
    echo "[Agent will search the internet...]"
    echo ""
    curl -N "$API_BASE/v1/chat/agent" -H "Authorization: Bearer $API_KEY" -H "Content-Type: application/json" -d "{\"model\":\"auto\",\"messages\":[{\"role\":\"user\",\"content\":\"Please search the internet for: $query\"}],\"stream\":true}"
    echo -e "\n\nPress Enter to continue..."
    read
}

function gen_file() {
    echo ""
    echo "Generate File - AI creates content and saves to disk"
    echo "-------------------------------------------------------"
    echo ""
    read -p "Output filename (e.g. report.md, page.html): " filename
    [ -z "$filename" ] && return
    echo ""
    read -p "Describe what to generate: " msg
    [ -z "$msg" ] && return
    echo ""
    echo "[Generating $filename ...]"
    echo ""
    curl -s "$API_BASE/v1/chat/file" -H "Authorization: Bearer $API_KEY" -H "Content-Type: application/json" -d "{\"model\":\"auto\",\"messages\":[{\"role\":\"user\",\"content\":\"$msg\"}],\"filename\":\"$filename\",\"overwrite\":true}"
    echo -e "\n\nPress Enter to continue..."
    read
}

function chat_save() {
    echo ""
    echo "Chat + Save to File - Stream output and save to disk"
    echo "-------------------------------------------------------"
    echo ""
    read -p "Output filename (e.g. notes.md): " filename
    [ -z "$filename" ] && return
    echo ""
    read -p "You: " msg
    [ -z "$msg" ] && return
    echo ""
    echo "[Streaming and saving to $filename ...]"
    echo ""
    curl -N "$API_BASE/v1/chat/completions" -H "Authorization: Bearer $API_KEY" -H "Content-Type: application/json" -d "{\"model\":\"auto\",\"messages\":[{\"role\":\"user\",\"content\":\"$msg\"}],\"stream\":true,\"save_to\":\"$filename\"}"
    echo -e "\n\nPress Enter to continue..."
    read
}

function list_files() {
    echo ""
    echo "[Workspace Files]"
    echo ""
    curl -s "$API_BASE/v1/files" -H "Authorization: Bearer $API_KEY"
    echo -e "\n\nPress Enter to continue..."
    read
}

function read_file() {
    echo ""
    read -p "File path (relative to workspace): " filepath
    [ -z "$filepath" ] && return
    echo ""
    echo "[Reading $filepath ...]"
    echo ""
    curl -s "$API_BASE/v1/files/read?path=$filepath" -H "Authorization: Bearer $API_KEY"
    echo -e "\n\nPress Enter to continue..."
    read
}

function status() {
    echo ""
    echo "[Server Status]"
    echo ""
    curl -s "$API_BASE/v1/status" -H "Authorization: Bearer $API_KEY"
    echo -e "\n\nPress Enter to continue..."
    read
}

function models() {
    echo ""
    echo "[Available Models]"
    echo ""
    curl -s "$API_BASE/v1/models" -H "Authorization: Bearer $API_KEY"
    echo -e "\n\nPress Enter to continue..."
    read
}

function model_details() {
    echo ""
    read -p "Function (default: chat_v3): " func
    [ -z "$func" ] && func="chat_v3"
    echo ""
    echo "[Model Details for $func]"
    echo ""
    curl -s "$API_BASE/v1/models/detail?function=$func" -H "Authorization: Bearer $API_KEY"
    echo -e "\n\nPress Enter to continue..."
    read
}

function list_tools() {
    echo ""
    echo "[Available Agent Tools]"
    echo ""
    curl -s "$API_BASE/v1/tools" -H "Authorization: Bearer $API_KEY"
    echo -e "\n\nPress Enter to continue..."
    read
}

function auth_status() {
    echo ""
    echo "[Auth / Decrypt Status]"
    echo ""
    curl -s "$API_BASE/v1/status" -H "Authorization: Bearer $API_KEY"
    echo -e "\n\n[Testing Trae CN Decrypt Module]\n"
    node -e "try{const d=require('./src/trae-decrypt');const r=d.decryptAuthData();console.log('Decrypt: OK');console.log('Edition:',r.edition === 'enterprise' ? 'Enterprise' : (r.host ? 'CN' : 'SG'));console.log('User:',r.account||r.userId||'N/A');console.log('Token exp:',r.expiredAt||'N/A')}catch(e){console.log('Decrypt error:',e.message)}"
    echo -e "\n\nPress Enter to continue..."
    read
}

function custom() {
    echo ""
    echo "Custom JSON Request"
    echo "--------------------"
    read -p "Endpoint (e.g. /v1/chat/completions): " endpoint
    [ -z "$endpoint" ] && endpoint="/v1/chat/completions"
    echo ""
    echo "Enter JSON body (single line, no line breaks):"
    echo 'Example: {"model":"auto","messages":[{"role":"user","content":"Hello"}],"stream":true}'
    echo ""
    read -p "JSON: " jsonbody
    echo ""
    echo "[Sending request to $endpoint...]"
    echo ""
    curl -N "$API_BASE$endpoint" -H "Authorization: Bearer $API_KEY" -H "Content-Type: application/json" -d "$jsonbody"
    echo -e "\n\nPress Enter to continue..."
    read
}

while true; do
    show_menu
    read -p "Select option: " choice
    
    case $choice in
        1) chat_auto ;;
        2) chat_glm ;;
        3) chat_deepseek ;;
        4) chat_nonstream ;;
        5) chat_solo ;;
        6) chat_r1 ;;
        7) agent_chat ;;
        8) agent_read ;;
        9) agent_search ;;
        10) gen_file ;;
        11) chat_save ;;
        12) list_files ;;
        13) read_file ;;
        14) status ;;
        15) models ;;
        16) model_details ;;
        17) list_tools ;;
        18) auth_status ;;
        19) custom ;;
        0) echo -e "\nGoodbye!\n"; exit 0 ;;
        *) continue ;;
    esac
done