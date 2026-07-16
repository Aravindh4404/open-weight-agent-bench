# Open-Weight Agent Bench — Harness Startup Guide

Quick reference for spinning up any of the three confirmed-working harnesses
(Claude Code, Pi, OpenCode) against GLM 5.2 via OpenRouter.

**Environment:** Windows, Git Bash (MINGW64), home `/c/Users/aravi`,
project folder `~/open-weight-agent-bench`. All three harnesses confirmed
working directly in Git Bash — no WSL, no local proxy needed for any of them.

**Golden rule:** never paste API key *values* into chat, docs, or anywhere
outside your terminal / auth files. Type `export OPENROUTER_API_KEY="..."`
directly into Git Bash each session, or store it via each harness's own
auth mechanism (see below).

---

## 0. One-time setup checklist (do once per machine)

| Harness | Install command |
|---|---|
| Claude Code | *(already installed — Phase 1)* |
| Pi | `npm install -g --ignore-scripts @earendil-works/pi-coding-agent` |
| OpenCode | `npm install -g opencode-ai` |

Verify installs any time with:
```bash
claude --version    # or however you invoke Claude Code
pi --version
opencode --version
```

---

## 1. Claude Code + GLM 5.2 (Phase 1)

Routed directly at OpenRouter's Anthropic-Messages-compatible endpoint —
no local proxy.

```bash
cd ~/open-weight-agent-bench
source ./eval-env.sh      # your existing Phase 1 script — sets
                           # ANTHROPIC_BASE_URL + ANTHROPIC_API_KEY
                           # pointed at OpenRouter
claude
```

**Verify it's actually GLM 5.2, not Claude:** check the model indicator in
Claude Code's own UI/status output — do not trust the model's self-report
if you ask it "what model are you" (see note in section 4).

> ⚠️ If `eval-env.sh` looks stale or you're not sure what's in it, run
> `cat ./eval-env.sh` (safe — no secrets printed if it uses env var
> references) before sourcing it blind.

---

## 2. Pi + GLM 5.2 (Phase 2)

OpenRouter is a **built-in Pi provider** — no proxy, no custom `models.json`
needed since `z-ai/glm-5.2` is already registered.

```bash
cd ~/open-weight-agent-bench
export OPENROUTER_API_KEY="your-current-key"   # type directly, don't paste output
source ./pi-eval-env.sh                        # validates key is set
pi --provider openrouter --model z-ai/glm-5.2
```

**Confirm the right model slug any time** (list may change on Pi updates):
```bash
pi --list-models glm
```

**Verify it's really GLM 5.2:** check Pi's own **footer bar** at the bottom
of the TUI — it shows `Model: z-ai/glm-5.2` directly. This is Pi's internal
state, authoritative. Do NOT trust the model answering "what model are
you?" — GLM has no real self-knowledge and commonly claims to be Claude.

**Persistent auth alternative** (skip re-exporting the key every session):
```
/login    # inside Pi's interactive session, select OpenRouter
```
This stores the key in `~/.pi/agent/auth.json` (0600 permissions).

---

## 3. OpenCode + GLM 5.2 (Phase 2)

Also uses OpenRouter as a built-in provider. Confirmed working in Git Bash
despite OpenCode's docs recommending WSL — no issues seen so far.

**One-time config** — create `opencode.json` in the project root:
```bash
cd ~/open-weight-agent-bench
cat > opencode.json << 'EOF'
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "openrouter": {
      "options": { "apiKey": "{env:OPENROUTER_API_KEY}" }
    }
  }
}
EOF
```
This only needs to be done once — the file lives in the project and reads
the key from your environment each run, so it's safe to commit to git
(no secret is stored in the file itself).

**Every session:**
```bash
cd ~/open-weight-agent-bench
export OPENROUTER_API_KEY="your-current-key"   # type directly
opencode
```
Inside the TUI, pick the model:
```
/models
```
then type `glm` to filter, select **GLM-5.2**.

**Verify it's really GLM 5.2:** check OpenCode's own footer —
`Build · GLM-5.2 · OpenRouter` is shown directly at the bottom of the
screen. Confirmed working end-to-end (write/run/delete file test passed).

**Persistent auth alternative:**
```
/connect   # inside OpenCode, search "OpenRouter", paste key
```
Stores in `~/.local/share/opencode/auth.json` — lets you skip the
`export OPENROUTER_API_KEY` step in future sessions.

---

## 4. Universal rule: verifying which model is actually running

**Never trust the model's own answer to "what model are you?"** — this is
a known unreliable pattern for open-weight models (they pattern-match to
common training data, often claiming to be Claude/GPT). Always check the
**harness's own status line** instead:

| Harness | Where to check |
|---|---|
| Claude Code | Its own model/status indicator |
| Pi | Footer bar: `Model: z-ai/glm-5.2` |
| OpenCode | Footer bar: `Build · GLM-5.2 · OpenRouter` |

---

## 5. Quick troubleshooting

- **Key exposed by accident (pasted in chat/logs)?** Rotate it immediately
  on the OpenRouter dashboard, update wherever you store it.
- **Pi/OpenCode not finding the model?** Re-run `pi --list-models glm` or
  OpenCode's `/models` search — slugs can shift between provider updates.
- **Windows path issues?** Both Pi and OpenCode auto-detect Git Bash; no
  custom `shellPath` config has been needed so far.
- **Cost tracking:** OpenCode's footer shows live token/cost per session
  (e.g. `18.4K (2%) · $0.03`) — useful for your cost-comparison benchmark
  once you start running matched tasks across all three harnesses.

---

## 6. Still open / not yet done

- Actual comparative benchmark runs (same task across all three harnesses)
  — infrastructure is ready, but no head-to-head cost/quality comparison
  has been run yet.
- DeepSeek or other open-weight models as a second model axis.
