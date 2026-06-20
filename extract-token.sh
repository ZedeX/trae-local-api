#!/bin/bash
# Trae Token Auto-Extractor for Linux/Mac
# Usage: ./extract-token.sh

echo "============================================"
echo "   Trae Token Auto-Extractor"
echo "============================================"
echo ""

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)

# Find node executable
if command -v node &> /dev/null; then
    NODE_EXE="node"
elif [ -x "/usr/local/bin/node" ]; then
    NODE_EXE="/usr/local/bin/node"
elif [ -x "$HOME/.nvm/versions/node/*/bin/node" ]; then
    NODE_EXE=$(ls "$HOME/.nvm/versions/node/"*/bin/node 2>/dev/null | head -1)
else
    echo "[ERROR] Node.js not found!"
    echo "Please install Node.js from https://nodejs.org/"
    exit 1
fi

echo "Using Node.js: $NODE_EXE"
echo ""

"$NODE_EXE" "$SCRIPT_DIR/scripts/log-analysis/extract-completion-jwt.js"

if [ $? -eq 0 ]; then
    echo ""
    echo "[OK] Token extracted and saved to .env"
else
    echo ""
    echo "[FAIL] Token extraction failed"
    echo "Make sure Trae IDE is running and you have logged in."
    exit 1
fi