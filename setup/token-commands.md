# Token Measurement — Quick Reference

How to run each harness with token/cost tracking, and where the results
land. See `token-measurement-methods.md` for the full investigation
history (what was tried, what failed, why). This file is just the
day-to-day commands.

All three route to **GLM-5.2 via OpenRouter** using `eval-env.sh`.

---

## Claude Code

**Status:** fully automatic, verified exact against OpenRouter (see
verification note at bottom).

### Setup (one time)
Files already in `~/open-weight-agent-bench/`:
- `claude-otlp-receiver.js` — the receiver
- `replay-otlp-log.js` — rebuilds the CSV from raw data if ever needed

### Every time you want a tracked session

**Terminal A — start the receiver, leave it running:**
```bash
cd ~/open-weight-agent-bench
node claude-otlp-receiver.js
```

**Terminal B — run Claude Code:**
```bash
cd ~/open-weight-agent-bench
source ./eval-env.sh
export CLAUDE_CODE_ENABLE_TELEMETRY=1
export OTEL_METRICS_EXPORTER=otlp
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
export OTEL_EXPORTER_OTLP_PROTOCOL=http/json
claude
```
Chat normally, exit normally. `claude-usage-log.csv` updates itself
automatically — no copy/paste, no manual step.

### Check results
```bash
cat ~/open-weight-agent-bench/claude-usage-log.csv
```

### If numbers ever look wrong / need to rebuild
The raw data is never lost — every payload is saved permanently to
`claude-otlp-raw.jsonl`. To rebuild the CSV from scratch:
```bash
cd ~/open-weight-agent-bench
node replay-otlp-log.js
```

⚠️ **Critical detail if you ever touch `claude-otlp-receiver.js`:**
Claude Code's OTLP metrics use **DELTA** aggregation
(`aggregationTemporality: 1`) — each flush is only the *increment* since
the last one, not a running total. Values must be **summed** across
flushes, never compared-and-kept-larger (`Math.max`). Getting this wrong
silently undercounts by ~40% without erroring. This was caught once
already (see `token-measurement-methods.md`) — don't reintroduce it.

---

## Pi

**Status:** fully automatic, verified exact against OpenRouter.

### Setup (already done)
`~/.pi/agent/extensions/token-logger.ts` — auto-loads, no setup needed
each session.

### Every time
```bash
cd ~/open-weight-agent-bench
source ./eval-env.sh
pi
```
Chat, `/exit`. Logs automatically.

### Check results
```bash
cat ~/open-weight-agent-bench/pi-usage-log.csv
```

---

## OpenCode

**Status:** fully automatic (built-in, no custom code), tokens follow
the same accurate pattern as the other two but not yet independently
cross-checked against OpenRouter for this specific harness.

### Every time
```bash
cd ~/open-weight-agent-bench
source ./eval-env.sh
opencode
```
Chat, exit normally.

### Check results
```bash
opencode stats --days 0 --models
```
(No CSV file — OpenCode stores everything in its own database at
`~/AppData/Roaming/opencode/opencode.db`; this command reads it directly.)

---

## Verification record

| Harness | Sessions checked | Result |
|---|---|---|
| Pi | 2 | Exact token match vs OpenRouter dashboard |
| Claude Code | 3 (console method) + 1 (OTLP method) | Exact token match vs OpenRouter dashboard every time |
| OpenCode | 0 | Not yet checked — same combined-input formula assumed to apply |

**Cost columns** (all three harnesses): self-calculated by each tool
internally, not read from OpenRouter's actual bill. Confirmed unreliable —
Claude Code overstated real cost by ~4x across three checked sessions; Pi
was off by 2–18%. **Don't use any harness's own cost field for real dollar
comparisons — pull cost from OpenRouter's dashboard directly instead.**

**Token combination formula** (confirmed 4 times across two harnesses):
```
OpenRouter's "Input" column = fresh input tokens + cache-read tokens (+ cache-creation tokens, unverified since always 0 so far)
```
