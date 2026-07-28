# SWE-bench Instance Setup & Grading Workflow

Reference steps for running a single SWE-bench task (harness comparison,
`open-weight-agent-bench` project). Worked example: `marshmallow-code__marshmallow-1343`.
Repeat this pattern for each new instance.

**Environment note:** use Git Bash (MINGW64), not PowerShell — the project's
existing scripts (`eval-env.sh`, hooks) are bash, and `rm -rf` / heredocs
behave inconsistently or fail outright in PowerShell.

---

## 1. Pick an instance

Use `princeton-nlp/SWE-bench_Lite`, `test` split (300 rows) for real runs —
`dev` split (23 rows) is for calibrating your pipeline only, not for reporting
results.

Prefer pure-Python instances with no compiled/scientific deps for early runs —
easier install, fewer environment surprises. Avoid instances with heavy deps
(numpy/scipy/VTK, etc.) until the pipeline is proven.

From each row you need four things:
- `instance_id` — becomes your task folder name / `task_id`
- `base_commit` — commit to check out
- `problem_statement` — the GitHub issue text (goes into `task.json`, and
  becomes the harness prompt in rewritten form — see step 6)
- `test_patch` — diff adding/modifying the test file (grading only)
- `FAIL_TO_PASS` — test(s) that must flip to passing
- `patch` — **never given to the harness.** Ground-truth fix, for reference/
  grading only.

Double-check you're reading `test_patch`, not `patch` — they're easy to
confuse in the dataset viewer's truncated table view. Expand the row fully.

---

## 2. Create the task folder structure

Two separate clones per instance — this prevents the harness from reading
the answer via `git log` or from seeing the test file that reveals the
expected behavior.

```bash
cd ~/open-weight-agent-bench
mkdir -p tasks/<instance_id>
cd tasks/<instance_id>

# clean copy — what the harness works in
git clone <repo_url> clean
cd clean && git checkout <base_commit> && rm -rf .git && cd ..

# grading copy — separate, gets test_patch applied, never touched by harness
git clone <repo_url> grading
cd grading && git checkout <base_commit>
```

Verify after cloning:
```bash
ls -la clean/.git    # should NOT exist ("No such file or directory")
ls -la grading/.git  # SHOULD exist
```

---

## 3. Set up the grading environment

**Check Python version compatibility first.** Older library snapshots (this
one was 2019-era) commonly break on modern Python:
- `distutils` removed in Python 3.12+
- `collections.Mapping` (vs `collections.abc.Mapping`) removed in Python 3.10+

Check available interpreters:
```bash
py -0
```

If nothing old enough is installed:
```bash
winget install Python.Python.3.9
```
(open a new Git Bash window afterward so PATH refreshes)

Build the venv against the compatible version:
```bash
cd ~/open-weight-agent-bench/tasks/<instance_id>/grading
py -3.9 -m venv venv
source venv/Scripts/activate
pip install -e ".[tests]"
```

Install any missing test-only deps as they surface (e.g. `simplejson` was
needed here — not in the base install, only imported by the test suite).

---

## 4. Apply the test_patch and confirm pre-fix failure

`git apply` is fragile against copy-pasted diffs (whitespace/context
mismatches are common). If it fails, apply the change manually instead:

```bash
# fix the import line
sed -i 's/from marshmallow import fields, Schema$/from marshmallow import fields, Schema, validates/' tests/test_marshalling.py

# append the new test (heredoc — terminal may double-echo the paste, this is
# cosmetic only; verify actual file content with `tail` afterward, not the
# terminal echo)
cat >> tests/test_marshalling.py << 'EOF'
<test function content from test_patch>
EOF
```

Verify the file is actually correct:
```bash
tail -25 tests/test_marshalling.py
```

Run the target test — **it must FAIL** at this point, and the failure should
match the original bug report's error (not an environment/import error):
```bash
python -m pytest tests/<path>::<TestClass>::<test_name> -v
```

If you get an import/environment error instead of the real bug, the
environment isn't set up correctly yet — fix that before proceeding. Don't
move to the harness step until the failure mode matches the reported bug.

---

## 5. Set up the clean environment (mirror of step 3, no test changes)

```bash
cd ~/open-weight-agent-bench/tasks/<instance_id>/clean
py -3.9 -m venv venv
source venv/Scripts/activate
pip install -e ".[tests]"
pip install <any-test-only-deps-found-in-step-3>
```

`clean/` never gets the `test_patch` applied — the harness should not see
the test that reveals expected behavior.

---

## 6. Run the harness

```bash
cd ~/open-weight-agent-bench/tasks/<instance_id>/clean
source venv/Scripts/activate
source ~/open-weight-agent-bench/eval-env.sh
claude
```

Prompt: rewrite `problem_statement` to strip out anything that gives away the
solution (e.g. remove explicit mentions of which exception types to catch, or
which file to edit) — keep the bug description, repro steps, and expected
behavior. Paste that as the first message.

Let the harness work until it signals completion, then exit.

---

## 7. Grade

Copy the harness's changes from `clean/` into `grading/` (diff the relevant
source files, or copy them over directly — do NOT copy test files, only the
source fix), then:

```bash
cd ~/open-weight-agent-bench/tasks/<instance_id>/grading
source venv/Scripts/activate
python -m pytest tests/<path>::<TestClass>::<test_name> -v
```

**Pass** = target test now passes (and ideally `PASS_TO_PASS` tests from the
dataset row still pass too — not yet automated, worth scripting once running
multiple instances).

---

## What's done so far for `marshmallow-code__marshmallow-1343`

- [x] Instance selected (pure Python, no compiled deps)
- [x] `clean/` and `grading/` folders created, `clean/.git` removed
- [x] `grading/` venv built on Python 3.9 (3.11 and 3.14 both failed —
      stdlib incompatibilities with this codebase era)
- [x] `test_patch` applied manually to `grading/` (import line + new test
      function appended)
- [x] Confirmed pre-fix failure: `TypeError: 'NoneType' object is not
      subscriptable` — matches the original bug report exactly
- [ ] `clean/` venv setup (Python 3.9, same install steps)
- [ ] Harness run in `clean/` with rewritten prompt
- [ ] Fix copied to `grading/`, target test re-run for pass/fail

## Lessons learned (apply to future instances)

- Always expand the full dataset row — the table preview truncates and it's
  easy to grab `patch` when you meant `test_patch`, or vice versa.
- Old library snapshots often need an old Python interpreter to even install/
  import — check `py -0` and be ready to `winget install` an older version
  before debugging anything else.
- Prefer manual `sed`/heredoc edits over `git apply` for test_patch — pasted
  diffs frequently fail context matching.
- Confirm the pre-fix test failure mode matches the original bug report
  before trusting the environment — an import/environment error is not the
  same as a confirmed-working test harness.
- Use Git Bash, not PowerShell, for this whole project.
