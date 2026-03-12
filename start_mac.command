#!/bin/bash
cd "$(dirname "$0")"
echo "Starting InGen SmartAI..."
# Ensure permissions
chmod +x launcher.js
node launcher.js
