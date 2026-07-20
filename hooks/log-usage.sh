#!/usr/bin/env bash
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"

input="$(cat)"

# Log raw hook input
{
  echo "=== Hook invoked at $(date -u +"%Y-%m-%dT%H:%M:%SZ") ==="
  echo "$input" | jq '.' 2>/dev/null || echo "Raw: $input"
  echo ""
} >> "$PROJECT_DIR/hook-input-debug.log"

# Pass it to the backup for processing
printf '%s' "$input" | bash "$PROJECT_DIR/hooks/log-usage.sh.backup"
