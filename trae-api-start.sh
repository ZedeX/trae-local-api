#!/bin/bash
# Trae Local API Starter for Linux/Mac
# Usage: ./trae-api-start.sh

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)

echo "============================================"
echo "   Starting Trae Local API"
echo "============================================"
echo "Working directory: $SCRIPT_DIR"
echo ""

cd "$SCRIPT_DIR"

# Check if node_modules exist
if [ ! -d "node_modules" ]; then
    echo "[WARN] node_modules not found, running npm install..."
    npm install
    if [ $? -ne 0 ]; then
        echo "[ERROR] npm install failed!"
        exit 1
    fi
fi

echo "Starting server..."
echo "API will be available at: http://localhost:19900"
echo "Press Ctrl+C to stop"
echo ""

npm start