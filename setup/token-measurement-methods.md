# Token/Cost Measurement Methods — Claude Code, Pi, OpenCode

Companion doc to `project-context-phase2.md`. This is the final, complete
record of how token/cost measurement was solved for all three harnesses:
what was tried, what failed and why, what actually works, and what's been
independently verified against OpenRouter's real billing data.

All three harnesses run **GLM 5.2 (`z-ai/glm-5.2`) via OpenRouter**, using
each harness's own direct-base-URL override (`eval-env.sh`).

---

## Summary table (final, verified)

| Harness | Method | Automatic? | Verified against OpenRouter? |
|---|---|---|---|
| Claude Code | OTLP export → custom receiver | Yes | Yes — exact match, 2 separate sessions |
| Pi | Custom extension → CSV | Yes | Yes — exact match, 2 separate sessions |
| OpenCode | Built-in `opencode stats` | Yes | Yes — output & message count exact match, input within display rounding, 1 session |

**Cost columns from all three harnesses are self-calculated internally,
not read from OpenRouter's actual bill — confirmed unreliable (Claude Code
overstated real cost by ~4x across 3 sessions checked; Pi was off 2–18%).
Never use a harness's own cost field for real dollar comparisons — always
pull cost from OpenRouter's dashboard/API instead.**

**Confirmed token formula** (matches OpenRouter's combined "Input" column):
```
OpenRouter's Input = fresh input tokens + cache-read tokens (+ cache-creation tokens, unverified — always 0 in every session checked so far)
```

---

## Claude Code — full story

### What finally works: OTLP export with `http/json` protocol

**Files:**
- `claude-otlp-receiver.js` — HTTP server that receives Claude Code's
  telemetry and maintains `claude-usage-log.csv` automatically
- `replay-otlp-log.js` — rebuilds the CSV from the permanent raw log
  (`claude-otlp-raw.jsonl`) if the parsing logic is ever changed again

**How to run (two terminals):**

Terminal A — start the receiver, leave running:
```bash
cd ~/open-weight-agent-bench
node claude-otlp-receiver.js
```

Terminal B — run Claude Code:
```bash
cd ~/open-weight-agent-bench
source ./eval-env.sh
export CLAUDE_CODE_ENABLE_TELEMETRY=1
export OTEL_METRICS_EXPORTER=otlp
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
export OTEL_EXPORTER_OTLP_PROTOCOL=http/json
claude
```
Chat and exit normally. `claude-usage-log.csv` updates itself with zero
manual steps.

Works identically for real Claude models (not just GLM) — just skip
`source ./eval-env.sh`. The OTLP mechanism doesn't depend on which model
or backend is being used.

### Everything that was tried and failed first (in order)

1. **`claude 2>&1 | tee -a log.txt`** — piping stdout broke Claude Code's
   TTY detection, forcing it into non-interactive `--print` mode, which
   then crashed immediately since no prompt argument was given:
   `Error: Input must be provided either through stdin or as a prompt
   argument when using --print`.

2. **`claude 2> >(tee -a log.txt >&2)`** (process substitution,
   stderr-only) — ran without crashing, but captured nothing real. Root
   cause identified in attempt #3.

3. **`claude 2>> log.txt`** (plain stderr redirect) — confirmed
   conclusively via `grep` that a real session's data never appeared in
   the file at all. This proved Claude Code's console-exporter output
   goes to **stdout**, not stderr — so anything that only redirects
   stderr can never capture it, explaining why #2 also failed.

4. **`script -q -c "claude" log.txt`** (pty-wrapper approach) — never
   actually tested; `script` is **not installed** in this Git
   Bash/MSYS environment (`which script` returned nothing).

5. **Manual copy-paste + `parse-cc-tokens.js`** — this DID work and was
   used successfully for several sessions, but requires manually copying
   the printed console block into a log file after every session. Fully
   accurate, but not automatic. Superseded by the OTLP method below and
   no longer needed — file can be deleted.

6. **First OTLP attempt** — receiver was reachable (confirmed via curl,
   got HTTP 200), but Claude Code never sent it any data at all — no
   entries ever appeared in `claude-otlp-raw.jsonl` after multiple real
   sessions. Root cause found by checking Claude Code's own public
   GitHub repo (`anthropics/claude-code`) changelog and
   `examples/gateway/` config samples: **OTLP's default wire protocol
   is not plain JSON** (it can be `grpc` or binary `http/protobuf`,
   neither of which a simple JSON-parsing HTTP server can read, and
   `grpc` may fail at the connection level entirely rather than sending
   a parseable request). Fix: explicitly set
   `OTEL_EXPORTER_OTLP_PROTOCOL=http/json`. This was the missing piece —
   confirmed working immediately after adding it.

### Critical bug found and fixed after OTLP started "working"

Even after data started arriving, the **first version** of
`claude-otlp-receiver.js` produced silently wrong numbers. Root cause:
Claude Code's OTLP metrics use **DELTA aggregation temporality**
(`"aggregationTemporality": 1` in the raw payload) — each flush reports
only the *increment* since the last flush, not a running total. Multiple
flushes happen per session (roughly one per conversational turn).

The original receiver used `Math.max(prev, value)` per data point,
correct for *cumulative* counters (like the earlier console-export
method, which does report running totals) but **wrong for delta data** —
it silently picked whichever single flush happened to report the largest
number for each token type, instead of adding all flushes together.

**Verified impact:** on one real session with 2 flushes, the buggy
version reported 190,776 combined input tokens; the correct (fixed)
version reported 270,511 — a 41.6% undercount, with no error or warning
of any kind. The fix (in the current `claude-otlp-receiver.js`) sums
values per `(session_id, query_source, token_type)` across all flushes
instead of taking the max. **If this script is ever edited again, do
not reintroduce `Math.max` for token/cost aggregation — always sum.**

### Verification sessions (post-fix)
- Session `899cc4c4...`: fixed receiver reported 270,511 input / 1,141
  output. OpenRouter dashboard (8 matching rows, summed by hand):
  270,511 / 1,141 — exact match.
- Session `6f70e66f...`: receiver reported 181,328 / 999. OpenRouter (6
  rows summed): 181,328 / 999 — exact match.

---

## Pi — unchanged from earlier verification

Extension-based, no OTel involved (Pi has no working OTel implementation
— checked its actual source on GitHub; only a design-doc proposal exists,
unshipped).

```bash
cd ~/open-weight-agent-bench
source ./eval-env.sh
pi
```
Logs automatically to `pi-usage-log.csv` via
`~/.pi/agent/extensions/token-logger.ts`. Verified exact against
OpenRouter across 2 sessions. Cost column confirmed self-calculated and
off by 2–18% — don't trust it for dollar comparisons.

---

## OpenCode — built-in stats, now verified

```bash
cd ~/open-weight-agent-bench
source ./eval-env.sh
opencode
```
Check with:
```bash
opencode stats --days 0 --models
```
No custom code — reads OpenCode's own local SQLite database directly
(`~/.local/share/opencode/opencode.db`).

**CORRECTED 2026-08-13:** this doc previously gave the path as
`~/AppData/Roaming/opencode/opencode.db`, which does not exist on this
machine. Two things matter when reading it directly:
- There is a multi-MB uncheckpointed `-wal` alongside the `.db`. Copy
  `.db`, `.db-wal` and `.db-shm` together, or you read stale data.
- The `session` table already carries `tokens_input`, `tokens_output`,
  `tokens_reasoning`, `tokens_cache_read`, `tokens_cache_write` and
  `cost` per session, plus a `directory` column that maps a session to
  its benchmark instance. `scripts/extract-opencode-usage.js` does all
  of this; OpenCode no longer needs a manual OpenRouter pull.

**First verification, done in this session:** compared the "Model Usage"
block against 6 matching OpenRouter rows for the same session.
- Output tokens: 851 vs 851 — exact.
- Message count: 6 vs 6 — exact.
- Input tokens: 39.6K + 99.3K (cache read) ≈ 138.9K vs a hand-summed
  138,975 from OpenRouter — consistent with rounding (opencode only
  displays one decimal place in "K" units), not a byte-for-byte
  verification the way Pi/Claude Code got.

**Known quirk:** OpenCode's own "Overview" section and "Model Usage"
section can disagree with each other when a stray/unrelated session's
data is mixed in (observed: Overview showed Output=802, Model Usage
showed 851, for what should have been the same data — resolved once a
stray extra row was excluded from the manual OpenRouter comparison).
Always cross-check against the **Model Usage** block specifically, not
Overview, if the two ever disagree.

---

## Cleanup — files no longer needed (superseded by OTLP method)

```bash
cd ~/open-weight-agent-bench
rm -f test-otlp-setup.sh
rm -f test-otlp-setup.ps1
rm -f OTLP-TESTING.md
rm -f RUN-OTLP-TEST.txt
rm -f claude-otlp-receiver-verbose.js
rm -f parse-cc-tokens.js
rm -f claude-otel-console.log
```

## Files that matter, going forward

```
eval-env.sh                   — OpenRouter/GLM-5.2 routing config
claude-otlp-receiver.js       — Claude Code's automatic logger (fixed version)
replay-otlp-log.js            — rebuilds claude-usage-log.csv from raw data if needed
claude-otlp-raw.jsonl         — permanent raw payload history (never delete)
claude-usage-log.csv          — Claude Code's clean output
pi-usage-log.csv              — Pi's clean output
~/.pi/agent/extensions/token-logger.ts — Pi's logging extension
token-measurement-methods.md  — this file
token-commands.md             — day-to-day quick-reference commands
project-context-phase2.md     — overall project context
```

## Open items

- OpenCode's input-token verification relied on rounded display values
  (137,975 vs "138.9K") — not a byte-exact check like Pi/Claude Code got.
  Querying `opencode.db` directly (SQLite) would give exact figures if
  fully precise verification is ever needed.
- Real-Claude-model (non-GLM) sessions haven't been independently
  cross-checked against anything (no OpenRouter equivalent exists for
  direct Anthropic billing) — Anthropic Console's usage page is an
  unexplored possible source if this is ever needed.
- Now that all three harnesses have working, verified token measurement,
  next phase is designing and running the actual comparison task matrix
  (see evaluation design discussion — task sourcing, sealed git history,
  pass/fail grading via held-out tests, per-task logging with a
  `task_id` column added to each harness's CSV).
