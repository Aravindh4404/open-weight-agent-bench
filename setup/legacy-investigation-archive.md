# Legacy Investigation Archive

This file preserves the **investigation history** of the open-weight-agent-bench
project — everything that was tried, what was gone through, and what did **not**
work — captured here *before* the corresponding legacy files were deleted.

The reason this matters as much as knowing what works: the dead ends here each
cost real time. If a future you rediscovers one of these approaches and finds it
plausible, this archive tells you it was already tried, why it failed, and what
to do instead — so you don't burn the same hours twice.

For the **current working methods**, see `token-commands.md` (quick reference)
and `token-measurement-methods.md` (the surviving investigation narrative).
This file is the supplement covering the abandoned/legacy material that those
docs don't fully spell out.

---

## 1. The big arc, in one paragraph

Goal: benchmark cost/performance of coding-agent harnesses (Claude Code, Pi,
OpenCode) all driving the **same open-weight model (GLM-5.2 via OpenRouter)**,
Databricks-style. Three sub-problems had to be solved in order: (a) how to point
each harness at OpenRouter instead of its default provider, (b) how to get an
accurate per-session token/cost count out of each, (c) how to verify those counts
against OpenRouter's own dashboard. Each sub-problem went through several failed
attempts before landing on a working method. Everything in this archive is the
scrap from that process.

---

## 2. Phase 1 — routing Claude Code at GLM-5.2 (source: `setup/progress.md`)

### Attempt 1 (ABANDONED): local LiteLLM proxy on `localhost:4000`

**Approach:** run a local LiteLLM server, point Claude Code at it via
`ANTHROPIC_BASE_URL` + a dummy `ANTHROPIC_API_KEY`, let LiteLLM translate and
forward to OpenRouter. Config lived in `litellm-config.yaml` (deleted).

**What worked:**
- `eval-env.sh` correctly set session-scoped env vars (confirmed they didn't leak
  to `.bashrc` or new windows).
- `litellm-config.yaml` was valid; LiteLLM started cleanly on port 4000.
- `z-ai/glm-5.2` confirmed as a real OpenRouter slug (checked against
  openrouter.ai/models).
- Direct `curl` to the proxy worked — real GLM-5.2 responses came back with cost
  data.

**What broke it (two separate unsolved problems tangled together):**
1. **Login-state finickiness.** `/logout` sometimes worked, sometimes silently
   didn't. Env vars were set but Claude Code still booted into the real Claude
   Pro subscription login with no prompt. The "Detected a custom API key, do you
   want to use it?" prompt appeared exactly once, in one specific state, and was
   never reliably reproducible. Multiple duplicate `claude`/`litellm` processes
   got launched by accident across terminal windows, producing confusing
   inconsistent behavior.
2. **Model-name remap.** Claude Code kept sending its own internal model name
   (`claude-sonnet-5`) to the proxy instead of `glm-5.2`, because nothing told
   it to stop defaulting to Sonnet. LiteLLM correctly rejected `claude-sonnet-5`
   as unknown → repeated `400 Bad Request` / `Invalid model name passed in
   model=claude-sonnet-5`. `litellm-config.yaml` alone does not remap an incoming
   model name to an OpenRouter slug.

**Root cause in hindsight:** even if login had been solved, the proxy still
needed a remap that the config file alone can't express. Killed once a simpler
alternative appeared.

### Attempt 2 (SUCCESS): direct-to-OpenRouter via the Anthropic-Messages endpoint

**The unlock:** OpenRouter exposes a real, documented endpoint that speaks
Claude's native Messages format directly:

```
POST https://openrouter.ai/api/v1/messages
Authorization: Bearer <token>
```

So no local proxy is needed at all — Claude Code talks to OpenRouter directly as
if it were Anthropic's own API. This is what `eval-env.sh` does today.

**Why it fixed the login problem:** using `ANTHROPIC_AUTH_TOKEN` (not
`ANTHROPIC_API_KEY`) made Claude Code show **"API Usage Billing"** instead of
"Claude Pro" on launch — it stopped trying the subscription-login path entirely,
with no `/logout` fight or interactive prompt.

**Why it fixed the model-mismatch problem:** `ANTHROPIC_MODEL="z-ai/glm-5.2"`
tells Claude Code what model to actually request instead of defaulting to
`claude-sonnet-5`. First tested without this line — Claude Code loaded and
chatted but confirmed (via "what model are you?") it was still using real Sonnet
5, just routed through OpenRouter. Adding the line and re-sourcing fixed it.

**Gotcha hit along the way:** a stray duplicate `eval-env.sh` existed at
`~/eval-env.sh` (home folder root) from the very first attempt, separate from
the real `~/open-weight-agent-bench/eval-env.sh`. Running `source ~/eval-env.sh`
kept silently loading the old wrong file. Fixed by deleting the duplicate and
always sourcing `./eval-env.sh` from inside the project folder.

**Known unverified items (still open as of writing):**
- `ANTHROPIC_MODEL` as the variable name worked empirically but was never
  confirmed against Claude Code's official docs (no web access to
  docs.claude.com from the session). If a future update changes this, check
  https://docs.claude.com/en/docs/claude-code/overview for the current name.
- DeepSeek V4 Flash was part of the original plan but parked to focus on GLM
  only. Not yet tested with the working approach — should work the same way,
  just swap the `ANTHROPIC_MODEL` slug.

---

## 3. Phase 2 setup — Pi and OpenCode (source: `setup/harness-startup-guide.md`, `setup/harness-key-setup-and-revert.md`, `setup/quick-start.md`)

### Pi
- Install: `npm install -g --ignore-scripts @earendil-works/pi-coding-agent`
  (confirmed `pi --version` → 0.80.6).
- OpenRouter is a **built-in Pi provider** — no proxy, no custom `models.json`
  needed since `z-ai/glm-5.2` is already registered. Just needs
  `OPENROUTER_API_KEY` set.
- Slug confirmed via `pi --list-models glm` → `z-ai/glm-5.2` (1M context /
  131K max-out / thinking-capable).
- Working command: `pi --provider openrouter --model z-ai/glm-5.2`.
- Windows/Git Bash: works out of the box, no custom `shellPath`. Pi auto-detects
  Git Bash at `C:\Program Files\Git\bin\bash.exe`. First run auto-downloaded
  `fd.exe` and `rg.exe` to `~/.pi/agent/bin/` (one-time).
- `pi-eval-env.sh` (deleted) was a thin validator that checked the key was set
  and exported `PI_MODEL`. The current `token-commands.md` just uses `eval-env.sh`
  + `pi` directly.
- Persistent auth alternative: `/login` inside Pi's interactive session, select
  OpenRouter. Stores key in `~/.pi/agent/auth.json` (0600).

### OpenCode
- Install: `npm install -g opencode-ai`. Confirmed working in Git Bash despite
  OpenCode's docs recommending WSL.
- One-time config: `opencode.json` in project root (kept — still active):
  ```json
  { "$schema": "https://opencode.ai/config.json",
    "provider": { "openrouter": { "options": { "apiKey": "{env:OPENROUTER_API_KEY}" } } } }
  ```
  Reads key from env each run, safe to commit (no secret in the file).
- Every session: `export OPENROUTER_API_KEY=... && opencode`, then `/models`,
  type `glm`, select **GLM-5.2**.
- Persistent auth: `/connect` inside OpenCode, search "OpenRouter", paste key →
  stored in `~/.local/share/opencode/auth.json`.

### Universal rule: verifying which model is actually running
**Never trust the model's own answer to "what model are you?"** — known
unreliable for open-weight models; they pattern-match to common training data
and often claim to be Claude/GPT. Always check the **harness's own status line**:

| Harness | Where to check |
|---|---|
| Claude Code | Its own model/status indicator |
| Pi | Footer bar: `Model: z-ai/glm-5.2` |
| OpenCode | Footer bar: `Build · GLM-5.2 · OpenRouter` |

Documented re-confirmation (2026-07-13): under Pi, GLM-5.2 answered "Claude
Sonnet 4.5 (`claude-sonnet-4-5-20250929`), running inside pi" twice when asked
directly — Pi's footer showed `z-ai/glm-5.2`. Footer is authoritative; model
self-report is not. Same artifact as originally documented (GLM pattern-matches
onto Claude/GPT transcripts in its training data).

### Key/revert commands (Git Bash, session-scoped env)
- **Claude Code revert (same window):** `unset ANTHROPIC_BASE_URL ANTHROPIC_AUTH_TOKEN ANTHROPIC_MODEL && claude` (then `/login` if it asks to re-auth).
- **Pi revert:** `unset OPENROUTER_API_KEY PI_MODEL && pi` (then `/model`).
- **OpenCode revert:** `unset OPENROUTER_API_KEY && mv opencode.json opencode.json.eval-backup && opencode` (then `/models`). Restore later with `mv opencode.json.eval-backup opencode.json`.
- A new Git Bash window is always "normal" by default — no revert needed there.

---

## 4. Token-measurement dead ends (source: `setup/token-measurement-methods.md`, `setup/phase2-token-tracking-progress.md`, `OTLP-TESTING.md`, `RUN-OTLP-TEST.txt`)

### 4a. Claude Code — console-exporter method (worked, then superseded)

Before OTLP, the verified method was the **OTel console exporter + a parser**.
Files deleted: `claude-tracked.sh`, `claude-otel-console.log`,
`parse-cc-tokens.js`.

- `claude-tracked.sh`: launcher that sourced `eval-env.sh`, set
  `OTEL_METRICS_EXPORTER=console OTEL_LOGS_EXPORTER=console`, ran
  `claude 2>> claude-otel-console.log`, then re-ran the parser so the CSV was
  up to date. Chose a plain redirect (no `tee`, no process substitution) because
  piped approaches were unreliable on Windows Git Bash.
- `parse-cc-tokens.js`: read the console log, matched self-contained dataPoint
  objects via `attributes:\s*\{([^{}]*)\}[^{]*?value:\s*([\d.]+)`, filtered to
  `session.id` + `query_source` + `type` ∈ {input,output,cacheRead,cacheCreation},
  took `Math.max` per (session, query_source, type) — **note: Math.max was
  correct for the console method because console-exporter metrics are
  CUMULATIVE (not delta).** This is the opposite of the OTLP case (see 4c
  warning) and the difference matters. Wrote one CSV row per session:
  `session_id,model,input_combined,output,cache_read,cache_creation,total_tokens`.
- Verification: exact token match vs OpenRouter dashboard, 3 sessions.

**Why superseded:** OTLP method (the active `claude-otlp-receiver.js`) is fully
automatic — no per-session parser run, no tee/redirect juggling, CSV updates
live. Console method kept as documented fallback in `OTLP-TESTING.md` only
because OTLP was once unconfirmed; now that OTLP is confirmed working, the
fallback and its files are obsolete.

### 4b. Claude Code — hook-on-transcript method (worked, then superseded)

Even earlier than the console method: a Claude Code **`Stop` hook** that read
the session transcript JSONL and appended usage to `usage-log.csv`. Files
deleted: `hooks/log-usage.sh`, `hooks/log-usage.sh.backup`,
`hooks/log-usage-debug.sh`, `hooks/summarize-usage.sh`, `usage-log.csv`,
`usage-log.debug.jsonl`, `hook-input-debug.log`, `verify-usage.sh`. The
`.claude/settings.json` Stop/SessionEnd hook entries that invoked
`hooks/log-usage.sh` were also removed.

**What the hook did** (`log-usage.sh.backup`, the real processor; `log-usage.sh`
was just a debug-logging wrapper that forwarded stdin to it):
1. Received `session_id` + `transcript_path` from Claude Code on stdin.
2. Read that session's transcript (a JSONL Claude Code already writes).
3. **Deduped transcript lines by `message.id`, keeping only the last line per
   id** (critical fix — see bug #5 below).
4. Grouped the deduped requests **by model**, not by session as a whole.
5. Within each model group, summed `input_tokens`, `output_tokens`,
   `cache_creation_input_tokens`, `cache_read_input_tokens`, and added a
   computed `total_input_tokens_incl_cache` (the three input-side fields
   combined — matches OpenRouter's single "Input" column).
6. Counted how many messages had OpenRouter-shaped ids (`gen-...`) vs not, as a
   contamination signal.
7. Appended one CSV row per (session, model) pair to `usage-log.csv`.
8. Never blocked — any internal failure was a silent no-op (degrades to exit 0).

**CSV schema (13 columns):**
```
timestamp,session_id,harness,env_model,transcript_model,
unique_requests_so_far,cumulative_input_tokens,cumulative_output_tokens,
cumulative_cache_creation_input_tokens,cumulative_cache_read_input_tokens,
total_input_tokens_incl_cache,openrouter_routed_count,other_routed_count
```

`summarize-usage.sh`: read `usage-log.csv`, printed one row per (session, model)
pair taking the **last** row for each pair (values are cumulative per Stop, so
summing multiple rows would double-count), with `⚠` warnings if a session showed
more than one model or any non-OpenRouter-routed messages.

**Bugs found and fixed, in order (these are the genuinely reusable lessons):**
1. **Stale header / column drift.** An early script's CSV header didn't match a
   later version's row shape (extra columns added without regenerating the
   header). Fix: rename old CSV files out of the way whenever the schema
   changes, don't try to migrate.
2. **Wrong column indices in the summarizer.** `summarize-usage.sh` assumed the
   old column layout after `log-usage.sh` changed. Fix: keep both scripts'
   schemas in sync explicitly.
3. **Cumulative-total double-counting.** `log-usage.sh` writes a running
   cumulative total on every Stop, not a per-turn delta (one user turn can span
   multiple assistant JSONL lines). Original summarizer summed *all* rows per
   session instead of taking the last → would multiply totals for any session
   with more than one Stop. Fix: key on the last row per (session, model) pair.
4. **Single-model-per-session blind spot.** Original design collapsed a whole
   session into one model label (whichever the *last* message used), silently
   hiding any session that mixed models. Fix: group and report per model within
   a session, plus an automatic contamination warning.
5. **~5x overcounting from transcript duplication (the big one).** Confirmed by
   comparing against OpenRouter's own request log: the transcript had **25**
   assistant-type lines but only **5 unique** `message.id` values, while
   OpenRouter's log showed **6** real API requests for that session. Claude Code
   writes multiple transcript lines per real request (likely streaming
   snapshots), all sharing one id. Summing every line inflated every token
   count ~5x. Fix: dedupe on `message.id` (last line per id) before summing.

**Verification method (reusable):** cross-check totals against OpenRouter's
**Logs** page filtered by **Session ID**
(`openrouter.ai/activity` → Logs → filter by session) — more reliable than
timestamp matching since it guarantees no other traffic gets mixed in.

Result for session `2c69837a-1e5f-49cd-93af-374bb6a12416`: our input 199,111 vs
OpenRouter 199,496 (Δ 385); our output 1,482 vs 1,494 (Δ 12). Entire difference
explained by one small request (`385`/`12` tok) not yet flushed to the transcript
when the Stop hook read it — Claude Code's docs note the transcript is written
asynchronously and can lag. Known, small, understood undercount at the margins,
not worth chasing.

**`verify-usage.sh`** (deleted): independent verification script that printed a
per-request table mirroring OpenRouter's website Logs view, by looking up every
`gen-...` generation id in a transcript against OpenRouter's
`/api/v1/generation` endpoint. Confirmed field names (2026-07-16, verified
against a real response):
- `native_tokens_prompt` — total prompt tokens (fresh + cached)
- `native_tokens_cached` — cached portion of the prompt
- `native_tokens_completion` — output tokens
- `total_cost` — cost in USD

These "native_*" fields match Anthropic's own reported usage exactly:
`native_tokens_prompt - native_tokens_cached == transcript input_tokens`;
`native_tokens_completion == transcript output_tokens`. ⚠ OpenRouter also
returns non-native `tokens_prompt` / `tokens_completion` — those are
OpenRouter's *own* tokenizer estimate and do NOT match the provider's native
usage; do not use them for reconciliation. Skipped Anthropic-native ids
(`msg_...`, `sg_...`) since they 404 against the generation endpoint.

**Known open items from this method:**
- **Model contamination in session `ba837ca2`** (an older test): a mix of
  OpenRouter-shaped ids (`gen-...`) and Anthropic-native-shaped ids
  (`msg_...`, `sg_...`) within what was supposed to be a pure GLM-5.2 run.
  Likely cause: the global `"model": "haiku"` default in
  `~/.claude/settings.json` may route some background/utility calls directly to
  Anthropic regardless of the `ANTHROPIC_BASE_URL`/`ANTHROPIC_MODEL` override
  used for the main agent loop. Not confirmed. The per-model + routing-flag
  design now surfaces this automatically via the `⚠` warnings.
- **Leaked OpenRouter key.** An API key was found committed to git history during
  this work. Should be rotated (if not already) regardless of whether git history
  gets scrubbed.

**Why superseded:** the OTLP method captures usage directly from Claude Code's
own telemetry stream — no transcript-parsing, no dedupe-on-message.id bug
surface, no async-lag undercount. Same exact-match verification, less moving
parts.

### 4c. Claude Code — OTLP method (the active method; one critical landmine)

This is the current method (`claude-otlp-receiver.js` + `replay-otlp-log.js`).
Preserved here only for the one landmine that already bit once:

⚠ **Claude Code's OTLP metrics use DELTA aggregation
(`aggregationTemporality: 1`) — each flush is only the *increment* since the
last one, not a running total. Values must be SUMMED across flushes, never
compared-and-kept-larger (`Math.max`). Getting this wrong silently undercounts
by ~40% with no error. Caught once already; don't reintroduce.** (Contrast with
the console-exporter method in 4a, where metrics are cumulative and `Math.max`
was correct — the two methods look similar but are temporality-inverted.)

Raw data is never lost: every payload is saved permanently to
`claude-otlp-raw.jsonl`; `replay-otlp-log.js` rebuilds `claude-usage-log.csv`
from scratch.

### 4d. OpenCode — OTLP attempt (ABANDONED)

OpenCode has real OTel support (source: `packages/core/src/observability/otlp.ts`,
on `@effect/opentelemetry` + Vercel AI SDK telemetry conventions). Tried:
```bash
mkdir -p ~/.config/opencode
cat > ~/.config/opencode/config.json << 'EOF'
{ "experimental": { "openTelemetry": true } }
EOF
```
plus a trivial receiver (`otlp-receiver.js`, deleted) that appended raw POST
bodies to `opencode-otlp-log.jsonl` (deleted, was 2.9 MB).

**Why abandoned:** the pipe worked — real OTLP data arrived (confirmed via
resource attributes like `service.version`, `opencode.run` id) — but the
captured spans/logs were internal startup activity only: plugin loading
(`Plugin.load` per provider), HTTP API server boot (`/api/model`,
`/api/provider`, etc.), SQLite credential queries. No `ai.usage`, `gen_ai.*`,
or `session.llm` span with token/cost data ever appeared, even after a confirmed
complete conversation turn. Not worth pursuing once the simpler option was found.

**Working OpenCode method:** built-in `opencode stats --days 0 --models` reads
the local SQLite DB at `~/AppData/Roaming/opencode/opencode.db` directly. Gives
aggregated totals (session count, message count, total cost, token breakdown,
per-model breakdown) — not one row per individual session/turn. For per-task
data: run `--days 0` before and after each task and take the delta, or (not yet
built) write a script reading `opencode.db` directly via its `SessionTable`
schema (`cost`, `tokens` columns). Not yet cross-checked against OpenRouter
dashboard — assume tokens likely accurate, cost likely an estimate (same pattern
as Pi) until verified.

### 4e. Other OTLP receiver variants (all deleted)

Experimental dead branches while converging on the active receiver:
- `otlp-receiver.js` — the trivial raw-logger used for the abandoned OpenCode
  attempt above (methods doc explicitly said "can be deleted").
- `otlp-receiver-flexible.js` — pretty-prints incoming OTLP metrics, stores raw
  to `otlp-raw-payloads.jsonl`, no CSV writing. Exploratory.
- `otlp-receiver-with-storage.js` + `otlp-storage.js` — pluggable storage
  strategy (`OTLP_STORAGE` env ∈ {csv,jsonl,database,custom}) over the same
  payload extraction. Over-engineered for what was needed; never used in
  practice.
- `claude-otlp-receiver-verbose.js` — debug-only receiver that just logged
  method/url/payload-size, wrote nothing.

All shared the same core `extractTokenData` shape (walk `resourceMetrics` →
`scopeMetrics` → `metrics`, filter `name === "claude_code.token.usage"`, pull
`session.id` / `query_source` / `type` / `model` attributes) — that shape lives
on in the active `claude-otlp-receiver.js`.

### 4f. Test/scratch artifacts (deleted)

`OTLP-TESTING.md`, `RUN-OTLP-TEST.txt`, `test-otlp-setup.sh`,
`test-otlp-setup.ps1`, `first-run.log`, `session.log`,
`hook-input-debug.log` — all one-off diagnostic runs / scratch logs from the
debugging sessions above. Their reusable content has been folded into this
archive; nothing in them was load-bearing.

`OTLP-TESTING.md`'s one worth-keeping note was its fallback ladder: if OTLP
ever fails again, first sanity-check with `OTEL_METRICS_EXPORTER=console` and
`claude 2>&1 | tee /tmp/claude-otel.log` — if OTel metric blocks print,
telemetry works and the problem is the OTLP export specifically, not telemetry
overall. Then check `claude --version` / `claude --help | grep -i telemetry`.

---

## 5. Cost columns are unreliable (confirmed across harnesses)

Cost columns in all three harnesses are self-calculated by each tool internally,
**not** read from OpenRouter's actual bill:
- **Claude Code** overstated real cost by ~4x across three checked sessions.
- **Pi** off by 2–18% (inconsistent gap: one row ~18% low `$0.0014` logged vs
  `$0.00166` actual, another ~2% low). Pi computes cost from its own internal
  per-model price table (`calculateCost()` in `packages/ai/src/models.ts`).

**Working rule:** trust token counts from all three; treat cost columns as
estimates only. Pull real dollar comparisons from OpenRouter's dashboard
(`openrouter.ai/activity`) directly.

**Token combination formula (confirmed 4 times across two harnesses):**
```
OpenRouter's "Input" column = fresh input tokens + cache-read tokens
                              (+ cache-creation tokens, unverified since always 0 so far)
```

---

## 6. Verification scorecard

| Harness | Method | Sessions checked | Result |
|---|---|---|---|
| Claude Code | console exporter | 3 | Exact token match vs OpenRouter every time |
| Claude Code | OTLP receiver | 1 | Exact token match vs OpenRouter |
| Claude Code | transcript hook | 1 | Match within async-lag margin (Δ 385/12, explained) |
| Pi | custom extension → CSV | 2 | Exact token match vs OpenRouter dashboard |
| OpenCode | `opencode stats` | 0 | Not yet checked — same combined-input formula assumed |

---

## 7. LiteLLM proxy — abandoned (config deleted)

`litellm-config.yaml` (deleted) configured a two-model local proxy
(`deepseek-flash` → `openrouter/deepseek/deepseek-v4-flash`, `glm-5.2` →
`openrouter/z-ai/glm-5.2`) with `master_key: sk-litellm-local-key`. Abandoned
for the reasons in §2 Attempt 1. Lesson standing: a translation proxy that
doesn't remap the client's own model name is useless when the client hard-codes
that name; and fighting Claude Code's login state via a proxy is strictly harder
than using `ANTHROPIC_AUTH_TOKEN` direct-to-OpenRouter.

---

## 8. Index of deleted files (what each was, so the names aren't mysterious later)

| Deleted file | What it was |
|---|---|
| `claude-tracked.sh` | Old console-exporter launcher for Claude Code |
| `claude-otel-console.log` | Old console telemetry dump |
| `parse-cc-tokens.js` | Old console→CSV parser (Math.max, cumulative) |
| `otlp-receiver.js` | Trivial raw logger (abandoned OpenCode attempt) |
| `otlp-receiver-flexible.js` | Pretty-print exploratory receiver |
| `otlp-receiver-with-storage.js` | Pluggable-storage receiver |
| `otlp-storage.js` | Storage-strategy helper for the above |
| `claude-otlp-receiver-verbose.js` | Debug-only logging receiver |
| `opencode-otlp-log.jsonl` | Abandoned OpenCode OTLP capture (2.9 MB) |
| `litellm-config.yaml` | Abandoned local-proxy config |
| `claude-tracked.sh` | (listed above) |
| `hooks/log-usage.sh` | Debug-logging wrapper hook |
| `hooks/log-usage.sh.backup` | The real transcript-parsing Stop hook |
| `hooks/log-usage-debug.sh` | Debug variant of the hook |
| `hooks/summarize-usage.sh` | usage-log.csv summarizer |
| `usage-log.csv` | Old hook CSV output |
| `usage-log.debug.jsonl` | Old hook debug output |
| `hook-input-debug.log` | Old hook raw-input dump |
| `verify-usage.sh` | OpenRouter /generation-endpoint verifier |
| `pi-eval-env.sh` | Thin Pi key-validator (eval-env.sh used now) |
| `OTLP-TESTING.md` | OTLP troubleshooting notes |
| `RUN-OTLP-TEST.txt` | OTLP quick-start scratch |
| `test-otlp-setup.sh` / `.ps1` | OTLP diagnostic scripts |
| `first-run.log`, `session.log` | Scratch logs |
| `setup/progress.md` | Phase-1 investigation log (folded into §2) |
| `setup/phase2-token-tracking-progress.md` | Phase-2 hook investigation log (folded into §4b) |
| `setup/quick-start.md` | Daily quick-start — **restored on user request** (still active, Claude-Code-focused); the three-harness quick reference lives in `token-commands.md` |
| `setup/harness-startup-guide.md` | Three-harness startup guide (folded into §3) |
| `setup/harness-key-setup-and-revert.md` | Key/revert command guide (folded into §3) |

`.claude/settings.json` had its `hooks.Stop` and `hooks.SessionEnd` entries
removed because they invoked `hooks/log-usage.sh`, which no longer exists.
Settings was otherwise left intact (no `model` or other overrides were ever in
this project's settings — the `"model": "haiku"` mentioned in §4b lived in the
**global** `~/.claude/settings.json`, not this project's, and was not touched).

---

## 9. What survived (the active set)

- `eval-env.sh` — direct-to-OpenRouter routing for all three harnesses.
- `claude-otlp-receiver.js` — active OTLP receiver (DELTA-summing, see §4c).
- `replay-otlp-log.js` — rebuilds `claude-usage-log.csv` from raw.
- `claude-otlp-raw.jsonl` — permanent raw OTLP payloads.
- `claude-usage-log.csv`, `pi-usage-log.csv` — live CSV outputs.
- `opencode.json` — OpenCode project config (kept; still active).
- `bench.mjs` + `results/` — the harness-agnostic eval runner over OpenRouter
  (one row per (model, prompt) run in `results/results.csv`, raw responses in
  `responses/`).
- `setup/token-commands.md` — daily quick reference.
- `setup/token-measurement-methods.md` — the surviving investigation narrative.
- `setup/legacy-investigation-archive.md` — this file.
