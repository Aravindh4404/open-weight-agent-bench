# Running Claude Code with GLM 5.2 — Quick Start

Use this every time you sit down to do eval work. Takes under a minute.

Windows, Git Bash (MINGW64) — not PowerShell.

---

## Every session, from scratch:

```bash
cd ~/open-weight-agent-bench
export OPENROUTER_API_KEY="your-current-openrouter-key"
source ./eval-env.sh
claude
```

That's it. You should land straight in a chat prompt showing
**"API Usage Billing"** (not "Claude Pro"). Confirm with:

```
what model are you?
```

Should say GLM 5.2 / `z-ai/glm-5.2`, not Sonnet.

---

## What's actually in eval-env.sh (for reference — don't need to touch it)

```bash
#!/bin/bash
export ANTHROPIC_BASE_URL="https://openrouter.ai/api"
export ANTHROPIC_AUTH_TOKEN="$OPENROUTER_API_KEY"
unset ANTHROPIC_API_KEY
echo "Eval environment active: routing Claude Code directly to OpenRouter at $ANTHROPIC_BASE_URL"
export ANTHROPIC_MODEL="z-ai/glm-5.2"
```

Lives at `~/open-weight-agent-bench/eval-env.sh` — **not** in your home
folder root (`~/eval-env.sh`), that duplicate was deleted.

---

## Going back to normal Claude Code (your subscription)

Just open a **new** Git Bash window and don't run any of the above. Env
vars are session-scoped — they never persist outside the window you set
them in.

If you're in a window that has the eval vars active and want to switch
back in the *same* window:

```bash
unset ANTHROPIC_BASE_URL ANTHROPIC_AUTH_TOKEN ANTHROPIC_MODEL
claude
```

You may need to log back into your subscription (`/login` inside Claude
Code) since we did `/logout` during setup.

---

## If something breaks next time

1. Check you're in Git Bash, not PowerShell (prompt should look like
   `user@machine MINGW64 ~`, not `PS C:\...>`)
2. Check you're in the right folder: `pwd` should show
   `/c/Users/aravi/open-weight-agent-bench`
3. Check env vars actually loaded: `env | grep ANTHROPIC`
4. If it's showing "Claude Pro" instead of "API Usage Billing" — you're
   not routed through OpenRouter. Re-run the 4 commands at the top of
   this doc, in order.
5. If it still says "Sonnet 5" instead of GLM after that — `ANTHROPIC_MODEL`
   didn't take. Check `cat eval-env.sh` has that line, and that you
   sourced the file *after* it was added.

---

## Swapping to a different OpenRouter model later

Edit the last line of `eval-env.sh`:

```bash
export ANTHROPIC_MODEL="some-other/model-slug"
```

Verify the slug is real first at https://openrouter.ai/models — copy it
exactly, don't guess.
