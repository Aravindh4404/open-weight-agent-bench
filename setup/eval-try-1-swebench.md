# Eval Try 1 — SWE-bench (marshmallow-1343)

What SWE-bench's columns mean, exactly what we did for the first instance
(`marshmallow-code__marshmallow-1343`), what happened, and the full
start-to-finish command list to repeat this for a new instance.

Result of try 1: **PASS** — GLM-5.2 (via OpenRouter, routed through Claude
Code) fixed the bug blind, and the target regression test plus the full
`test_marshalling.py` suite (25/25) pass in the grading copy.

---

## 1. SWE-bench dataset — what each column means

Source: `princeton-nlp/SWE-bench_Lite` on Hugging Face (`test` split, 300
rows; `dev` split, 23 rows — dev is for calibrating the pipeline only, not
for reporting results). This is the standard SWE-bench schema; re-check the
dataset viewer if a column looks different, since Lite is a subset of full
SWE-bench and column names have been stable but it's worth confirming.

| Column | What it is | Used for |
|---|---|---|
| `instance_id` | Unique ID, format `<repo_owner>__<repo_name>-<PR_number>` (e.g. `marshmallow-code__marshmallow-1343`) | Becomes the task folder name / `task_id` in our logs |
| `repo` | `owner/repo` on GitHub (e.g. `marshmallow-code/marshmallow`) | What to `git clone` |
| `base_commit` | Commit hash to check out before doing anything else | `git checkout <base_commit>` in both `clean/` and `grading/` |
| `problem_statement` | The GitHub issue text describing the bug | Rewritten (spoilers stripped) and given to the harness as the prompt |
| `hints_text` | Extra comments/discussion from the issue thread | **Not given to the harness** — often contains hints toward the fix location; withhold it to keep the eval honest |
| `patch` | The **ground-truth fix** (gold diff) | **Never shown to the harness.** Reference only, for our own sanity-checking after the fact |
| `test_patch` | Diff that adds/modifies the test file(s) proving the fix | Applied to `grading/` only, never `clean/` — this is what "reveals the answer" if the harness could see it |
| `FAIL_TO_PASS` | JSON list of test node IDs that fail before the fix and must pass after | The primary pass/fail signal — these are the tests we actually run at grading time |
| `PASS_TO_PASS` | JSON list of test node IDs that already pass and must *keep* passing | Regression check — catches a harness "fixing" the bug by breaking something else |
| `environment_setup_commit` | Commit to use for installing dependencies, if different from `base_commit` | Occasionally needed for older repos where install metadata changed later; check this if `pip install -e` fails on `base_commit` itself |
| `version` | Repo version tag associated with the instance | Sometimes needed to pick the right Python interpreter / dependency pins (see Python-version gotcha below) |
| `created_at` | Timestamp the instance was cut from the real PR | Metadata only, not used in our pipeline |

**Never confuse `patch` and `test_patch`** — the dataset viewer's table
preview truncates both and they're easy to mix up. Always expand the row
fully before copying.

---

## 2. What we actually did for `marshmallow-code__marshmallow-1343`

- **Repo:** `marshmallow-code/marshmallow`
- **Base commit:** `2be2d83a1a9a6d3d9b85804f3ab545cecc409bb0`
- **Harness model:** `z-ai/glm-5.2` via OpenRouter, routed through Claude
  Code using `eval-env.sh`

Step by step, what happened:

1. **Picked the instance** — pure-Python, no compiled/scientific deps, good
   first test of the pipeline.
2. **Cloned two copies** — `tasks/marshmallow-1343/clean/` (what the
   harness works in, `.git` stripped so it can't read history) and
   `tasks/marshmallow-1343/grading/` (kept `.git`, gets the test patch,
   never touched by the harness).
3. **Hit a Python-version wall** — Python 3.11 and 3.14 both failed to
   install this 2019-era codebase (`distutils` removed in 3.12+,
   `collections.Mapping` removed in 3.10+). Installed Python 3.9 via
   `winget install Python.Python.3.9` and built both venvs against that.
4. **Applied `test_patch` to `grading/` manually** — `git apply` failed on
   the pasted diff (context mismatch), so the import-line fix and the new
   test function were added by hand (`sed` + heredoc). Also needed
   `pip install simplejson` — a test-only dependency not pulled in by the
   base install.
5. **Confirmed pre-fix failure** — ran the target test in `grading/` before
   any fix existed. It failed with `TypeError: 'NoneType' object is not
   subscriptable` at `schema.py:894`, matching the original bug report
   exactly. This confirms the environment and test wiring were correct
   *before* trusting any result from the harness.
6. **Built the `clean/` venv** the same way (Python 3.9, `pip install -e
   ".[tests]"`, `pip install simplejson`).
7. **Ran the harness** — `source eval-env.sh` then `claude` inside
   `clean/`, given a rewritten version of the problem statement (bug
   description + repro steps + expected behavior, with implementation
   hints stripped). Real session, confirmed in `pi-usage-log.csv`: session
   `019f8615-0369-76de-8d3b-820e5ee95557`, ~12.8k tokens, 6 turns, run
   2026-07-21 ~19:09–19:11 local time.
8. **GLM-5.2 found and fixed the bug** — added a two-line null guard to
   `_invoke_field_validators` in `schema.py`:
   ```python
   def _invoke_field_validators(self, unmarshal, data, many):
       if data is None:
           return
   ```
9. **Fix copied from `clean/` into `grading/`** (source file only, no test
   files touched).
10. **Graded** — reran the target test and the full `test_marshalling.py`
    suite in `grading/`.

---

## 3. Result

```
tests/test_marshalling.py::TestUnmarshaller::test_deserialize_wrong_nested_type_with_validates_method PASSED
======================== 25 passed, 1 warning in 0.08s ========================
```

**Verdict: PASS.** `FAIL_TO_PASS` test now passes; nothing else in the
same test file regressed (closest proxy we had for `PASS_TO_PASS` on this
instance — full `PASS_TO_PASS` list from the dataset row was not
separately scripted this round, see open item below).

`git diff` inside `grading/` is the durable proof — it shows exactly the
2-line `schema.py` change plus the `test_patch` application, against the
original `base_commit`.

---

## 4. Full start-to-finish runbook (repeat for a new instance)

Use **Git Bash (MINGW64)**, not PowerShell — `source`, `rm -rf`, and
heredocs either fail outright or behave inconsistently in PowerShell.

### Step 0 — pick an instance
Browse `princeton-nlp/SWE-bench_Lite`, `test` split. Prefer pure-Python, no
heavy/compiled deps (numpy/scipy/VTK etc.) until the pipeline is proven on
more instances. Pull these 4 values from the row (expand it fully first):
`instance_id`, `base_commit`, `problem_statement`, `test_patch`. Note
`FAIL_TO_PASS` and `PASS_TO_PASS` too — you'll need them at grading time.

### Step 1 — clone clean + grading copies
```bash
cd ~/open-weight-agent-bench
mkdir -p tasks/<instance_id>
cd tasks/<instance_id>

git clone <repo_url> clean
cd clean && git checkout <base_commit> && rm -rf .git && cd ..

git clone <repo_url> grading
cd grading && git checkout <base_commit>
```
Verify:
```bash
ls -la clean/.git    # should say "No such file or directory"
ls -la grading/.git  # should exist
```

### Step 2 — build the grading venv
```bash
cd ~/open-weight-agent-bench/tasks/<instance_id>/grading
py -0                          # list installed interpreters
# if you need an older one:
winget install Python.Python.3.9   # open a NEW Git Bash window after
py -3.9 -m venv venv
source venv/Scripts/activate
pip install -e ".[tests]"
```
Common breakage in older repos: `distutils` (removed Python 3.12+),
`collections.Mapping` vs `collections.abc.Mapping` (removed Python 3.10+).
Install any missing test-only deps as pytest surfaces `ModuleNotFoundError`
(e.g. `simplejson` was needed for marshmallow, not in the base install).

### Step 3 — apply `test_patch` to `grading/`, confirm pre-fix failure
Try the real diff first:
```bash
git apply /path/to/test_patch.diff
```
If it fails on context mismatch (common with pasted diffs), apply by hand
instead — edit the changed import line with `sed`, append new test
functions with a heredoc:
```bash
sed -i 's/<old import line>$/<new import line>/' <test_file>
cat >> <test_file> << 'EOF'
<new test function from test_patch>
EOF
tail -25 <test_file>     # verify the paste actually landed correctly
```
Run the target test(s) from `FAIL_TO_PASS` — **it must FAIL**, and the
failure must match the bug report (not an import/environment error):
```bash
python -m pytest <path>::<TestClass>::<test_name> -v
```
If you get an environment error instead of the real bug, fix the
environment before moving on — don't trust anything downstream of a broken
pre-fix check.

### Step 4 — build the clean venv (mirror of step 2, no test changes)
```bash
cd ~/open-weight-agent-bench/tasks/<instance_id>/clean
py -3.9 -m venv venv
source venv/Scripts/activate
pip install -e ".[tests]"
pip install <any-test-only-deps-found-in-step-3>
```
`clean/` never gets `test_patch` applied — the harness must not see the
test that reveals expected behavior.

### Step 5 — run the harness
```bash
cd ~/open-weight-agent-bench/tasks/<instance_id>/clean
source venv/Scripts/activate
source ~/open-weight-agent-bench/eval-env.sh
claude
```
Paste a **rewritten** `problem_statement` as the first message — same bug
description, repro steps, and expected behavior, but with anything that
gives away the fix stripped out (exact exception types to catch, which
file/function to edit, hints from `hints_text`). Let it work until it
signals done, then exit.

(To also capture token/cost for this run, see
`token-commands.md` — start the OTLP receiver / `pi` extension logging
*before* this step, per harness.)

### Step 6 — copy the fix into grading, and re-grade
Diff or copy the **source** files only (never test files) from `clean/`
into `grading/`:
```bash
cd ~/open-weight-agent-bench/tasks/<instance_id>/grading
source venv/Scripts/activate
python -m pytest <FAIL_TO_PASS tests> -v
python -m pytest <PASS_TO_PASS tests> -v   # regression check
```
**Pass = every `FAIL_TO_PASS` test now passes AND every `PASS_TO_PASS`
test still passes.** Not yet scripted as one command — worth writing a
small grading script once running more than a couple of instances, so
`FAIL_TO_PASS`/`PASS_TO_PASS` lists get read straight from the dataset row
instead of copied by hand.

### PowerShell note
If you're in PowerShell instead of Git Bash, `source venv/Scripts/activate`
doesn't exist — call the venv's Python directly instead, with a path
relative to wherever your shell actually is:
```powershell
.\venv\Scripts\python.exe -m pytest tests\<path> -v
```
`eval-env.sh` and the `claude` harness step still require Git Bash — there
is no PowerShell equivalent for that step.

---

## 5. Open items / lessons for next instance

- `FAIL_TO_PASS` / `PASS_TO_PASS` grading isn't scripted yet — this round
  it was done by running the one obviously-relevant test file in full and
  eyeballing the pass count. Fine for one instance, won't scale.
- No `task.json` or per-instance metadata file was saved (just
  `test_patch.diff` sitting in the task folder) — consider saving the full
  dataset row (`instance_id`, `base_commit`, `problem_statement`,
  `FAIL_TO_PASS`, `PASS_TO_PASS`) as a small JSON file per task so grading
  can be automated later without re-fetching from the dataset viewer.
- Always expand the full dataset row before copying anything — the table
  preview truncates and `patch` vs `test_patch` are easy to swap.
- Confirm the pre-fix test failure mode matches the original bug report
  before trusting anything downstream — an import/environment error is not
  a working test harness.
- Use Git Bash, not PowerShell, for everything except one-off `pytest`
  invocations against an already-built venv.
