#!/bin/bash
# Run Claude Code with automatic token/cost logging.
# Usage: ./claude-tracked.sh
#
# What it does:
#   1. Sources eval-env.sh (routes to OpenRouter/GLM-5.2)
#   2. Enables OTel telemetry, redirecting it straight to a log file
#      (no tee, no process substitution — plain redirect, which is
#      reliable on Windows Git Bash, unlike the piped approaches)
#   3. Runs Claude Code interactively as normal — you won't see the
#      OTel JSON dump on screen anymore, it goes straight to the file
#   4. When you exit, automatically re-runs the parser so
#      claude-usage-log.csv is always up to date

cd "$(dirname "$0")"

source ./eval-env.sh
export CLAUDE_CODE_ENABLE_TELEMETRY=1
export OTEL_METRICS_EXPORTER=console
export OTEL_LOGS_EXPORTER=console

echo "Starting Claude Code (telemetry capturing silently to claude-otel-console.log)..."
claude 2>> claude-otel-console.log

echo ""
echo "Session ended. Updating claude-usage-log.csv..."
node parse-cc-tokens.js claude-otel-console.log claude-usage-log.csv
