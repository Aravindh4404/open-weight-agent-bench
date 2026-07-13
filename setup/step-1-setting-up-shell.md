# Step 1 — Setting Up Shell (eval-env.sh)

Goal: create a script that, when sourced, temporarily redirects Claude Code
to a local proxy — without touching your normal Claude Code subscription
login, and without changing anything system-wide.

Environment: Windows, **Git Bash** (MINGW64) — not PowerShell. Confirm your
prompt looks like:

```
aravi@Aravindh MINGW64 ~/open-weight-agent-bench (main)
```

not `PS C:\...>`. If you see `PS`, you're in PowerShell — open Git Bash
instead.

---

## 1. Go to your project folder

```bash
cd ~/open-weight-agent-bench
```

## 2. Create eval-env.sh

```bash
cat > eval-env.sh << 'EOF'
#!/bin/bash
# eval-env.sh — source this ONLY in a terminal doing model-eval work.
# Do NOT put this in .bashrc. Do NOT set these system-wide.

export ANTHROPIC_BASE_URL="http://localhost:4000"
export ANTHROPIC_API_KEY="sk-litellm-local-key"

echo "Eval environment active: routing Claude Code through local LiteLLM proxy at $ANTHROPIC_BASE_URL"
EOF
chmod +x eval-env.sh
```

## 3. Verify it saved correctly

```bash
cat eval-env.sh
```

Should print the script back exactly as above.

## 4. Confirm your baseline is clean (before sourcing anything)

```bash
echo $ANTHROPIC_BASE_URL   # should print nothing
echo $ANTHROPIC_API_KEY    # should print nothing
```

If either prints something already, stop — something is set system-wide
and needs to be found before continuing (check `.bashrc`, `.bash_profile`,
or Windows System Properties env vars via `sysdm.cpl`).

## 5. Test sourcing it

```bash
source ~/eval-env.sh
echo $ANTHROPIC_BASE_URL   # should now print http://localhost:4000
```

## 6. Confirm it's session-scoped, not permanent

Close this Git Bash window completely. Open a **new** Git Bash window and run:

```bash
echo $ANTHROPIC_BASE_URL
```

Should print nothing. If it prints the localhost URL, something leaked into
a persistent file — stop and investigate before continuing.

---

## Daily workflow going forward

- **Normal Claude Code use** → open Git Bash as usual, don't source anything.
- **Eval work** → open a fresh Git Bash window, `source ~/eval-env.sh`, work
  only in that window.

---

✅ Once step 6 checks out clean, move to **Step 2 — Config File (GLM only)**.
