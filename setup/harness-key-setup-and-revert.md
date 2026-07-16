# Harness Key Setup & Revert — Command Guide

Windows, Git Bash (MINGW64). Project folder: `~/open-weight-agent-bench`.
Env vars are session-scoped — a new Git Bash window is always "normal"
by default, no revert needed there.

---

## 1. Claude Code

**Set key / go into eval mode:**
```bash
cd ~/open-weight-agent-bench
export OPENROUTER_API_KEY="your-current-key"
source ./eval-env.sh
claude
```

**Revert to normal (same window):**
```bash
unset ANTHROPIC_BASE_URL ANTHROPIC_AUTH_TOKEN ANTHROPIC_MODEL
claude
# /login inside Claude Code if it asks you to re-authenticate
```

---

## 2. Pi

**Set key / go into eval mode:**
```bash
cd ~/open-weight-agent-bench
export OPENROUTER_API_KEY="your-current-key"
source ./pi-eval-env.sh
pi --provider openrouter --model z-ai/glm-5.2
```

**Revert to normal (same window):**
```bash
unset OPENROUTER_API_KEY PI_MODEL
pi
# /model inside Pi to pick your usual provider/model
```

---

## 3. OpenCode

**Set key / go into eval mode:**
```bash
cd ~/open-weight-agent-bench
export OPENROUTER_API_KEY="your-current-key"
opencode
# /models inside OpenCode, search "glm", select GLM-5.2
```

**Revert to normal (same window/project):**
```bash
unset OPENROUTER_API_KEY
mv opencode.json opencode.json.eval-backup
opencode
# /models inside OpenCode to pick your usual provider/model
```

**Restore eval config later:**
```bash
mv opencode.json.eval-backup opencode.json
```

---

## Verify which model is actually active (all 3)

| Harness | Check |
|---|---|
| Claude Code | Model/status indicator in its own UI |
| Pi | Footer bar: `Model: z-ai/glm-5.2` |
| OpenCode | Footer bar: `Build · GLM-5.2 · OpenRouter` |

Never trust the model answering "what model are you?" directly.
