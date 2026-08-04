# Eval Try 2 — SWE-bench (astroid-1268)

What we did for the second instance (`pylint-dev__astroid-1268`), step by
step, and the result. Companion to `eval-try-1-swebench.md` (marshmallow-1343)
— see that file for the full SWE-bench column reference and general runbook.
This file just documents this specific run.

**Result of try 2: PASS** — Claude Code (Sonnet 5, high effort, Claude Pro —
not GLM-5.2 this round) fixed the bug, and the target regression test passes
in the grading copy.

---

## The bug

Repo: `pylint-dev/astroid` (a Python static-analysis library used by pylint)

Calling `.as_string()` on an internal `Unknown` node crashed with:
```
AttributeError: 'AsStringVisitor' object has no attribute 'visit_unknown'
```
instead of returning a text representation. Real GitHub issue, closed by a
proper fix — clean instance, no ambiguity between `problem_statement` and
`patch` (unlike the earlier `sqlfluff-1625` instance, which was abandoned for
exactly that reason — the real issue there had been closed as "not a bug" but
`patch` showed an unrelated change, so it wasn't used).

- `instance_id`: `pylint-dev__astroid-1268`
- `base_commit`: `ce5cbce5ba11cdc2f8139ade66feea1e181a7944`
- `FAIL_TO_PASS`: `tests/unittest_nodes.py::AsStringTest::test_as_string_unknown`
- `PASS_TO_PASS`: large list (not exhaustively run this round — see open
  items)

---

## Step by step, what we did

1. **Picked the instance.** Pulled the full row from the SWE-bench dataset
   (`dev` split) — this one was fully visible/untruncated when pasted, no
   need to fight the dataset viewer's table truncation like earlier
   instances required.

2. **Recorded the key facts from the row:**
   - `base_commit` — the commit right before the real fix landed
   - `problem_statement` — the real GitHub issue text, used **verbatim** as
     the harness prompt (lesson from the sqlfluff-1625 mistake: don't
     paraphrase the bug report — use the dataset's actual text as-is, for
     consistency across instances and to avoid introducing errors)
   - `test_patch` — the diff that adds the proof-test, applied to `grading/`
     only
   - `patch` — the real fix, kept hidden, reference only

3. **Cloned two separate copies of the repo:**
   ```bash
   cd ~/open-weight-agent-bench
   mkdir -p tasks/astroid-1268
   cd tasks/astroid-1268

   git clone https://github.com/pylint-dev/astroid.git clean
   cd clean && git checkout ce5cbce5ba11cdc2f8139ade66feea1e181a7944 && rm -rf .git && cd ..

   git clone https://github.com/pylint-dev/astroid.git grading
   cd grading && git checkout ce5cbce5ba11cdc2f8139ade66feea1e181a7944
   ```
   - `clean/` — what the harness works in. `.git` removed so it can't read
     project history to find the real fix.
   - `grading/` — kept its `.git`, gets the test patch, never touched by the
     harness. Used only afterward, to check the harness's work.

4. **Set up a Python 3.9 environment in `grading/`.** (3.9 chosen from the
   start this time, based on the Python-version wall hit in try 1 —
   marshmallow needed 3.9 specifically; astroid turned out to install fine on
   3.9 too, no compatibility issues this round.)
   ```bash
   cd ~/open-weight-agent-bench/tasks/astroid-1268/grading
   py -3.9 -m venv venv
   source venv/Scripts/activate
   pip install -e ".[tests]"
   ```
   `[tests]` extra didn't exist for this package version (warned, not
   fatal) — and unlike sqlfluff, `pytest` wasn't pulled in as a base
   dependency here, so it had to be installed explicitly:
   ```bash
   pip install pytest pytest-timeout
   ```

5. **Applied `test_patch` to `grading/` manually.** Diff context didn't
   match the actual file (same class of issue as marshmallow-1343 — pasted
   diffs frequently fail `git apply` due to whitespace/context drift), so
   instead:
   - Confirmed `nodes` was already imported in `tests/unittest_nodes.py`
     (checked the import block directly — no import line needed adding,
     unlike marshmallow which needed a new import)
   - Located the exact line where the neighboring test (`test_f_strings`)
     ended, using `grep -n` to get precise line numbers
   - Inserted the new test function directly after that line using
     `sed -i '<line>a\...'`
   - Verified the insertion landed correctly with `sed -n '<range>p'`

6. **Confirmed pre-fix failure.**
   ```bash
   python -m pytest tests/unittest_nodes.py::AsStringTest::test_as_string_unknown -v
   ```
   Result: **FAILED** with `AttributeError: 'AsStringVisitor' object has no
   attribute 'visit_unknown'` — exact match to the original bug report.
   Confirms the test and environment were correctly wired *before* trusting
   anything downstream.

7. **Set up `clean/`'s environment the same way** (Python 3.9, same
   install steps, no test changes):
   ```bash
   cd ~/open-weight-agent-bench/tasks/astroid-1268/clean
   py -3.9 -m venv venv
   source venv/Scripts/activate
   pip install -e .
   pip install pytest pytest-timeout
   ```

8. **Ran the harness.**
   ```bash
   cd ~/open-weight-agent-bench/tasks/astroid-1268/clean
   source venv/Scripts/activate
   source ~/open-weight-agent-bench/eval-env.sh
   claude
   ```
   Prompt: the real `problem_statement` pasted **verbatim** (the full
   traceback + version info from the GitHub issue) — no paraphrasing, no
   hints_text included.

   **Note on this run:** the harness banner showed *"Sonnet 5 with high
   effort · Claude Pro"* — meaning this ran on Claude's own subscription
   model, **not** routed through OpenRouter to GLM-5.2 like try 1 was. Worth
   double-checking `eval-env.sh` actually got sourced correctly / the
   `OPENROUTER_API_KEY` was exported in this terminal session before the
   `claude` command ran, if the intent was to test GLM-5.2 again. This
   wasn't caught during the run — flagging as an open item.

9. **The harness fixed the bug.** Added a `visit_unknown` method to
   `AsStringVisitor` in `astroid/nodes/as_string.py`:
   ```python
   def visit_unknown(self, node) -> str:
       """return an Unknown node as string"""
       return str(node)
   ```
   Verified its own fix manually before finishing, then reported it fixed.

10. **Diffed `clean/` vs `grading/` to see exactly what changed:**
    ```bash
    cd ~/open-weight-agent-bench/tasks/astroid-1268
    diff clean/astroid/nodes/as_string.py grading/astroid/nodes/as_string.py
    ```
    Confirmed: exactly 4 lines added, nothing else touched — a minimal,
    isolated fix.

11. **Copied the fix into `grading/` and re-ran the target test:**
    ```bash
    cp clean/astroid/nodes/as_string.py grading/astroid/nodes/as_string.py
    cd grading
    source venv/Scripts/activate
    python -m pytest tests/unittest_nodes.py::AsStringTest::test_as_string_unknown -v
    ```

---

## Result

```
tests/unittest_nodes.py::AsStringTest::test_as_string_unknown PASSED
=================== 1 passed in 0.29s ===================
```

**Verdict: PASS.**

Interesting detail: the test expects `nodes.Unknown().as_string() ==
"Unknown.Unknown()"` exactly. The harness's fix is just `return str(node)` —
it didn't hand-pick that string, it happened to match because `str()` on an
`Unknown` node apparently already produces that default representation. A
different, equally-minimal fix (e.g. `return "Unknown"`, which is what one
maintainer suggested in the real GitHub thread) would **not** have passed
this exact test. Worth keeping in mind for future instances: passing
`FAIL_TO_PASS` confirms the fix satisfies the test's specific expectation,
not necessarily that it's the only reasonable fix a human would accept.

---

## Open items / lessons for next instance

- **Model routing wasn't verified for this run.** The harness banner showed
  "Claude Pro" rather than confirming GLM-5.2/OpenRouter routing — unlike
  try 1, where the session was confirmed against `pi-usage-log.csv` with an
  actual session ID and token count. Before the next run, verify
  `eval-env.sh` was sourced and check the model identity inside the harness
  (e.g. ask it "what model are you?") before trusting which model actually
  did the work. This matters a lot once comparing across harnesses, since
  the whole point is holding the model constant.
- **Full `PASS_TO_PASS` list not run** — same gap as try 1. Only the target
  `FAIL_TO_PASS` test was checked; the larger regression-test list from the
  dataset row wasn't scripted or spot-checked this round.
- **No `task.json` saved** — same gap as try 1, still not automated.
- Confirmed again: pasted `test_patch` diffs routinely fail `git apply` on
  Windows/Git Bash due to context mismatches. Manual insertion via
  `grep -n` (to find exact line numbers) + `sed -i '<line>a\...'` (to
  insert) continues to be the reliable fallback — same pattern as try 1.
- Confirmed again: always get the **full, untruncated** dataset row before
  starting — this instance worked smoothly specifically because nothing was
  cut off when it was pasted, unlike two earlier attempts (sqlfluff-2419,
  marshmallow-1359) that stalled on truncated `problem_statement`/
  `test_patch` fields and were abandoned mid-setup.
- Confirmed again: use the real `problem_statement` verbatim as the harness
  prompt, never a paraphrase — this was a direct fix applied after the
  sqlfluff-1625 mistake, and it worked cleanly here.

---

## Instances tried so far

| Instance | Repo | Result | Model confirmed? |
|---|---|---|---|
| `marshmallow-code__marshmallow-1343` | marshmallow | PASS | Yes — GLM-5.2 via OpenRouter, session logged |
| `sqlfluff__sqlfluff-1625` | sqlfluff | Abandoned | — (real issue was closed as "not a bug," mismatched `patch`) |
| `sqlfluff__sqlfluff-2419` | sqlfluff | Abandoned | — (dataset fields kept coming through truncated) |
| `marshmallow-code__marshmallow-1359` | marshmallow | Abandoned | — (dataset fields kept coming through truncated) |
| `pylint-dev__astroid-1268` | astroid | PASS | **No — needs verification before treating as a GLM-5.2 result** |

## Suggested next step

Before running a third instance, resolve the model-routing gap: re-run (or
retroactively verify) whether `astroid-1268`'s session actually used GLM-5.2,
since that determines whether this result is comparable to try 1's. Once
confirmed, the natural next step per the earlier plan is either:
- a third *new* instance with Claude Code (to build up more single-harness
  data), or
- re-running one of these same two instances (marshmallow-1343 or
  astroid-1268) through **Pi** or **OpenCode** instead — the first real
  harness-to-harness comparison, holding both the task and the model
  constant.
