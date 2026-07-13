# Open Weight Agent Bench — Setup Notes

Reference notes for setting up and running model evals through Claude Code
via a local LiteLLM proxy. Environment: Windows, Git Bash (MINGW64).
Home dir: `/c/Users/aravi`. Project folder: `~/open-weight-agent-bench`.

---

## Why this setup exists

Goal: run Claude Code (and later, the "Pi" harness) against open-weight
models like GLM 5.2 and DeepSeek V4 Flash, instead of Anthropic's models,
to benchmark cost/performance — without touching or breaking the normal
Claude Code subscription login.

The trick: Claude Code reads `ANTHROPIC_BASE_URL` and `ANTHROPIC_API_KEY`
from the environment. If we override those *in one terminal session only*,
Claude Code talks to a local proxy (LiteLLM) instead of Anthropic — and
that proxy forwards requests to OpenRouter, which hosts the open models.

**Golden rule:** never set these vars system-wide (no `.bashrc`, no
`setx`, no Windows System Properties env vars). Always scoped to a
manually-sourced script, one terminal window at a time. This is because
Claude Code auth broke once before from a system-wide env var leaking in.

---

## Folder layout

```
~/open-weight-agent-bench/
├── eval-env.sh          # sourced manually to redirect Claude Code to local proxy
├── litellm-config.yaml  # tells LiteLLM which OpenRouter models to expose
└── .gitignore           # keeps secrets out of git
```

---

## File: eval-env.sh

Sets two env vars for the current terminal session only:
- `ANTHROPIC_BASE_URL=http://localhost:4000` → points Claude Code at local LiteLLM
- `ANTHROPIC_API_KEY=sk-litellm-local-key` → dummy key, must match LiteLLM's `master_key`

Never sourced automatically. Never touches `.bashrc`.

## File: litellm-config.yaml

Maps friendly model names to real OpenRouter model slugs, and tells LiteLLM
to pull the real OpenRouter key from `OPENROUTER_API_KEY` (set separately,
never hardcoded in this file).

**⚠️ Model slugs in this file are UNVERIFIED until checked against
https://openrouter.ai/models directly.** Don't trust them blindly —
OpenRouter slugs change.

---

## Normal workflow (day to day)

**Regular Claude Code use (real Anthropic subscription):**
```bash
# Just open Git Bash as usual. Don't source eval-env.sh. Done.
```

**Eval work (open-weight models via proxy):**
```bash
# 1. Fresh Git Bash window
cd ~/open-weight-agent-bench

# 2. Set your real OpenRouter key for this session (not saved to disk)
export OPENROUTER_API_KEY="REDACTED_OPENROUTER_KEY"

# 3. Start the LiteLLM proxy (separate terminal tab, leave it running)
litellm --config litellm-config.yaml --port 4000

# 4. In your work terminal, activate the eval environment
source ~/eval-env.sh

# 5. Confirm it's active
echo $ANTHROPIC_BASE_URL   # should print http://localhost:4000

# 6. Run Claude Code as normal — it now talks to the open-weight model
claude
```

---

## Verification checklist (run through this each time something feels off)

1. **Clean baseline** — before sourcing anything:
   ```bash
   echo $ANTHROPIC_BASE_URL   # should be empty
   echo $ANTHROPIC_API_KEY    # should be empty
   ```

2. **Session-scoped, not permanent** — close Git Bash entirely, open a new
   window, and check:
   ```bash
   echo $ANTHROPIC_BASE_URL   # should be empty again
   ```
   If it's NOT empty, something leaked into `.bashrc`, `.bash_profile`, or
   Windows system env vars (`sysdm.cpl`) — stop and hunt that down before
   continuing.

3. **Proxy is actually listening** before touching Claude Code:
   ```bash
   curl http://localhost:4000/health
   ```

4. **Proxy actually returns a real model response** before touching Claude Code:
   ```bash
   curl http://localhost:4000/v1/chat/completions \
     -H "Authorization: Bearer sk-litellm-local-key" \
     -H "Content-Type: application/json" \
     -d '{"model": "glm-5.2", "messages": [{"role": "user", "content": "say hi"}]}'
   ```

5. Only once step 4 returns a real response → source `eval-env.sh` and test
   `claude` end-to-end.

6. Only once basic chat works → run a real task through Claude Code
   (e.g. "read this repo and summarize its structure") to confirm tool
   calls (file read, etc.) work through the proxy too.

---

## Known gotchas

- **PowerShell vs Git Bash**: `cat`, `~`, and sourcing `.sh` files all
  behave differently (or don't work at all) in PowerShell. Always confirm
  the terminal prompt looks like `user@machine MINGW64 ~` and not
  `PS C:\...>` before running any of these commands.
- **YAML is whitespace-sensitive** — if `litellm-config.yaml` throws
  parsing errors, check indentation first.
- **Folder names with spaces** (e.g. anything under `Desktop/...`) can
  silently break scripts — keep working folders under `~` with no spaces.

---

## Open items / not yet done

- [ ] Verify `openrouter/z-ai/glm-5.2` slug against openrouter.ai/models
- [ ] Verify `openrouter/deepseek/deepseek-v4-flash` slug against openrouter.ai/models
- [ ] First successful LiteLLM start
- [ ] First successful curl health check
- [ ] First successful curl chat completion
- [ ] First successful `claude` session through the proxy
- [ ] First successful real task (file read via tool call) through the proxy
- [ ] Phase 2: set up and test the "Pi" harness for comparison
