# GLM 5.2 via Claude Code — Setup Guide (v2, no local proxy)

This replaces the earlier LiteLLM-proxy approach, which got stuck on
Claude Code's login/auth flow. Instead, we point Claude Code directly at
OpenRouter's own Anthropic-Messages-compatible endpoint. No local server,
no proxy, no port conflicts.

Windows, Git Bash (MINGW64) only — not PowerShell.
Project folder: `~/open-weight-agent-bench`

**Status: UNVERIFIED — this is the first attempt at this approach. Test
step by step and report back what actually happens at each stage.**

---

## Why this is different from before

Old approach: Claude Code → local LiteLLM proxy (`localhost:4000`) →
OpenRouter. Broke because Claude Code kept sending `model=claude-sonnet-5`
(its own internal model name) to a proxy that only knew about `glm-5.2`.

New approach: Claude Code → OpenRouter's `/v1/messages` endpoint directly.
Confirmed real, documented OpenRouter endpoint that speaks Claude's native
Messages format:

```
POST https://openrouter.ai/api/v1/messages
Authorization: Bearer <token>
```

We still need to solve the same underlying problem — Claude Code will
still try to send a `model` name by default. This guide starts with the
simplest possible test to see what happens, before adding any model
overrides.

---

## Step 1 — Rebuild eval-env.sh

```bash
cd ~/open-weight-agent-bench

cat > eval-env.sh << 'EOF'
#!/bin/bash
# eval-env.sh — source this ONLY in a terminal doing model-eval work.
# Do NOT put this in .bashrc. Do NOT set these system-wide.
#
# v2: points Claude Code directly at OpenRouter's Anthropic-compatible
# endpoint. No local proxy needed.

export ANTHROPIC_BASE_URL="https://openrouter.ai/api"
export ANTHROPIC_AUTH_TOKEN="$OPENROUTER_API_KEY"
unset ANTHROPIC_API_KEY

echo "Eval environment active: routing Claude Code directly to OpenRouter at $ANTHROPIC_BASE_URL"
EOF
chmod +x eval-env.sh
```

Note: this script reads `OPENROUTER_API_KEY` from your environment and
copies it into `ANTHROPIC_AUTH_TOKEN`. So `OPENROUTER_API_KEY` must be set
**before** you source this script, every session.

## Step 2 — Set your OpenRouter key (session only)

```bash
export OPENROUTER_API_KEY="your-current-key"
```

⚠️ If you've pasted this key anywhere outside your own terminal (chat,
screenshots, etc.), rotate it on openrouter.ai first — revoke old,
generate new — before continuing.

## Step 3 — Source the new eval-env.sh

```bash
source ~/eval-env.sh
```

Confirm:

```bash
env | grep ANTHROPIC
```

Expected output:
```
ANTHROPIC_BASE_URL=https://openrouter.ai/api
ANTHROPIC_AUTH_TOKEN=sk-or-v1-...
```

(No `ANTHROPIC_API_KEY` should be listed — it was unset.)

## Step 4 — Fully log out of Claude Code first

Since we're not using the old `ANTHROPIC_API_KEY`-detection prompt this
time, start from a clean logged-out state so there's no cached subscription
session interfering.

```bash
claude
```

Once loaded (whatever screen it lands on), type at the `❯` prompt:

```
/logout
```

Exit fully (Ctrl+C twice or `/exit`).

## Step 5 — Launch Claude Code with the new env vars active

```bash
claude
```

Watch what happens. A few possible outcomes:

**A) It works immediately** — you get a chat prompt, no login screen, no
error. Great — test it:
```
what model are you?
```
Then check:
```
/status
```
Paste both outputs.

**B) It asks "Select login method" again** — meaning it's not detecting
`ANTHROPIC_AUTH_TOKEN` as valid credentials at all. If so, press Ctrl+C to
back out, don't select anything, and report this back — we'll need to
find the correct auth variable name from Claude Code's own docs (not
OpenRouter's), since `ANTHROPIC_AUTH_TOKEN` may not be it.

**C) It loads but errors on the first real message** — likely a model name
mismatch (same root cause as before: Claude Code sending `claude-sonnet-5`
or similar to an endpoint that needs an OpenRouter-style slug like
`z-ai/glm-5.2`). Paste the exact error text.

---

## If outcome C happens: adding a model override

Only do this once C is confirmed. Add to `eval-env.sh`:

```bash
export ANTHROPIC_MODEL="z-ai/glm-5.2"
```

**This variable name is UNVERIFIED.** Check Claude Code's own docs sidebar
(the page you had open earlier — docs.claude.com or
docs.anthropic.com/en/docs/claude-code) for the actual supported
model-override variable before trusting this. It may be `ANTHROPIC_MODEL`,
`ANTHROPIC_DEFAULT_SONNET_MODEL`, or something else — don't guess, look it
up on the Claude Code docs page specifically (not the OpenRouter one).

---

## Cleanup: old files no longer needed

These were part of the old LiteLLM-proxy approach and can be left alone or
removed — your call, they're not doing any harm sitting unused:

- `litellm-config.yaml`
- The LiteLLM proxy process (safe to Ctrl+C and close that terminal window)

---

## Report back with

1. Output of Step 3's `env | grep ANTHROPIC`
2. Which outcome (A / B / C) happened at Step 5, with exact screen text
3. If C: the exact error message
