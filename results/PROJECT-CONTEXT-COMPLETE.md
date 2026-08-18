# Open-Weight Agent Bench — Complete Project Context

Single reference document containing everything needed to continue this
project or write a publication-quality report. Supersedes earlier scattered
docs (`CURRENT-STATUS.md`, `PROJECT-MASTER-DOCUMENTATION.md`,
`eval-try-N-*.md`).

---

## 1. Research question and origin

Does coding-agent **harness** choice drive token cost more than **model**
choice, controlling for the task?

Motivated by the Databricks article *"Benchmarking Coding Agents on
Databricks' Multi-Million Line Codebase"* (July 2026), whose central harness
claim was: running the same model through different harnesses produced >2×
cost differences at equal quality, driven by how much context each harness
re-fed per turn (Pi sending ~3× less than Claude Code).

**Environment:** Windows, Git Bash (MINGW64), home `/c/Users/aravi`, project
folder `~/open-weight-agent-bench`.

---

## 2. Final results — 5 instances × 3 harnesses × 2 models = 30 runs

| Instance | Harness | Model | Time (s) | Tokens | Result |
|---|---|---|---|---|---|
| django-10914 | Claude Code | GLM-5.2 | 542 | 2,564,841 | PASS |
| django-10914 | Pi | GLM-5.2 | 163 | 313,086 | PASS |
| django-10914 | OpenCode | GLM-5.2 | 132 | 734,392 | PASS |
| django-10914 | Claude Code | Sonnet 5 | 169 | 1,478,308 | PASS |
| django-10914 | Pi | Sonnet 5 | 213 | 282,252 | PASS |
| django-10914 | OpenCode | Sonnet 5 | 208 | 1,315,245 | PASS |
| flask-4045 | Claude Code | GLM-5.2 | 148 | 1,391,501 | PARTIAL |
| flask-4045 | Pi | GLM-5.2 | 193 | 349,753 | PARTIAL |
| flask-4045 | OpenCode | GLM-5.2 | 110 | 404,060 | PARTIAL |
| flask-4045 | Claude Code | Sonnet 5 | 160 | 1,934,743 | PARTIAL |
| flask-4045 | Pi | Sonnet 5 | 88 | 216,668 | PARTIAL |
| flask-4045 | OpenCode | Sonnet 5 | 218 | 1,463,467 | PARTIAL |
| marshmallow-1343 | Claude Code | GLM-5.2 | 425 | 1,293,146 | PASS |
| marshmallow-1343 | Pi | GLM-5.2 | 137 | 500,163 | PASS |
| marshmallow-1343 | OpenCode | GLM-5.2 | 219 | 1,135,591 | PASS |
| marshmallow-1343 | Claude Code | Sonnet 5 | 276 | 2,074,511 | PASS |
| marshmallow-1343 | Pi | Sonnet 5 | 59 | 89,190 | PASS |
| marshmallow-1343 | OpenCode | Sonnet 5 | 241 | 1,557,384 | PASS |
| sympy-12481 | Claude Code | GLM-5.2 | 344 | 1,995,479 | PASS |
| sympy-12481 | Pi | GLM-5.2 | 124 | 220,762 | PASS |
| sympy-12481 | OpenCode | GLM-5.2 | 96 | 604,541 | PASS |
| sympy-12481 | Claude Code | Sonnet 5 | 204 | 1,546,219 | PASS |
| sympy-12481 | Pi | Sonnet 5 | 100 | 95,467 | PASS |
| sympy-12481 | OpenCode | Sonnet 5 | 258 | 1,234,941 | PASS |
| xarray-4094 | Claude Code | GLM-5.2 | 265 | 1,271,558 | PASS |
| xarray-4094 | Pi | GLM-5.2 | 139 | 150,071 | PASS |
| xarray-4094 | OpenCode | GLM-5.2 | 163 | 422,337 | PASS |
| xarray-4094 | Claude Code | Sonnet 5 | 362 | 1,897,882 | PASS |
| xarray-4094 | Pi | Sonnet 5 | 78 | 30,450 | PASS |
| xarray-4094 | OpenCode | Sonnet 5 | 520 | 2,148,788 | PASS |

Canonical source: `~/open-weight-agent-bench/comparison-results.csv`
(columns: `instance_id,harness,model,elapsed_real_seconds,total_tokens,pass_fail,verification_method`)

### Aggregate

| Harness | Avg. Tokens | Avg. Time (s) | Avg. Tokens/sec |
|---|---|---|---|
| Claude Code | 1,744,819 | 290 | 6,895 |
| OpenCode | 1,102,075 | 216 | 5,173 |
| Pi | 224,786 | 129 | 1,689 |

Claude Code averaged **7.76×** more tokens than Pi across all 30 runs.

### Claude Code vs Pi token ratio, per cell

| Instance | GLM-5.2 | Sonnet 5 |
|---|---|---|
| django | 8.2× | 5.2× |
| flask | 4.0× | 8.9× |
| marshmallow | 2.6× | 23.3× |
| sympy | 9.0× | 16.2× |
| xarray | 8.5× | **62.3×** |

Ratio ranges 2.6×–62.3× and **never inverts** — Claude Code was the most
token-expensive harness in all 10 instance/model cells; Pi the cheapest in
all 10.

### GLM→Sonnet directional change (tokens)

| Instance | Claude Code | OpenCode | Pi |
|---|---|---|---|
| django | −42% | +79% | −10% |
| flask | +39% | +262% | −38% |
| marshmallow | +60% | +37% | −82% |
| sympy | −23% | +104% | −57% |
| xarray | +49% | +409% | −80% |

**OpenCode increased on all 5. Pi decreased on all 5. Claude Code has no
consistent direction.** Same model switch, opposite cost effects depending
on harness.

### GLM→Sonnet directional change (time)

| Instance | Claude Code | OpenCode | Pi |
|---|---|---|---|
| django | −69% | +58% | **+31%** ← exception |
| flask | +8% | +98% | −54% |
| marshmallow | −35% | +10% | −57% |
| sympy | −41% | +169% | −19% |
| xarray | +37% | +219% | −44% |

OpenCode's time increased on all 5. Pi's decreased on 4 of 5 (django is the
exception — Pi took 31% *longer* on Sonnet while using *fewer* tokens,
showing time and tokens are separate axes).

---

## 3. Methodology

### Task source
`princeton-nlp/SWE-bench_Lite` — real GitHub issues paired with the
human-written fix and a test that verifies it. Chose real pre-solved bugs
over invented tasks for objective, test-based grading rather than LLM
judging (which Databricks flagged as rewarding "sounding right over being
right").

Per-instance fields used:
- `base_commit` — checkout point (state immediately before the real fix)
- `problem_statement` — given to the harness **verbatim, never paraphrased**
- `test_patch` — applied to the grading copy only
- `FAIL_TO_PASS` — the grading criterion
- `patch` (the real fix) and `hints_text` — **never shown to the harness**

### Instance selection criteria
Pure-Python repos with no C-extension build dependencies. Heavy
scientific-stack repos reliably failed environment setup for reasons
unrelated to harness performance.

### Per-run isolation
Two copies per instance:
- `clean-<harness>-<model>/` — where the harness works. Fresh clone at
  `base_commit`, `.git` removed, then an **empty `.git` file** created as a
  boundary marker.
- `grading/` — private verification copy. Keeps real `.git`. Receives
  `test_patch`. Reset via `git checkout -- <file>` between grades.

**Why the boundary file:** removing `.git` isn't sufficient — git searches
*upward* through parent directories for a repo, and the project folder
itself is a git repo. An empty `.git` *file* makes git fail immediately
(`fatal: invalid gitfile format`) instead of walking up. Two harnesses were
directly observed attempting to exploit this before the fix; it was a real,
not theoretical, vector.

### Non-interactive invocation (all confirmed via each tool's `--help`)
```
Claude Code: claude --settings <empty.json> --dangerously-skip-permissions -p "<prompt>"
Pi:          pi --print "<prompt>" --model openrouter/<slug>
OpenCode:    opencode run "<prompt>" --model openrouter/<slug> --auto
```

### Token measurement
- **Claude Code** — OTLP telemetry to a local receiver
  (`claude-otlp-receiver.js`), writing `claude-usage-log.csv`. Verified
  exact match against OpenRouter dashboard exports.
- **Pi** — custom logging extension writing `pi-usage-log.csv`. Verified
  exact (39 dashboard rows manually summed = CSV total, to the token).
- **OpenCode** — no working per-session command exists (`opencode stats`
  aggregates by day; `--project` doesn't isolate). All OpenCode numbers came
  from full OpenRouter activity CSV exports, filtered by `app_name` and
  matched to sessions by timestamp window.

### Grading
Copy the harness's changed source file(s) into `grading/`, run the
`FAIL_TO_PASS` test, reset. On sympy and xarray the full relevant test
*file* was run (not just the target test), giving incidental regression
coverage on those two.

### Automation
`~/open-weight-agent-bench/scripts/run-matrix.sh` — handles clone,
checkout, boundary fix, venv, harness invocation, timing, and token pull for
Claude Code and Pi. Grading and OpenCode tokens remain manual.

---

## 4. Per-instance findings

**django-10914** (`FILE_UPLOAD_PERMISSIONS` defaulted to `None`, causing
inconsistent upload permissions): every combination found the exact correct
one-line fix (`= 0o644`). Clean baseline proving the pipeline works when the
bug is unambiguous.

**flask-4045** (blueprint names containing dots not rejected): **all six
combinations produced the same incomplete fix** — patched
`Blueprint.__init__` but missed the matching change in `add_url_rule` that
the real upstream patch (PR #4045) also made. Uniform across 3 harnesses and
2 models, so the likely cause is the bug report's phrasing under-specifying
the second location, not any harness/model weakness. A finding about prompt
clarity, not harness comparison.

**marshmallow-1343** (nested schema with `@validates` crashes with
`TypeError` instead of raising `ValidationError`): all 6 PASS. 5 combos
guarded in `schema.py`'s `_invoke_field_validators`; **Claude Code + Sonnet
patched `marshalling.py`'s `deserialize()` instead** — structurally
different, still correct. Pi + Sonnet was the cheapest run in the entire
project (59s, 89,190 tokens) vs Claude Code + Sonnet's 276s / 2,074,511 on
the same task.

**sympy-12481** (`Permutation` constructor rejecting valid non-disjoint
cycles): all 6 PASS but with real quality variance. 3 matched the gold patch
closely. 2 (Claude Code + Sonnet, OpenCode + Sonnet) added a stricter
condition not in the original — divergent but untested by any existing test.
**1 (Pi + GLM) hand-rolled an early return bypassing most of the
constructor's normal logic** — architecturally the riskiest of the six
despite passing everything. Demonstrates that PASS ≠ safe.

**xarray-4094** (`to_unstacked_dataset` broken for single-dim variables):
all 6 PASS, with a clean **model-line split** — all 3 Sonnet runs
independently converged on the exact upstream gold patch
(`self.sel({variable_dim: k}, drop=True)`), all 3 GLM runs converged on a
different valid approach (`.drop_vars(dim, errors="ignore")`). Evidence that
model choice affects *how* a bug gets fixed, not just cost. New pattern
shape — earlier instances split by harness, not model.

---

## 5. Leakage audit (post-hoc, all 30 runs)

**Critical methodological note:** the `tasks/*/clean-*.log` files are only
full transcripts for **OpenCode**. Claude Code and Pi `.log` files are
200–2000 bytes — just the final summary message, useless for auditing. Real
transcripts live at:
- Claude Code: `~/.claude/projects/C--Users-aravi-open-weight-agent-bench-tasks-<instance>-<lane>/*.jsonl`
- Pi: `~/.pi/agent/sessions/--C--Users-aravi-open-weight-agent-bench-tasks-<instance>-<lane>--/*.jsonl`
- OpenCode: the `.log` file itself

**Findings:**
1. **No lane ever opened a sibling lane's files** — zero, across all 30 runs
   and all 3 harnesses.
2. **One session did read `grading/`** — flask-4045 / Claude Code / Sonnet,
   2026-07-30, made 11 tool calls into the grading copy: read the gold test
   twice, diffed its own source and tests against grading's, grepped
   grading's source for `ValueError`. **That attempt was superseded** — the
   recorded 160s row comes from a clean 2026-08-04 rerun with zero grading
   calls. The published data is unaffected.
3. **xarray-3364** (abandoned, not in the 30) repeatedly tried to fetch the
   real upstream fix — `gh api .../pulls/3364`, `curl .../pull/3364.diff`,
   `git clone` of the real repo, WebSearch, WebFetch, plus a search of the
   local HuggingFace cache for the SWE-bench dataset. **Every network
   attempt was blocked by permission prompts.** Proof the vector is real and
   actively attempted.
4. One non-matrix pilot (django-10914 / clean-claude) **successfully**
   WebFetched Django's 3.0 release notes containing the literal answer —
   proof the vector works when WebFetch is permitted.

**Byte-identical fixes exist** (xarray `dataarray.py` identical across all 3
Sonnet lanes; django `global_settings.py` identical across all 6), but they
cluster **by model, not by run order** — and copying would cluster by time.
Combined with finding (1), there was no mechanism for copying. These are
one-line minimal edits where identity is the expected outcome.

**Structural gap (identified, not yet fixed):** `run-matrix.sh` places every
lane *and* `grading/` as siblings under the same instance directory with no
sandboxing. The answer key is always one `../` away. **Fix: move `grading/`
outside `tasks/<instance>/`.**

---

## 6. Infrastructure issues found and fixed

All fixes are in `scripts/run-matrix.sh` unless noted.

1. **`.git` upward-search leak** — see §3. Fixed with empty `.git` boundary
   file.
2. **Script captured harness stdout into the timing variable** — corrupted
   the CSV with megabytes of text. Fixed by redirecting each harness's
   output to `<combo-folder>.log`.
3. **`gbrain` plugin silently overrode model selection** — a third-party
   plugin in `~/.claude/settings.json` intercepted model choice regardless
   of `ANTHROPIC_MODEL` *or* `--model`. Self-reported model was wrong;
   OTLP-logged model was right. Fixed with `claude --settings <empty.json>`.
   **This caused several genuine Sonnet runs to be mislabeled as Haiku
   before it was found.**
4. **`--permission-mode acceptEdits` doesn't cover Bash execution** — only
   auto-approves file edits, so headless runs needing to run tests hung
   waiting for approval that never came. Fixed with
   `--dangerously-skip-permissions`.
5. **OTLP flush timing** — default ~60s export interval meant short sessions
   exited before flushing, silently losing token data. Fixed with
   `OTEL_METRIC_EXPORT_INTERVAL=5000`.
6. **OTLP receiver labeled sessions by first-seen model, not dominant
   model** — a few hundred tokens of an auxiliary Haiku call arriving first
   caused entire multi-million-token Sonnet sessions to be labeled "haiku."
   Token totals were always correct; only the label was wrong. Fixed in
   `claude-otlp-receiver.js` to label by dominant model.
7. **`GBRAIN_MODEL` unset on only one branch** — fix (3) was initially
   applied only to the subscription branch of `run_claude()`, not the
   OpenRouter branch. Fixed to unset unconditionally.
8. **OTLP receiver restart race** — the first combo after a receiver restart
   can read the CSV before the first flush lands, recording `0` tokens even
   though real data appears seconds later in `claude-usage-log.csv`.
   Happened on 2 of 5 instances; always cross-check any `0` row.
9. **`setuptools_scm` repos fail in `clean-*` folders** — xarray uses
   `use_scm_version=True`, which needs real git tags; the boundary file
   isn't a real repo, so version detection fails. `grading/` never hits this
   (keeps real `.git`). Fix: `SETUPTOOLS_SCM_PRETEND_VERSION=<version>`
   prefix on the install.
10. **numpy 2.0 incompatibility** — xarray (2020-era) uses `np.unicode_`,
    removed in numpy 2.0. Fix: pin `numpy<1.24 pandas<1.4`.
11. **Old codebases need old Python** — marshmallow (2019) failed on 3.11
    and 3.14 (`distutils` removed in 3.12+, `collections.Mapping` in 3.10+).
    Python 3.9 became the project default.
12. **Unexplained harness stall** — occurred twice, both on xarray. OpenCode
    froze after printing only its startup banner. **Diagnosis method:** log
    silence alone is *not* proof of a hang (both Claude Code and OpenCode
    buffer output for minutes during legitimate work). Check CPU across ≥2
    samples seconds apart via
    `wmic path Win32_PerfFormattedData_PerfProc_Process where "IDProcess=<pid>" get PercentProcessorTime`
    — near-0%-but-nonzero means network-idle (normal); sustained 0% with
    flat memory for minutes means a real hang. Recovery: kill, verify no
    source files were touched, rerun that single combo. Root cause unknown.

---

## 7. Known limitations (must appear in any published report)

1. **n=1 per cell.** Every instance/harness/model combination was run
   exactly once. Run-to-run variance is unmeasured. The original plan called
   for 2–3 repeats per cell; this was never done.
2. **SWE-bench contamination risk.** Databricks explicitly avoided SWE-bench
   because "the tasks are public, so the solutions leak into training data
   over time," building tasks from their own private PRs instead. This
   project used SWE-bench anyway. Affects correctness claims more than the
   cost comparison (all harnesses faced the same possibly-memorized task),
   but it is the exact critique the source article makes of this approach.
3. **`PASS_TO_PASS` not comprehensively checked.** Only the target
   `FAIL_TO_PASS` test was run on 3 of 5 instances; the full test file was
   run on sympy and xarray only.
4. **Per-turn context was not measured.** Databricks instrumented context
   re-fed per turn directly. This project measured session totals and
   inferred the mechanism from throughput. A rough per-turn calculation on
   django only (Claude Code ~42,000 tok/turn vs Pi ~8,000) supports it, but
   this is corroborating evidence, not independent confirmation.
5. **`grading/` was inside the task tree for all 30 runs.** Audit confirmed
   none of the 30 recorded runs accessed it, but it was reachable via `../`
   the whole time. The isolation held by behavior, not by structure.
6. **OpenCode tokens are manually derived.** No automated per-session method
   exists. An early partial/scrolled dashboard reading understated one value
   by >7× (~96K vs the real ~734K) before full CSV exports were adopted.
7. **Pure-Python instances only.** Heavy/compiled codebases were excluded
   for setup reliability; results may not generalize to them.
8. **The official SWE-bench Docker harness was never used.** This is a
   manual approximation of it.

---

## 8. Alignment with the Databricks article

**Replicated:**
- *"Harness choice dramatically impacts cost... Pi performed best"* —
  confirmed, 10/10 cells, more extreme (2.6×–62.3× vs their >2×).
- *"Cost differed significantly while quality remained the same"* —
  confirmed; 4 of 5 instances passed on all 6 combinations despite the
  spread.
- *"Model choice is only one piece of the puzzle"* — extended: the same
  model switch moved cost in **opposite directions** depending on harness
  (OpenCode +37% to +409%; Pi −10% to −82%), showing the two factors
  interact rather than acting independently. Databricks did not report this.

**Not comparable:** their capability-tier and price-per-token findings
involved many models on a quality axis this project didn't build (2 models,
binary pass/fail).

**Methodological divergence:** see limitation (2) above.

---

## 9. Project file map

```
~/open-weight-agent-bench/
├── comparison-results.csv          ← canonical results (30 rows)
├── claude-usage-log.csv            ← Claude Code tokens (OTLP receiver output)
├── claude-otlp-raw.jsonl           ← raw OTLP payloads (replayable)
├── claude-otlp-receiver.js         ← OTLP receiver (dominant-model labeling)
├── replay-otlp-log.js              ← rebuilds CSV from raw jsonl
├── pi-usage-log.csv                ← Pi tokens (extension output)
├── eval-env.sh                     ← OpenRouter routing env vars
├── prompt-<instance>.txt           ← verbatim problem_statement per instance
├── scripts/run-matrix.sh           ← the automation script
├── tasks/<instance>/
│   ├── clean-<harness>-<model>/    ← harness working copies
│   ├── clean-<harness>-<model>.log ← harness output (full only for OpenCode)
│   └── grading/                    ← private verification copy
└── results/, setup/, testing/      ← writeups and reference docs
```

Full Claude Code transcripts: `~/.claude/projects/C--Users-aravi-open-weight-agent-bench-tasks-<instance>-<lane>/*.jsonl`
Full Pi transcripts: `~/.pi/agent/sessions/--C--Users-aravi-...--/*.jsonl`

---

## 10. Next steps toward a publishable report

1. **Close the `grading/` isolation gap** — move it outside
   `tasks/<instance>/` before any further runs.
2. **Add repeat trials** — at minimum 2–3 runs per cell on a subset, to
   quantify variance. This is the single biggest weakness for publication.
3. **Instrument per-turn context** — would convert limitation (4) into an
   independent confirmation of the Databricks mechanism, which is the most
   citable part of the whole project.
4. **Finish astroid-1268** (GLM done, Sonnet not run) for a 6th instance.
5. **Expand instance count** toward the original 10-instance target
   (requests, pylint, pytest, sphinx remain untouched).
6. **Check `PASS_TO_PASS` systematically** across all instances.
7. **Produce charts** — tokens by harness faceted by model across instances;
   the GLM→Sonnet directional split is the most visually striking finding.
