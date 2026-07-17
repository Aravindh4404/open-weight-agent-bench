# Phase 2 — Token Usage Tracking: Progress Notes

## Goal

Get an accurate, per-task token/cost count for Claude Code sessions
running GLM 5.2 through OpenRouter, so it can later be compared against
Pi and OpenCode on the same tasks (the Databricks-style harness
comparison that's the point of Phase 2).

## What we built

Two scripts, living in `hooks/` inside `~/open-weight-agent-bench`:

### `hooks/log-usage.sh` — a Claude Code `Stop` hook

Registered in `.claude/settings.json` on the `Stop` event, so it runs
automatically every time Claude finishes responding — no manual step.

What it does, in order:
1. Receives `session_id` and `transcript_path` from Claude Code on stdin.
2. Reads that session's transcript (a JSONL file Claude Code already
   writes automatically — this isn't something we added).
3. **Dedupes** transcript lines by `message.id`, keeping only the last
   line per id (see "Bugs found" below — this was a critical fix).
4. Groups the deduped requests **by model**, not by session as a whole.
5. Within each model group, sums `input_tokens`, `output_tokens`,
   `cache_creation_input_tokens`, `cache_read_input_tokens`, and adds a
   computed `total_input_tokens_incl_cache` (the three input-side fields
   combined — this is what matches OpenRouter's single "Input" column).
6. Also counts how many of that group's messages have an
   OpenRouter-shaped id (`gen-...`) vs. not, as a contamination signal.
7. Appends one CSV row per (session, model) pair to `usage-log.csv`.
8. Never blocks the session — any internal failure is a silent no-op.

### `hooks/summarize-usage.sh`

Reads `usage-log.csv` and prints one row per (session, model) pair,
taking the **last** row for each pair (values are cumulative per Stop
event, so summing multiple rows would double-count). Also prints `⚠`
warnings if:
- a single session shows more than one model (contamination), or
- any row has messages that don't look OpenRouter-routed.

## Current CSV schema (13 columns)

```
timestamp,session_id,harness,env_model,transcript_model,
unique_requests_so_far,cumulative_input_tokens,cumulative_output_tokens,
cumulative_cache_creation_input_tokens,cumulative_cache_read_input_tokens,
total_input_tokens_incl_cache,openrouter_routed_count,other_routed_count
```

## Bugs found and fixed, in order

1. **Stale header / column drift.** An early script version's CSV header
   didn't match a later version's row shape (extra columns added without
   regenerating the header). Fixed by renaming old CSV files out of the
   way whenever the schema changes, rather than trying to migrate them.

2. **Wrong column indices in the summarizer.** `summarize-usage.sh`
   assumed the old column layout after `log-usage.sh` changed. Fixed by
   keeping both scripts' schemas in sync explicitly.

3. **Cumulative-total double-counting.** `log-usage.sh` writes a running
   cumulative total on every `Stop` event, not a per-turn delta (since
   one user turn can span multiple assistant JSONL lines). The original
   summarizer summed *all* rows per session instead of taking just the
   last one, which would have multiplied totals for any session with
   more than one `Stop` event. Fixed by keying on the last row per
   (session, model) pair.

4. **Single-model-per-session blind spot.** The original design
   collapsed a whole session into one model label (whichever model the
   *last* message used), which silently hid any session that mixed
   models. Fixed by grouping and reporting per model within a session,
   plus an automatic contamination warning.

5. **~5x overcounting from transcript duplication (the big one).**
   Confirmed by comparing against OpenRouter's own request log for one
   session: the transcript had **25** assistant-type lines, but only
   **5 unique** `message.id` values, while OpenRouter's log showed **6**
   real API requests for that session. Claude Code appears to write
   multiple transcript lines per real request (likely streaming
   snapshots), all sharing one id. Summing every line — what earlier
   versions did — inflated every token count by roughly 5x. Fixed by
   deduping on `message.id` (last line per id) before summing anything.

## Verification method

Cross-checked our token totals against OpenRouter's own **Logs** page,
filtered by **Session ID** (`openrouter.ai/activity` → Logs → filter by
session) — this is more reliable than matching by timestamp, since it
guarantees no other traffic gets mixed in.

**Result for session `2c69837a-1e5f-49cd-93af-374bb6a12416`:**

| | Our total | OpenRouter's total | Difference |
|---|---|---|---|
| Input (incl. cache) | 199,111 | 199,496 | 385 |
| Output | 1,482 | 1,494 | 12 |

The entire difference (385 / 12) is fully explained by one request
(OpenRouter's smallest row, `385 tok` / `12 tok`) that hadn't been
flushed to the transcript file yet when the `Stop` hook read it —
Claude Code's own docs note the transcript is written asynchronously
and can lag. This is a known, small, and understood undercount at the
margins — not an error worth chasing further right now.

## Known open items

- **Model contamination in an earlier session.** Session `ba837ca2` (an
  older test) showed a mix of OpenRouter-shaped ids (`gen-...`) and
  Anthropic-native-shaped ids (`msg_...`, `sg_...`) within what was
  supposed to be a pure GLM 5.2 run. Likely cause: the global
  `"model": "haiku"` default in `~/.claude/settings.json` may route some
  background/utility calls directly to Anthropic regardless of the
  `ANTHROPIC_BASE_URL` / `ANTHROPIC_MODEL` override used for the main
  agent loop. Not confirmed — worth checking Claude Code's settings docs
  for whether there's a way to force *all* traffic through the override.
  The newer per-model + routing-flag design in `log-usage.sh` will now
  surface this automatically via the `⚠` warnings if it happens again.
- **Global vs. project hook scope.** A leftover global hook in
  `~/.claude/settings.json` (`PreToolUse` → `rtk hook claude`) was found
  to be broken (command not found) and unrelated to this project — noted
  for cleanup but not blocking.
- **Leaked OpenRouter key.** An API key was found committed to git
  history during this work. It should be rotated (if not already done)
  before continuing, regardless of whether git history itself gets
  scrubbed.

## Status: ready to use

The hook is logically verified and cross-checked against real
OpenRouter data. Next step is running real benchmark tasks through
Claude Code (GLM 5.2), then extending the same measurement approach to
Pi and OpenCode for the actual harness comparison.
