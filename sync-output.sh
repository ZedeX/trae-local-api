#!/bin/bash
# Trae Local API - Output Sync Tool for Linux/Mac
# Usage: ./sync-output.sh

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
SOURCE_DIR="$SCRIPT_DIR/output"
DEST_DIR="${WORKSPACE_DIR:-$HOME/trae-workspace}"

if [ ! -d "$DEST_DIR" ]; then
    echo "Creating destination directory: $DEST_DIR"
    mkdir -p "$DEST_DIR"
fi

echo "============================================"
echo "   Trae Local API - Output Sync Tool"
echo "============================================"
echo ""
echo "Source: $SOURCE_DIR"
echo "Dest:   $DEST_DIR"
echo ""

count=0
skipped=0

while IFS= read -r -d '' file; do
    rel="${file#$SOURCE_DIR/}"
    dest="$DEST_DIR/$rel"
    dest_dir=$(dirname "$dest")
    
    if [ -f "$dest" ]; then
        echo "[SKIP] $rel - already exists"
        ((skipped++))
    else
        mkdir -p "$dest_dir" 2>/dev/null
        if cp "$file" "$dest"; then
            echo "[COPY] $rel"
            ((count++))
        else
            echo "[FAIL] $rel"
        fi
    fi
done < <(find "$SOURCE_DIR" -type f -print0)

echo ""
echo "============================================"
echo "   Copied: $count files"
echo "   Skipped: $skipped files (already exist)"
echo "============================================"
echo ""