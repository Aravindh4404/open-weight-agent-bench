# Progress Log — Claude Code + GLM 5.2 Setup

A record of what was tried, what failed, why, and what finally worked.
Useful context if this breaks again or if extending to Phase 2 (Pi harness).

---

## Goal

Run Claude Code against GLM 5.2 (via OpenRouter) instead of Anthropic's
models, to benchmark cost/performance, without breaking the normal Claude
Code subscription login. Inspired by Databricks' internal coding-agent
benchmark article, which found harness choice and model choice both
matter a lot for cost/performance.

---

## Attempt 1: Local LiteLLM proxy — ABANDONED

**Approach:** Run a local LiteLLM server on `localhost:4000`. Point
Claude Code at it via `ANTHROPIC_BASE_URL` + a dummy `ANTHROPIC_API_KEY`.
LiteLLM would translate requests and forward them to OpenRouter.

**What worked:**
- `eval-env.sh` correctly set session-scoped env vars, confirmed
  session-only (didn't leak to `.bashrc` or new terminal windows)
- `litellm-config.yaml` was valid, LiteLLM started cleanly on port 4000
- Verified `z-ai/glm-5.2` was a real OpenRouter slug (checked directly
  against openrouter.ai/models)
- Direct `curl` calls to the proxy worked perfectly — real GLM 5.2
  responses came back, with cost data, correctly

**What broke it:**
- Claude Code kept sending its own internal model name
  (`claude-sonnet-5`) to the proxy instead of `glm-5.2`, because nothing
  told Claude Code to stop defaulting to Sonnet
- LiteLLM correctly rejected `claude-sonnet-5` as unknown → repeated
  `400 Bad Request` / `Invalid model name passed in model=claude-sonnet-5`
  errors, visible in LiteLLM's server logs
- Separately, spent a long time fighting Claude Code's login flow:
  - `/logout` sometimes worked, sometimes silently didn't
  - Env vars were correctly set but Claude Code would still boot straight
    into the real Claude Pro subscription login with no prompt
  - The "Detected a custom API key, do you want to use it?" prompt only
    appeared once, in one specific state (logged in + differing key set
    at the same time) — never reliably reproducible after that
  - Multiple duplicate `claude` / `litellm` processes got launched by
    accident across terminal windows, causing confusing, inconsistent
    behavior

**Root cause, in hindsight:** two separate unsolved problems tangled
together — (1) Claude Code's account-login state vs. API-key state is
finicky and not something we found a reliable manual override for, and
(2) even if login was solved, the proxy still needed a way to remap
Claude Code's internal model name to an OpenRouter slug, which
`litellm-config.yaml` alone doesn't do.

**Time cost:** most of this session. Abandoned once a simpler alternative
was found.

---

## Attempt 2: Direct-to-OpenRouter via Anthropic Messages endpoint — SUCCESS

**The unlock:** discovered (via a YouTube setup someone else did, then
verified against OpenRouter's actual docs) that OpenRouter has a real,
documented endpoint that speaks Claude's native Messages format directly:

```
POST https://openrouter.ai/api/v1/messages
Authorization: Bearer <token>
```

This meant no local proxy was needed at all — Claude Code could talk to
OpenRouter directly, as if OpenRouter were Anthropic's own API.

**Final working eval-env.sh:**

```bash
#!/bin/bash
export ANTHROPIC_BASE_URL="https://openrouter.ai/api"
export ANTHROPIC_AUTH_TOKEN="$OPENROUTER_API_KEY"
unset ANTHROPIC_API_KEY
echo "Eval environment active: routing Claude Code directly to OpenRouter at $ANTHROPIC_BASE_URL"
export ANTHROPIC_MODEL="z-ai/glm-5.2"
```

**Why this fixed the login problem:** using `ANTHROPIC_AUTH_TOKEN`
instead of `ANTHROPIC_API_KEY` made Claude Code correctly show
**"API Usage Billing"** instead of "Claude Pro" on launch — meaning it
stopped trying to use the subscription-login path entirely, without
needing to fight `/logout` or any interactive prompt.

**Why this fixed the model-mismatch problem:** setting `ANTHROPIC_MODEL`
directly told Claude Code what model to actually request, instead of
defaulting to `claude-sonnet-5`. First tested without this line — Claude
Code loaded fine and could chat, but confirmed via "what model are you?"
that it was still using real Claude Sonnet 5 (routed correctly through
OpenRouter, just the wrong model). Adding `ANTHROPIC_MODEL="z-ai/glm-5.2"`
and re-sourcing fixed it — confirmed via the same question, response
correctly identified GLM 5.2.

**One gotcha hit along the way:** a stray duplicate `eval-env.sh` existed
at `~/eval-env.sh` (home folder root) from the very first attempt, separate
from the real one at `~/open-weight-agent-bench/eval-env.sh`. Running
`source ~/eval-env.sh` kept silently loading the old, wrong file. Fixed by
deleting the duplicate and always sourcing `./eval-env.sh` from inside the
project folder.

---

## Known unverified items

- `ANTHROPIC_MODEL` as the variable name worked empirically, but was never
  confirmed against Claude Code's own official docs (no web access to
  docs.claude.com from within this session). If a future Claude Code
  update changes this behavior, check
  https://docs.claude.com/en/docs/claude-code/overview for the current
  correct variable name.
- DeepSeek V4 Flash was part of the original plan but was parked to focus
  on GLM only. Not yet tested with this working direct-to-OpenRouter
  approach — should work the same way, just swap the `ANTHROPIC_MODEL`
  slug.

---

## Phase 2 — Pi harness setup (CONFIRMED WORKING)

- Installed via: npm install -g --ignore-scripts @earendil-works/pi-coding-agent
- Version confirmed: pi --version → 0.80.6
- OpenRouter is a BUILT-IN Pi provider — no local proxy needed, same as the
  Phase 1 lesson for Claude Code. Just needs OPENROUTER_API_KEY set.
- GLM 5.2 slug confirmed via `pi --list-models glm` → z-ai/glm-5.2
  (same slug as Phase 1, 1M context / 131K max-out / thinking-capable)
- Working command:
    export OPENROUTER_API_KEY="your-current-key"
    cd ~/open-weight-agent-bench
    pi --provider openrouter --model z-ai/glm-5.2
- Windows/Git Bash: works out of the box, no custom shellPath needed.
  Pi auto-detects Git Bash at C:\Program Files\Git\bin\bash.exe.
- First run auto-downloaded fd.exe and rg.exe to ~/.pi/agent/bin/ — expected,
  one-time.

### IMPORTANT gotcha — model self-report is unreliable, don't trust it
Asking the model "what model are you?" is NOT a valid verification method
for GLM (unlike Phase 1 where it worked fine for GLM via Claude Code).
GLM 5.2 under Pi responded "I'm Claude Sonnet 4.5" when asked directly —
this is a known pattern-matching artifact from training data containing
lots of Claude/GPT transcripts, not a misconfiguration. The model has no
real access to its own checkpoint identity.

**Correct verification method: check Pi's own footer bar**, which shows
the actual active model (e.g. "Model: z-ai/glm-5.2") — this is Pi's
internal state, not the model talking, so it's authoritative.
For future harnesses (OpenCode etc.), find that harness's equivalent
status indicator rather than relying on asking the model directly.

### Still TODO for Phase 2
- Research OpenCode setup — not yet investigated
- Run same GLM 5.2 apples-to-apples comparison against Phase 1 Claude
  Code results once OpenCode is confirmed working too

---

## Re-confirmation log

- **2026-07-13** — Re-confirmed the model self-report gotcha under Pi.
  Asked the model "which model are you?" twice; it answered "Claude Sonnet
  4.5 (`claude-sonnet-4-5-20250929`), running inside pi" both times.
  Pi's footer bar showed `z-ai/glm-5.2` — footer is authoritative, model
  self-report is not. Same artifact as originally documented: GLM
  pattern-matches onto Claude/GPT transcripts in its training data.


REDACTED_OPENROUTER_KEY

export OPENROUTER_API_KEY="REDACTED_OPENROUTER_KEY"