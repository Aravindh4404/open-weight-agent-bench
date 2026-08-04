# Eval Try 3 — SWE-bench (django-10914), 3-Harness x 2-Model Comparison

Second full 3-harness comparison (after `astroid-1268`), on a much larger,
more complex codebase (Django), run through the automated `run-matrix.sh`
script. Originally GLM-5.2 only; extended in a second pass to also cover
Claude Sonnet 5, giving a full 6-combo (3 harnesses × 2 models) result for
this instance.

**Result: PASS on all six combos.** Every harness, on both models,
independently found and applied the identical one-line fix.

---

## The bug

- `instance_id`: `django__django-10914`
- Repo: `django/django`
- `base_commit`: `e7fd69d051eaa67cb17f172a39b57253e9cb831a`
- `FAIL_TO_PASS`: `test_utils.tests.OverrideSettingsTests.test_override_file_upload_permissions`
- `PASS_TO_PASS`: large list, not separately re-verified this round (see open
  items)

**Real GitHub issue** (used verbatim as the harness prompt): `FILE_UPLOAD_PERMISSIONS`
defaulted to `None`, causing inconsistent file permissions on uploads
depending on whether the file was small (stored in memory, gets system
umask) or large (stored via `tempfile.NamedTemporaryFile` + `os.rename`,
which forces `0o600` on many systems for security reasons). Fix: change the
default to `0o644` so permissions are consistent regardless of upload size.

---

## Setup

Automated via `run-matrix.sh`. Per harness: fresh clone → checkout
`base_commit` → strip `.git` → add `.git` boundary-file fix → build Python
3.9 venv → launch the harness non-interactively with the real
`problem_statement` → measure wall-clock time.

**Non-interactive flags used:**
- Claude Code: `claude --permission-mode acceptEdits -p "<prompt>"`
- Pi: `pi --print "<prompt>" --model openrouter/<model>`
- OpenCode: `opencode run "<prompt>" --model openrouter/<model> --auto`

**GLM-5.2 pass:** all three routed through OpenRouter.
**Sonnet pass:** Claude Code used its own Pro subscription directly (no
OpenRouter routing — `ANTHROPIC_BASE_URL`/`ANTHROPIC_AUTH_TOKEN` unset); Pi
and OpenCode both routed through OpenRouter to `anthropic/claude-sonnet-5`.

**Setup snags hit:**
- GLM pass: OpenRouter API key hit its configured credit limit ($5.02/$5,
  100%) partway through the first attempt, causing Claude Code to fail with
  a 403. Limit was raised and the full run redone cleanly. Earlier
  partial/failed attempt's data was discarded, not counted.
- A separate attempt to run this pipeline on a different instance
  (`xarray-3364`) got genuinely stuck mid-run with no error and no log
  output — killed via `taskkill`, root cause not confirmed (suspected
  workspace-trust-dialog stall specific to a brand-new folder), not
  resolved, that instance was abandoned in favor of continuing the Sonnet
  pass on this already-validated instance instead.
- The script itself had a real bug during the GLM run: `elapsed=$(run_claude
  ...)` captured the harness's **entire printed output**, not just the
  timing number, corrupting the results CSV with megabytes of harness
  commentary text mixed into what should have been a clean numeric field.
  Fixed by redirecting each harness's stdout/stderr to its own log file
  (`<combo-folder>.log`) instead of letting it flow back through the
  function's return value. This fix was in place for the Sonnet pass.

---

## Result — full 6-combo table

| Harness | Model | Result | Elapsed | Tokens |
|---|---|---|---|---|
| Claude Code | GLM-5.2 | **PASS** | 542s | 2,564,841 |
| Pi | GLM-5.2 | **PASS** | 163s | 313,086 |
| OpenCode | GLM-5.2 | **PASS** | 132s | 734,392 |
| Claude Code | Sonnet 5 | **PASS** | 192s | 2,236,775* |
| Pi | Sonnet 5 | **PASS** | 213s | 282,252 |
| OpenCode | Sonnet 5 | **PASS** | 208s | 1,315,245 |

\* *See "Sonnet token measurement" section below — sourced differently from
the other five, and not independently verified against OpenRouter, since
this session never touched OpenRouter.*

All six produced the exact same one-line fix in
`django/conf/global_settings.py` (`FILE_UPLOAD_PERMISSIONS = None` →
`0o644`) — confirmed via identical `diff` output against `grading/` for
every combo, before and after applying each fix.

### Within GLM: Claude Code is the clear outlier
Claude Code used ~8.2x more tokens than Pi and ~3.5x more than OpenCode on
GLM. Time followed roughly the same shape (Claude Code ~4.1x slower than
both Pi and OpenCode).

### Within Sonnet: gap narrows, but Claude Code still leads
Claude Code used ~7.9x more tokens than Pi (nearly identical ratio to the
GLM pass — 8.2x), and only ~1.7x more than OpenCode (down sharply from
3.5x on GLM). Claude Code's own wall-clock time dropped by ~65% versus its
GLM run (542s → 192s), while Pi and OpenCode's times stayed roughly flat
across both models (163s→213s, 132s→208s).

### A genuine reversal: OpenCode's direction flips between models
This is the most interesting single finding from this instance. Going from
GLM to Sonnet:
- **Claude Code**: tokens went slightly *down* (2.56M → 2.24M)
- **Pi**: tokens went slightly *down* (313K → 282K)
- **OpenCode**: tokens went *up*, sharply (734K → 1.32M, +79%)

Every other harness got marginally cheaper on Sonnet; OpenCode got
substantially more expensive. This means the earlier working hypothesis
("Claude Code is inherently the token-hungry harness, independent of
model") is **too simple** — model choice interacts with harness behavior
differently per harness, not uniformly. Worth digging into *why* on a
future instance (e.g. does OpenCode's tool-calling pattern differ
meaningfully against Sonnet vs GLM?) rather than assuming a single
"harness efficiency ranking" holds across models.

### Grading detail
Each harness's `django/conf/global_settings.py` was copied into `grading/`
one at a time, tested, then reset via `git checkout -- <file>` before the
next combo (works because `grading/` — unlike the `clean-*` folders — kept
its real `.git`; only the boundary-file fix was applied to `clean-*`).

```
FAIL_TO_PASS test run per combo:
python tests/runtests.py test_utils.tests.OverrideSettingsTests.test_override_file_upload_permissions -v 2
```
All six: `OK`.

**Interesting extra data point (GLM pass):** OpenCode independently
discovered that `python -m django test ...` fails with `RuntimeError: Model
class ... doesn't declare an explicit app_label` on this checkout, and that
Django's own `tests/runtests.py` is the correct invocation — matches what
was later used for grading, an unprompted confirmation the harness found
the right tool on its own.

**Claude Code limitation observed (GLM pass):** it explicitly reported it
could not run the test suite itself — *"every command invocation in this
environment is gated behind an approval prompt that isn't reachable
here"* — meaning its fix was reasoned through logically but never
self-verified via tests, unlike Pi and OpenCode. Not re-checked whether this
also happened on the Sonnet pass.

---

## Sonnet token measurement — a different method, worth flagging clearly

**Pi and OpenCode's Sonnet numbers are measured identically to the GLM
pass** (OTLP/OpenRouter export respectively), since both still routed
through OpenRouter even when targeting Sonnet.

**Claude Code's Sonnet number required a different method entirely**,
because using the Pro subscription (rather than an API key/OpenRouter)
appears to not emit OTLP telemetry at all — `claude-usage-log.csv` recorded
`0` tokens for this session despite it clearly doing real work (192s
runtime, correct fix produced).

**Fallback used: Claude Code's local session transcript.** Every session,
regardless of auth method, is logged locally to
`~/.claude/projects/<encoded-working-dir>/<session-id>.jsonl` — this is
Claude Code's own transcript mechanism, independent of whether OTLP export
succeeds. Each line contains a `"usage"` field with real per-message token
counts.

**Known quirk handled:** the same message appears 2-3 times in a row in the
raw file (a documented pattern from Phase 2 — Claude Code's logs write
multiple lines per real API request). Deduplicated by `message.id` before
summing, per the project's existing established method for this exact
issue. Result: 38 unique messages, summed fresh input + output + cache_read
+ cache_creation = **2,236,775 tokens**.

**Honest confidence caveat:** every other token number in this project
(Claude Code via OpenRouter, Pi, OpenCode, on both models) has been checked
against OpenRouter's own billing dashboard — independent, external, ground
truth. This one number has no such external check, because the session
never touched OpenRouter at all. The dedup method is sound and consistent
with prior verified findings, but this specific figure is **self-reported
by Claude Code, not independently confirmed** — a meaningfully weaker
confidence level than the other five numbers in this table. A stronger
check (not yet done) would be resuming the session and running Claude's own
`/cost` command, which is Anthropic's internal accounting, separate from
the transcript file.

---

## Open items

1. **`PASS_TO_PASS` regression list still not re-verified** — same gap
   across every instance so far; only the target `FAIL_TO_PASS` test was
   run per combo, on both models.
2. **Claude Code's inability to self-test** (observed on the GLM pass) —
   not re-checked on Sonnet; worth confirming whether this is a
   `--permission-mode acceptEdits` limitation specifically.
3. **Claude Code's Sonnet token count is unverified against any external
   source** — see above. Worth attempting `/cost` verification via session
   resume if a stronger number is needed for reporting.
4. **The `xarray-3364` stuck-process incident is unresolved** — root cause
   not confirmed, instance abandoned rather than debugged. Worth revisiting
   before running it (or any brand-new instance) again, since the same
   stall could recur.
5. **OpenCode's GLM→Sonnet token reversal is unexplained** — flagged as
   the most interesting finding this round, but no hypothesis has been
   tested yet for *why* it happens. Worth a closer look (e.g. comparing
   the two sessions' transcripts directly) before treating it as a stable
   pattern rather than a one-off.

## Files/state after this run
```
tasks/django-10914/
├── grading/                      (reset to base_commit, clean)
├── clean-claude-glm/             (Claude Code's GLM fix + its own doc/test edits)
├── clean-pi-glm/                 (Pi's GLM fix)
├── clean-opencode-glm/           (OpenCode's GLM fix + its own doc/test edits)
├── clean-claude-sonnet/          (Claude Code's Sonnet fix)
├── clean-pi-sonnet/              (Pi's Sonnet fix)
└── clean-opencode-sonnet/        (OpenCode's Sonnet fix)

comparison-results.csv            (6 rows for this instance, all verified,
                                    no placeholder/MANUAL/PENDING values
                                    remaining)
```
