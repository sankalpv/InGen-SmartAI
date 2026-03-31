#!/bin/bash
cd "$(dirname "$0")"
echo "Starting InGen SmartAI..."
# Ensure permissions
chmod +x launcher.js

# Use Node v20 explicitly — native modules (better-sqlite3, hnswlib-node) are compiled for v20.
# If node@20 is not available, fall back to system node.
NODE20="/opt/homebrew/opt/node@20/bin/node"
if [ -x "$NODE20" ]; then
    export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
    "$NODE20" launcher.js
else
    node launcher.js
fi
