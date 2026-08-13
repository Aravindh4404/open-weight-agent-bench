# Open-Weight Agent Bench — Current Status & How To Check Results

Snapshot as of this session. This is the "where are we, how do I check, what
matters" doc — pair with `PROJECT-MASTER-DOCUMENTATION.md` (the earlier,
more detailed methodology reference) for full command-by-command history.

---

## The one-line answer: how many have we done?

**5 fully complete instances**, each with all 6 combinations (3 harnesses ×
2 models) run, graded, and verified: **django-10914, flask-4045,
marshmallow-1343, sympy-12481, xarray-4094**. That's **30 verified data
points** total.

Plus 1 partially-done instance (astroid-1268 — GLM only, 3/6 combos) and
several abandoned/not-started ones (see table below).

---

## How to check results yourself, right now

Everything lives in one file:
```bash
cat ~/open-weight-agent-bench/comparison-results.csv
```

Columns: `instance_id,harness,model,elapsed_real_seconds,total_tokens,pass_fail,verification_method`

Quick summary view (count rows per instance):
```bash
cut -d',' -f1 ~/open-weight-agent-bench/comparison-results.csv | tail -n +2 | sort | uniq -c
```
Should show `6` next to each fully-complete instance.

Check for any incomplete rows (missing fields — a real problem if found):
```bash
awk -F',' 'NF != 7 {print NR": "$0}' ~/open-weight-agent-bench/comparison-results.csv
```
Should print nothing. If it prints something, that row needs fixing (see
"How to safely edit the CSV" below).

Per-instance write-ups (narrative detail, what happened, findings) live in:
```bash
ls ~/open-weight-agent-bench/results/
# or ~/open-weight-agent-bench/setup/ depending on which session created them
```
Currently exists: `eval-try-1-swebench.md` (marshmallow, original manual
run), `eval-try-2-astroid.md`, `eval-try-3-django.md`. Flask and the
6-combo marshmallow rerun don't have write-ups yet — worth doing.

---

## Full instance status table

| Instance | GLM (3 harnesses) | Sonnet (3 harnesses) | Overall |
|---|---|---|---|
| **django-10914** | ✅ all 3, PASS | ✅ all 3, PASS | **Complete — 6/6 PASS** |
| **flask-4045** | ✅ all 3, PARTIAL | ✅ all 3, PARTIAL | **Complete — 6/6 PARTIAL** |
| **marshmallow-1343** | ✅ all 3, PASS | ✅ all 3, PASS | **Complete — 6/6 PASS** |
| **sympy-12481** | ✅ all 3, PASS | ✅ all 3, PASS | **Complete — 6/6 PASS** |
| **xarray-4094** | ✅ all 3, PASS | ✅ all 3, PASS | **Complete — 6/6 PASS** |
| astroid-1268 | ✅ all 3, PASS | ❌ not run | Half-done — 3/6 |
| sqlfluff-1625 | — | — | Abandoned (bad instance — real issue closed as "not a bug") |
| astropy-12907 | — | — | Abandoned (C-extension build failure, unfixable in 2 attempts) |
| xarray-3364 | — | — | Abandoned (Claude Code stuck mid-run — same stall recurred on xarray-4094, see below) |
| requests, pylint, pytest, sphinx | — | — | Not started |

---

## What each instance actually found (the interesting part)

**django-10914** (`FILE_UPLOAD_PERMISSIONS` default bug): every harness on
every model found the exact correct, complete fix. Boring in a good way —
proves the pipeline works cleanly when the bug itself is simple and
unambiguous.

**flask-4045** (blueprint dotted-name validation): every single one of the
6 combinations converged on the *same incomplete* fix — all patched
`Blueprint.__init__` but missed the matching fix needed in `add_url_rule`.
Since this happened identically across 3 different harnesses and 2
different models, the likely explanation is the bug report's phrasing
itself, not a harness or model weakness. Worth featuring as a finding about
prompt/issue clarity rather than a harness comparison.

**marshmallow-1343** (nested schema validator crash): all 6 PASS, but not
uniform — 5 combos fixed it the same way (guard in `schema.py`'s
`_invoke_field_validators`), while **Claude Code + Sonnet took a
completely different, structurally distinct approach** (patched
`marshalling.py`'s `deserialize()` directly). Also notable:
**Pi + Sonnet was dramatically fastest/cheapest** — 59s, 89,190 tokens —
versus Claude Code + Sonnet's 276s and 2,074,511 tokens on the identical
task. A ~23x token gap, same model, different harness only.

**sympy-12481** (`Permutation` constructor rejecting non-disjoint cycles):
all 6 PASS, but with real quality variance in the fix itself. 3 combos
matched the gold patch almost exactly. 2 (Claude Code + Sonnet, OpenCode +
Sonnet) added a stricter condition not in the original fix — technically
divergent but happened to still pass every test, since none exercise that
edge case. 1 (Pi + GLM) was architecturally the most divergent — hand-rolled
an early return bypassing most of the constructor's normal logic entirely,
riskiest of the six despite passing. A reminder that "PASS" doesn't always
mean "safe" — worth spot-checking fix *content*, not just test results, on
future instances.

**xarray-4094** (`to_unstacked_dataset` broken for single-dim variables):
all 6 PASS, with a clean **model-line split** in fix approach — all 3
Sonnet runs converged on the exact upstream gold patch
(`self.sel({variable_dim: k}, drop=True)`), while all 3 GLM runs
independently converged on a different-but-equally-valid approach
(`.squeeze(drop=True).drop_vars(dim, errors="ignore")`). This is a new
pattern shape not seen in earlier instances (which split by harness, not by
model) — worth watching whether this recurs on future instances, since it
would suggest model choice can also drive *how* a bug gets fixed, not just
cost/speed.

**This instance also recreated the exact stall from the abandoned
`xarray-3364` attempt** — OpenCode froze after only printing its startup
banner, with a static log, three consecutive 0% CPU readings, and flat
memory for 4.5+ minutes. This time it was correctly diagnosed as a real
hang (not just normal output-buffering silence, which both Claude Code and
OpenCode do for minutes during legitimate large turns) and recovered by
killing the process, confirming no source files had been touched, and
manually re-running just that one combo — it completed cleanly on retry
(520s). Root cause of the stall itself is still unknown. **Reliable stall
diagnosis method going forward:** log silence alone is not proof of a hang
— check CPU usage via `wmic path Win32_PerfFormattedData_PerfProc_Process
where "IDProcess=<pid>" get PercentProcessorTime` across at least two
samples a few seconds apart; near-0% but non-zero readings mean it's
network-idle between tool calls (normal), while a genuine multi-minute
0%-with-flat-memory pattern indicates a real hang worth killing.

---

## Token/time patterns across all 5 complete instances (worth citing)

**Average tokens per harness, across all 30 verified rows:**
- Claude Code: 1,744,819
- OpenCode: 1,102,075
- Pi: 224,786

Claude Code has been the highest-token harness in every single instance so
far, on both models, without exception — 10 for 10. Pi has been the
lowest-token harness every time too, also 10 for 10.

**Claude Code vs Pi token ratio, per instance/model:**

| Instance | GLM | Sonnet |
|---|---|---|
| django | 8.2x | 5.2x |
| flask | 4.0x | 8.9x |
| marshmallow | 2.6x | 23.3x |
| sympy | 9.0x | 16.2x |
| xarray | 8.5x | **62.3x** |

The ratio is volatile in absolute size (2.6x to 62.3x) but never inverts —
Claude Code is always the most expensive, by a wide margin, on every single
combination tried. The xarray-4094 Sonnet result is the most extreme yet:
Claude Code used over 62x more tokens than Pi to arrive at functionally the
same fix.

This is a real, repeated pattern — not a one-off. It matches the original
Databricks article's central claim (harness context-management strategy
drives cost more than model choice) and your own earlier per-turn analysis
on django (Claude Code sends far more tokens per turn than Pi, not more
turns).

**The OpenCode/Pi directional split, confirmed 5-for-5:** going from GLM to
Sonnet, OpenCode's token usage *always increases* and Pi's *always
decreases* — no exceptions across any instance tried:

| Instance | OpenCode GLM→Sonnet | Pi GLM→Sonnet |
|---|---|---|
| django | +79% | −10% |
| flask | +262% | −38% |
| marshmallow | +37% | −82% |
| sympy | +104% | −57% |
| xarray | **+409%** | −80% |

This is now a strong, consistent, repeated finding across 5 independent
codebases and bug types — worth treating as a real result, not noise. Worth
investigating *why* in a future session (e.g. does OpenCode's tool-calling
format interact poorly with Sonnet specifically? does Pi's context-pruning
strategy specifically benefit from Sonnet's behavior?).

---

## Timing patterns (separate from tokens — they don't move together)

**Average elapsed time by harness, across all 30 rows:**
- Claude Code: 290s (min 148, max 542)
- OpenCode: 216s (min 96, max 520)
- Pi: 129s (min 59, max 213)

Same ranking as tokens (Claude Code slowest, Pi fastest), but the *gap* is
much smaller for time than for tokens — Claude Code is only ~2.2x slower
than Pi on average, versus ~7.8x more tokens. This means Claude Code isn't
spending more time *thinking* — it's sending much bigger payloads per turn.
Confirms the earlier per-turn analysis on django (Claude Code re-sends a
large, growing context on nearly every turn).

**Throughput (tokens/sec), by harness average:**
- Claude Code: 6,895 tok/s (fastest per-token, despite highest total)
- OpenCode: 5,173 tok/s
- Pi: 1,689 tok/s (slowest per-token, despite lowest total)

This is a genuinely counter-intuitive but important nuance: Claude Code
isn't "slow" — it processes tokens quickly. It's just verbose, generating
far more content per turn than the other harnesses. Pi is the opposite:
slow per-token, but finishes fastest overall simply because it has so much
less to process in the first place.

**The OpenCode/Pi directional split holds for TIME too, almost as cleanly
as it does for tokens:**

| Instance | OpenCode time GLM→Sonnet | Pi time GLM→Sonnet |
|---|---|---|
| django | +58% | **+31%** ← exception |
| flask | +98% | −54% |
| marshmallow | +10% | −57% |
| sympy | +169% | −19% |
| xarray | +219% | −44% |

OpenCode's time increases GLM→Sonnet in all 5 instances, no exceptions —
same as its token pattern. Pi's time decreases in 4 of 5, but **django is a
genuine exception** (Pi took 31% *longer* on Sonnet there, despite using
*fewer* tokens on Sonnet at the same time) — worth noting honestly rather
than claiming a perfectly clean pattern. Time and tokens don't always move
together even within the same harness/instance.

**Claude Code's time direction is genuinely unpredictable, unlike Pi and
OpenCode:** −69%, +8%, −35%, −41%, +37% across the 5 instances — no
consistent direction at all. This is a real, distinct finding on its own:
Claude Code is the least *predictable* harness in both cost and speed, not
just the most expensive on average.

---

## Known infrastructure issues — fixed, and how

These were real bugs found and fixed along the way. **All fixes are now
baked into `~/open-weight-agent-bench/scripts/run-matrix.sh`** — you don't
need to reapply them manually for future runs, just be aware they exist:

1. **`.git` upward-search leak** — harnesses could read real (if
   irrelevant) project git history from parent directories even with
   `.git` stripped from the clone. Fixed by adding an empty `.git` **file**
   (not folder) as a boundary marker (`touch .git` after `rm -rf .git`).

2. **Script capturing harness's full stdout into the timing variable** —
   corrupted the results CSV with megabytes of text. Fixed by redirecting
   each harness's output to its own `<combo-folder>.log` file.

3. **The `gbrain` plugin silently overriding model selection** — a
   third-party plugin in `~/.claude/settings.json` intercepted model
   choice regardless of `ANTHROPIC_MODEL` or `--model`. Fixed with
   `claude --settings <empty-json-file>` to bypass the global config.

4. **`--permission-mode acceptEdits` doesn't cover Bash/test execution** —
   only auto-approves file edits, so headless runs needing to execute
   tests would hang waiting for approval that never comes. Fixed by using
   `--dangerously-skip-permissions` instead for fully headless runs.

5. **OTLP telemetry flush timing** — the default ~60s metric export
   interval meant short sessions could exit before ever flushing token
   data, silently losing it. Fixed with `OTEL_METRIC_EXPORT_INTERVAL=5000`
   (flush every 5s).

6. **OTLP receiver mislabeling sessions by first-seen model, not dominant
   model** — a tiny internal auxiliary call (e.g. a few hundred tokens of
   Haiku) landing before the real session's data caused entire multi-
   million-token Sonnet sessions to get labeled "haiku" even though token
   totals were always correct. Fixed in `claude-otlp-receiver.js` to label
   by whichever model accounts for the most tokens in a session.

7. **`GBRAIN_MODEL` env var only unset on one code branch** — the fix for
   #3 was initially only applied to the Sonnet/subscription branch of
   `run_claude()`, not the GLM/OpenRouter branch. Fixed to unset
   unconditionally.

8. **The OTLP receiver only tracks tokens per-session correctly if it's
   been alive since the session started** — restarting it mid-run (or right
   before a run, as happened for both sympy and xarray) means the very
   first combo after a restart risks a race where `run-matrix.sh` samples
   the CSV before the receiver's first periodic flush lands, showing `0`
   tokens even though real data exists in `claude-usage-log.csv` a few
   seconds later. Always double-check any `0`-token row against the raw log
   directly before trusting it — this has now happened on 2 of 5 instances.

9. **`setuptools_scm`-versioned repos (like xarray) fail to install in
   `clean-*` folders specifically because `.git` gets stripped** —
   `setuptools_scm` needs real git tags to detect a version, and the
   boundary-file fix (`touch .git`) isn't a real repo, so version detection
   fails with `LookupError: setuptools-scm was unable to detect version`.
   `grading/` never hits this since it keeps its real `.git`. Fix: prefix
   the install with `SETUPTOOLS_SCM_PRETEND_VERSION=<any version string>`.
   Worth checking for this pattern (`use_scm_version=True` in `setup.py`)
   before starting a new instance on an unfamiliar repo.

**Still open, no fix yet:**
- OpenCode has no reliable per-session token command. Every OpenCode number
  in this project came from manually exporting OpenRouter's activity CSV
  and matching by timestamp window — always double-check the row count/time
  span looks right before trusting a number (a partial/scrolled screenshot
  gave a wildly wrong number once, ~96K vs the real ~734K, before a full
  CSV export corrected it).
- `PASS_TO_PASS` regression tests have never been checked on any instance,
  any combo — only the target `FAIL_TO_PASS` test (though as of sympy and
  xarray, the full test *file* is being run instead of just the one target
  test, which does give real incidental regression coverage on those two).
- The `xarray-3364`/`xarray-4094` stall recurred and still has no known
  root cause — only a reliable diagnosis-and-recovery procedure (see above).

---

## How to safely edit `comparison-results.csv`

Never hand-edit rows in place. Always remove-then-append:
```bash
cd ~/open-weight-agent-bench
grep -v "^INSTANCE,HARNESS,MODEL," comparison-results.csv > /tmp/cr.csv
mv /tmp/cr.csv comparison-results.csv
cat >> comparison-results.csv << 'EOF'
INSTANCE,HARNESS,MODEL,ELAPSED_SECONDS,TOKENS,PASS_FAIL,VERIFICATION_METHOD
EOF
cat comparison-results.csv   # always verify after
```

---

## Suggested next steps, in order of effort/value

1. **Finish astroid-1268's Sonnet pass** (3 more combos) — cheapest way to
   get a 6th fully-complete instance, since GLM's already done and
   verified.
2. **Write up flask-4045, marshmallow, sympy, and xarray** as proper
   instance docs (matching the existing `eval-try-N` format) — currently
   only exist as raw CSV rows plus scattered chat history.
3. **Now that you have 5 complete instances with a strong, repeated
   pattern (Claude Code always most expensive, Pi always cheapest, and the
   OpenCode/Pi directional split 5-for-5)**, this is genuinely enough data
   to write up as a real finding for your report — worth doing a proper
   chart (tokens by harness, faceted by model, across all 5 instances)
   rather than just tables.
4. **Pick 2-3 fresh instances** from the original list (requests, pylint,
   pytest, sphinx) to push toward the full ~10-instance target — the
   pipeline is now well-proven (5 clean runs in a row with only
   instance-specific environment quirks, no fundamental script bugs), so
   these should go faster than the first few.
5. Worth investigating *why* the OpenCode/Pi directional split happens —
   comparing a GLM and Sonnet transcript from the same instance directly
   (e.g. marshmallow, which has the most extreme Pi swing) might reveal
   whether it's a tool-calling format mismatch, a context-pruning
   difference, or something else.
