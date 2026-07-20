# Token/Cost Measurement Methods — Claude Code, Pi, OpenCode

Companion doc to `project-context-phase2.md`. Covers Phase 2's token-measurement
sub-problem: how to get per-session token/cost data out of each harness,
what was tried, what worked, and how to reproduce it.

All three harnesses run **GLM 5.2 (`z-ai/glm-5.2`) via OpenRouter**, using each
harness's own direct-base-URL override (no local proxy — see
`project-context-phase2.md` for why the LiteLLM proxy approach was abandoned).

---

## Summary table

| Harness | Method | Token accuracy | Cost accuracy | OTel used? |
|---|---|---|---|---|
| Claude Code | OTel console exporter | ✅ verified (previous session, via `hooks/log-usage.sh` cross-check vs OpenRouter) | ⚠️ likely self-calculated, not yet cross-checked | ✅ yes — this is the method |
| Pi | Custom extension → CSV | ✅ verified exact match vs OpenRouter dashboard | ⚠️ confirmed self-calculated, off by ~2–18% | ❌ not available in Pi (checked source — design doc only, unshipped) |
| OpenCode | Built-in `opencode stats` command | not yet cross-checked | ⚠️ likely self-calculated | ⚠️ tried, abandoned (see below) |

**Working rule going forward: trust token counts from all three. Treat cost
columns as estimates only — use OpenRouter's dashboard (`openrouter.ai/activity`)
as the source of truth for actual dollar comparisons.**

---

## Claude Code

### Method: OpenTelemetry, console exporter

Claude Code has native, real OTel support (unlike Pi) — confirmed by testing,
not just docs.

**How to run:**
```bash
cd ~/open-weight-agent-bench
source ./eval-env.sh
export CLAUDE_CODE_ENABLE_TELEMETRY=1
export OTEL_METRICS_EXPORTER=console
export OTEL_LOGS_EXPORTER=console
claude
```
Send a message, let it finish, `/exit`. Telemetry events print directly to
the terminal — no receiver script needed.

**To save output to a file instead of just watching it scroll:**
```bash
claude 2>&1 | tee -a ~/open-weight-agent-bench/claude-otel-log.txt
```

**What it gives you** (per session, split by `query_source`: `main` = your
actual conversation turn, `auxiliary` = internal background calls like title
generation):
- `claude_code.token.usage` — broken into `input`, `output`, `cacheRead`,
  `cacheCreation`
- `claude_code.cost.usage` — dollar cost (likely self-calculated, not
  confirmed against OpenRouter's actual bill yet)
- `claude_code.session.count`, `claude_code.active_time.total` — bonus fields
  neither Pi nor OpenCode expose

**Verification status:** token counts from this method haven't been directly
cross-checked yet (only the older `hooks/log-usage.sh` transcript-based
method was verified, in a prior session, against OpenRouter's dashboard/API
with a documented ~382–388 token gap explained by write-lag). To verify OTel
console output specifically: compare a session's `token.usage` totals against
either (a) `hooks/log-usage.sh`'s log for that same session ID, or
(b) OpenRouter's dashboard filtered to that session's timestamp window.

**Full OTLP pipe (only pursue if you need external tooling to ingest this)**:
```bash
export OTEL_METRICS_EXPORTER=otlp
export OTEL_LOGS_EXPORTER=otlp
export OTEL_EXPORTER_OTLP_ENDPOINT="http://localhost:4318"
```
Not yet tried for Claude Code — console mode was sufficient.

---

## Pi

### Method: custom extension, no OTel

**Why not OTel:** cloned Pi's GitHub repo (`earendil-works/pi`) and searched
the actual shipped source. Found `observability.md`, a *design proposal* for
future OTel support — but the only telemetry code that actually ships
(`telemetry.ts`) is an unrelated anonymous install-ping toggle. **No working
OTel exists in Pi.** Nothing to test.

**What Pi has instead:** an "extensions" system — TypeScript files
auto-loaded from a folder, can subscribe to lifecycle events including
`turn_end`, which fires with `event.message.usage` already containing
per-turn token/cost data.

**Setup (already done):**
```bash
mkdir -p ~/.pi/agent/extensions
cat > ~/.pi/agent/extensions/token-logger.ts << 'EOF'
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { appendFileSync, existsSync, writeFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const LOG_PATH = join(homedir(), "open-weight-agent-bench", "pi-usage-log.csv");
const HEADER = "timestamp,session_id,turn_index,input,output,cache_read,cache_write,total_tokens,cost_input,cost_output,cost_total\n";

export default function (pi: ExtensionAPI) {
  if (!existsSync(LOG_PATH)) writeFileSync(LOG_PATH, HEADER);

  pi.on("turn_end", async (event, ctx) => {
    const msg = event.message;
    if (msg.role !== "assistant" || !msg.usage) return;
    const u = msg.usage;
    const row = [
      new Date().toISOString(),
      ctx.sessionManager?.getSessionId?.() ?? "unknown",
      event.turnIndex,
      u.input, u.output, u.cacheRead, u.cacheWrite, u.totalTokens,
      u.cost.input, u.cost.output, u.cost.total,
    ].join(",");
    appendFileSync(LOG_PATH, row + "\n");
  });
}
EOF
```

**To use (runs automatically, nothing extra needed each session):**
```bash
cd ~/open-weight-agent-bench
source ./eval-env.sh
pi
```
Send a message, let it finish, `/exit`.

**To check the log:**
```bash
cat ~/open-weight-agent-bench/pi-usage-log.csv
```

**Verification performed:** compared two logged rows directly against
OpenRouter's activity dashboard.
- Tokens: **exact match** in both cases (1,366/24 and 1,963/194).
- Cost: Pi calculates this itself from its own internal per-model price
  table (`calculateCost()` in `packages/ai/src/models.ts`) — **not** read
  from OpenRouter's response. Confirmed mismatch: one row was ~18% low
  ($0.0014 logged vs $0.00166 actual), another ~2% low ($0.00144 vs
  $0.00141). Inconsistent gap → don't trust the cost column for precise
  comparisons.

---

## OpenCode

### Attempt 1: OpenTelemetry (tried, abandoned)

OpenCode does have real, working OTel support (confirmed in source —
`packages/core/src/observability/otlp.ts`, built on `@effect/opentelemetry`
and the Vercel AI SDK's telemetry conventions).

**Setup that was tried:**
```bash
mkdir -p ~/.config/opencode
cat > ~/.config/opencode/config.json << 'EOF'
{ "experimental": { "openTelemetry": true } }
EOF
```
```bash
cat > ~/open-weight-agent-bench/otlp-receiver.js << 'EOF'
const http = require("http");
const fs = require("fs");
const logFile = require("path").join(__dirname, "opencode-otlp-log.jsonl");

http.createServer((req, res) => {
  let body = "";
  req.on("data", chunk => body += chunk);
  req.on("end", () => {
    fs.appendFileSync(logFile, body + "\n");
    res.writeHead(200); res.end("{}");
  });
}).listen(4318, () => console.log("Listening on :4318 for OTLP logs/traces"));
EOF
```
Ran receiver in one terminal, `OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318`
+ `opencode` in another.

**Why abandoned:** the pipe worked (real OTLP data arrived, confirmed via
resource attributes like `service.version`, `opencode.run` ID), but the
captured spans/logs were internal startup activity — plugin loading
(`Plugin.load` for each provider), HTTP API server boot (`/api/model`,
`/api/provider`, etc.), SQLite credential queries. No `ai.usage`,
`gen_ai.*`, or `session.llm` span with token/cost data ever appeared, even
after a confirmed complete conversation turn. Concluded not worth pursuing
further once a simpler option was found (below).

**These files/config are no longer needed and can be deleted:**
```bash
rm ~/open-weight-agent-bench/otlp-receiver.js
rm ~/.config/opencode/config.json
```

### Attempt 2: built-in `opencode stats` command (working method)

Found by reading OpenCode's source further: session data is stored in a
local SQLite database, not flat JSON files as initially assumed from an
older part of the codebase. Real location on this machine:
```
~/AppData/Roaming/opencode/opencode.db
```
(found via `ls -la ~/AppData/Roaming/opencode`)

OpenCode ships a CLI command that reads this database directly — no config
or setup needed at all, works out of the box.

**To use:**
```bash
cd ~/open-weight-agent-bench
source ./eval-env.sh
opencode
```
Send a message, wait for the full response to finish, exit normally.

**To check totals:**
```bash
opencode stats --days 0 --models
```
Prints session count, message count, total cost, token breakdown
(input/output/cache read/cache write), and per-model breakdown. Confirmed
working — printed accurate `openrouter/z-ai/glm-5.2` data matching the
session sidebar shown live in the TUI.

**Limitation:** `opencode stats` gives **aggregated totals** (e.g. "today's
total"), not one row per individual session/turn like Pi's CSV. For
per-task comparison data, either:
- run `--days 0` before and after each task and take the delta manually, or
- (not yet built) write a script reading `opencode.db` directly via its
  `SessionTable` schema (`cost`, `tokens` columns) for per-session rows

**Verification status:** not yet cross-checked against OpenRouter's
dashboard. Given the same self-calculated-cost pattern found in Pi, assume
the same caveat applies (tokens likely accurate, cost likely an estimate)
until verified.

---

## Open items / next steps

1. Cross-check Claude Code's OTel token counts against `hooks/log-usage.sh`
   or OpenRouter dashboard (not yet done — only the older hook method was
   previously verified).
2. Cross-check OpenCode's `opencode stats` cost numbers against OpenRouter
   dashboard (not yet done).
3. Decide whether per-task granularity is needed for OpenCode (currently
   only aggregated `--days` totals available) — if so, build the
   `opencode.db`-reading script.
4. Move to designing the actual harder comparison tasks (multi-file bug
   fixes, iterate-against-failing-test) now that all three harnesses have
   a working token-measurement method — this was blocked on measurement
   methodology and is now unblocked.
