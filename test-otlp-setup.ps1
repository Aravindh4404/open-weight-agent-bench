# OTLP telemetry capture diagnostic (Windows PowerShell version)
# Run this to test if Claude Code can send OTLP metrics to the receiver

Write-Host "=== OTLP Telemetry Setup Diagnostic ===" -ForegroundColor Cyan
Write-Host ""

# Step 1: Confirm receiver is running
Write-Host "Step 1: Checking if OTLP receiver is running..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "http://localhost:4318/v1/metrics" `
        -Method POST `
        -Body "{}" `
        -ContentType "application/json" `
        -ErrorAction Stop `
        -TimeoutSec 2
    Write-Host "✓ Receiver is listening on port 4318" -ForegroundColor Green
} catch {
    Write-Host "✗ Receiver is NOT reachable on port 4318" -ForegroundColor Red
    Write-Host "  Start it in another terminal: node claude-otlp-receiver.js"
    Write-Host "  Then come back to this terminal and try again."
    exit 1
}

# Step 2: Set up environment variables
Write-Host ""
Write-Host "Step 2: Setting up environment variables..." -ForegroundColor Yellow

# Source eval-env.sh (we'll need to do this via bash or manually set the values)
# For now, just set them manually based on what eval-env.sh does
$env:ANTHROPIC_BASE_URL = "https://openrouter.ai/api"
$env:ANTHROPIC_AUTH_TOKEN = $env:OPENROUTER_API_KEY
Remove-Item -Path "env:ANTHROPIC_API_KEY" -ErrorAction SilentlyContinue
$env:ANTHROPIC_MODEL = "z-ai/glm-5.2"

# Enable telemetry and OTLP export
$env:CLAUDE_CODE_ENABLE_TELEMETRY = "1"
$env:OTEL_METRICS_EXPORTER = "otlp"
$env:OTEL_EXPORTER_OTLP_ENDPOINT = "http://localhost:4318"
$env:OTEL_EXPORTER_OTLP_PROTOCOL = "http/protobuf"

Write-Host "Environment set:" -ForegroundColor Green
Write-Host "  CLAUDE_CODE_ENABLE_TELEMETRY=$($env:CLAUDE_CODE_ENABLE_TELEMETRY)"
Write-Host "  OTEL_METRICS_EXPORTER=$($env:OTEL_METRICS_EXPORTER)"
Write-Host "  OTEL_EXPORTER_OTLP_ENDPOINT=$($env:OTEL_EXPORTER_OTLP_ENDPOINT)"
Write-Host "  OTEL_EXPORTER_OTLP_PROTOCOL=$($env:OTEL_EXPORTER_OTLP_PROTOCOL)"
Write-Host "  ANTHROPIC_BASE_URL=$($env:ANTHROPIC_BASE_URL)"
Write-Host "  ANTHROPIC_MODEL=$($env:ANTHROPIC_MODEL)"

# Step 3: Run Claude
Write-Host ""
Write-Host "Step 3: Starting Claude Code..." -ForegroundColor Yellow
Write-Host "  (Send at least one message, then type 'exit' or Ctrl+D to quit)" -ForegroundColor Gray
Write-Host "  (Check the receiver terminal for incoming OTLP payloads)" -ForegroundColor Gray
Write-Host ""
Write-Host "============================================" -ForegroundColor Gray

# Run Claude
& claude

Write-Host "============================================" -ForegroundColor Gray
Write-Host ""

# Step 4: Check if CSV was updated
Write-Host "Step 4: Checking if CSV was updated..." -ForegroundColor Yellow
$csvFile = "claude-usage-log.csv"
if (Test-Path $csvFile) {
    $lineCount = @(Get-Content $csvFile).Count
    Write-Host "✓ $csvFile exists with $lineCount line(s)" -ForegroundColor Green
    Write-Host "  Last entry:" -ForegroundColor Gray
    Get-Content $csvFile -Tail 1
} else {
    Write-Host "✗ $csvFile not found" -ForegroundColor Red
}

# Step 5: Check raw OTLP log
Write-Host ""
Write-Host "Step 5: Checking raw OTLP payloads..." -ForegroundColor Yellow
$rawLog = "claude-otlp-raw.jsonl"
if (Test-Path $rawLog) {
    $count = @(Get-Content $rawLog).Count
    Write-Host "✓ Received $count OTLP payload(s)" -ForegroundColor Green
    Write-Host "  Last payload (first 300 chars):" -ForegroundColor Gray
    $lastPayload = Get-Content $rawLog -Tail 1
    Write-Host ($lastPayload.Substring(0, [Math]::Min(300, $lastPayload.Length)))
    Write-Host "..."
} else {
    Write-Host "✗ No OTLP payloads received (receiver never got data from Claude Code)" -ForegroundColor Red
    Write-Host ""
    Write-Host "Troubleshooting:" -ForegroundColor Yellow
    Write-Host "  1. Check if OTEL_EXPORTER_OTLP_ENDPOINT is reachable"
    Write-Host "  2. Verify Claude Code v2.1.215 supports OTLP export"
    Write-Host "  3. Check if Claude Code prints any telemetry errors"
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Cyan
    Write-Host "  A) Try the fallback console-export method:"
    Write-Host "     - Set: OTEL_METRICS_EXPORTER=console"
    Write-Host "     - Pipe output: claude 2>&1 | tee -a session.log"
    Write-Host "     - Parse with: node parse-cc-tokens.js session.log claude-usage-log.csv"
    Write-Host ""
    Write-Host "  B) Or enable debug logging to see what Claude Code is doing:"
    Write-Host "     - Set: DEBUG=*"
    Write-Host "     - Then run: claude 2>&1 | tee debug.log"
}

Write-Host ""
Write-Host "Diagnostic complete!" -ForegroundColor Cyan
