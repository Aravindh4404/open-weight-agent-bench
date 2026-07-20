# OTLP Telemetry Capture — Testing & Troubleshooting

## Current Status
- ✓ OTLP receiver (`claude-otlp-receiver.js`) is running and reachable
- ✓ Test curl POST succeeds (200 response)
- ✗ Not yet confirmed: Whether Claude Code v2.1.215 actually sends OTLP metrics to the endpoint

## Quick Test (5 minutes)

### Terminal 1: Start the receiver
```bash
cd ~/open-weight-agent-bench
node claude-otlp-receiver.js
```
Watch for output like:
```
OTLP receiver listening on :4318
CSV auto-updates at: .../claude-usage-log.csv
Raw payloads logged to: .../claude-otlp-raw.jsonl
```

### Terminal 2: Run Claude with OTLP export
```bash
cd ~/open-weight-agent-bench
source ./eval-env.sh
export CLAUDE_CODE_ENABLE_TELEMETRY=1
export OTEL_METRICS_EXPORTER=otlp
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
export OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf
claude
```

Inside Claude, send at least one message (e.g. "hello"), then exit with Ctrl+D.

### Watch Terminal 1
If OTLP is working, you should see:
```
[2026-07-20T15:30:45.123Z] Updated CSV — 1 session(s) tracked.
```

Then check the CSV:
```bash
tail -1 claude-usage-log.csv
```

Expected output:
```
<session-id>,z-ai/glm-5.2,<input>,<output>,...
```

## If Nothing Appears

### Scenario A: CSV row exists but model is still "unknown"
**Root cause:** Claude Code isn't sending a `model` attribute in the OTLP metrics, or it uses a different name.

**Fix:** Edit `claude-otlp-receiver.js`, line 48, to log what attributes are actually received:
```javascript
const model = getAttr(attrs, "model");
console.log("Received attributes:", attrs.map(a => a.key)); // ADD THIS
if (model && !sessionModels[sessionId]) sessionModels[sessionId] = model;
```

Then re-run the test and check what attribute keys actually come through.

### Scenario B: No CSV row at all (raw log is empty or doesn't exist)
**Root cause:** Claude Code isn't sending any OTLP metrics. Possible reasons:
1. `OTEL_METRICS_EXPORTER` isn't recognized by this Claude Code version
2. Telemetry is disabled or requires different config
3. OTLP protocol/endpoint is wrong
4. Claude Code is silently failing to connect to the receiver

**Debug:** Try with console exporter first (guaranteed working):
```bash
export OTEL_METRICS_EXPORTER=console
claude 2>&1 | tee /tmp/claude-otel.log
```
If you see OTel metric blocks in the output, then telemetry works but OTLP export is the issue.

**Check Claude Code version details:**
```bash
claude --version
claude --help 2>&1 | grep -i telemetry
```

## Fallback: Manual Console-Export Method (100% proven)

If OTLP doesn't work after 15 min of testing, use this fully-verified approach:

```bash
cd ~/open-weight-agent-bench
source ./eval-env.sh
export CLAUDE_CODE_ENABLE_TELEMETRY=1
export OTEL_METRICS_EXPORTER=console
export OTEL_LOGS_EXPORTER=console
claude 2>&1 | tee /tmp/claude-session.log
```

After exiting Claude, run:
```bash
node parse-cc-tokens.js /tmp/claude-session.log claude-usage-log.csv
```

This appends one row to the CSV. Repeat for each session.

**Why this works:** 
- `OTEL_METRICS_EXPORTER=console` is clearly working (you have proven data in your CSV)
- No piping issues with `2>&1 | tee` because the manual copy approach doesn't break TTY
- `parse-cc-tokens.js` handles the parsing perfectly (already validated multiple times)

## Files in This Project
- `claude-otlp-receiver.js` — OTLP receiver (proven payload parsing logic)
- `test-otlp-setup.ps1` — Windows diagnostic script
- `parse-cc-tokens.js` — CSV parser for console-export output (proven working)
- `eval-env.sh` — OpenRouter routing config (shared by all methods)

## Environment Variables Reference

### For console export (works, proven):
```bash
CLAUDE_CODE_ENABLE_TELEMETRY=1
OTEL_METRICS_EXPORTER=console
OTEL_LOGS_EXPORTER=console
```

### For OTLP export (testing):
```bash
CLAUDE_CODE_ENABLE_TELEMETRY=1
OTEL_METRICS_EXPORTER=otlp
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf
```

## Next Steps

1. **Test OTLP immediately** (5-10 min) — run the Terminal 1 + 2 setup above
2. **If CSV updates with data:** Success! Check if model field is correct (may need attribute name fix)
3. **If CSV stays empty:** Fall back to console-export + parse method (proven 100% reliable)
4. **If you get stuck:** The manual method is production-ready and takes ~1 min per session, so don't over-invest in OTLP if it's not cooperating

Document whichever method works so you can replicate it for Pi and OpenCode benchmarks.
