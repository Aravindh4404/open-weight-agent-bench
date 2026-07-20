#!/bin/bash
# OTLP telemetry capture diagnostic
# Run this to test if Claude Code can send OTLP metrics to the receiver

set -e

echo "=== OTLP Telemetry Setup Diagnostic ==="
echo ""

# Step 1: Confirm receiver is running
echo "Step 1: Checking if OTLP receiver is running..."
if nc -z localhost 4318 2>/dev/null; then
    echo "✓ Receiver is listening on port 4318"
else
    echo "✗ Receiver is NOT listening on port 4318"
    echo "  Start it in another terminal: node claude-otlp-receiver.js"
    echo "  Then come back to this terminal and try again."
    exit 1
fi

# Step 2: Confirm env setup
echo ""
echo "Step 2: Setting up environment variables..."
source ./eval-env.sh
export CLAUDE_CODE_ENABLE_TELEMETRY=1
export OTEL_METRICS_EXPORTER=otlp
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
export OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf

echo "Environment set:"
echo "  CLAUDE_CODE_ENABLE_TELEMETRY=$CLAUDE_CODE_ENABLE_TELEMETRY"
echo "  OTEL_METRICS_EXPORTER=$OTEL_METRICS_EXPORTER"
echo "  OTEL_EXPORTER_OTLP_ENDPOINT=$OTEL_EXPORTER_OTLP_ENDPOINT"
echo "  OTEL_EXPORTER_OTLP_PROTOCOL=$OTEL_EXPORTER_OTLP_PROTOCOL"
echo "  ANTHROPIC_BASE_URL=$ANTHROPIC_BASE_URL"
echo "  ANTHROPIC_MODEL=$ANTHROPIC_MODEL"

# Step 3: Run Claude
echo ""
echo "Step 3: Starting Claude Code..."
echo "  (Send at least one message, then type 'exit' or Ctrl+D to quit)"
echo "  (Check the receiver terminal for incoming OTLP payloads)"
echo ""
echo "============================================"
claude
echo "============================================"
echo ""

# Step 4: Check if CSV was updated
echo "Step 4: Checking if CSV was updated..."
CSV_FILE="claude-usage-log.csv"
if [ -f "$CSV_FILE" ]; then
    LINE_COUNT=$(wc -l < "$CSV_FILE")
    echo "✓ $CSV_FILE exists with $LINE_COUNT lines"
    tail -1 "$CSV_FILE"
else
    echo "✗ $CSV_FILE not found"
fi

# Step 5: Check raw OTLP log
echo ""
echo "Step 5: Checking raw OTLP payloads..."
RAWLOG="claude-otlp-raw.jsonl"
if [ -f "$RAWLOG" ]; then
    COUNT=$(wc -l < "$RAWLOG")
    echo "✓ Received $COUNT OTLP payload(s)"
    echo "  Last payload (first 300 chars):"
    tail -1 "$RAWLOG" | head -c 300
    echo "..."
else
    echo "✗ No OTLP payloads received (receiver never got data from Claude Code)"
    echo "  Check:"
    echo "  1. Is OTEL_EXPORTER_OTLP_ENDPOINT reachable? (test with curl)"
    echo "  2. Does Claude Code actually support OTLP in v2.1.215?"
    echo "  3. Try: curl -X POST http://localhost:4318/v1/metrics -d '{}'"
fi
