#!/usr/bin/env bash
# DEBUG VERSION: log raw hook input to see what Claude Code actually sends

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"

# Capture raw stdin
input="$(cat)"

# Log it with timestamp
{
  echo "=== Hook invoked at $(date -u +"%Y-%m-%dT%H:%M:%SZ") ==="
  echo "$input" | jq '.' 2>/dev/null || echo "Raw (not JSON): $input"
  echo ""
} >> "$PROJECT_DIR/hook-input-debug.log"

# Then run the actual log-usage.sh logic (don't modify behavior)
printf '%s' "$input" | bash "$PROJECT_DIR/hooks/log-usage.sh"
