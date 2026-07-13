# GLM 5.2 via Claude Code — Setup Guide

Windows, Git Bash (MINGW64) only — not PowerShell.
Project folder: `~/open-weight-agent-bench`

---

## 1. Create eval-env.sh

```bash
cd ~/open-weight-agent-bench

cat > eval-env.sh << 'EOF'
#!/bin/bash
export ANTHROPIC_BASE_URL="http://localhost:4000"
export ANTHROPIC_API_KEY="sk-litellm-local-key"
echo "Eval environment active: routing Claude Code through local LiteLLM proxy at $ANTHROPIC_BASE_URL"
EOF
chmod +x eval-env.sh
```

## 2. Create litellm-config.yaml

```bash
cat > litellm-config.yaml << 'EOF'
model_list:
  - model_name: glm-5.2
    litellm_params:
      model: openrouter/z-ai/glm-5.2
      api_key: os.environ/OPENROUTER_API_KEY

general_settings:
  master_key: sk-litellm-local-key
EOF
```

## 3. Set your OpenRouter key (session only, never saved to disk)

```bash
export OPENROUTER_API_KEY="REDACTED_OPENROUTER_KEY"
```

## 4. Start the proxy — leave this terminal running

```bash
litellm --config litellm-config.yaml --port 4000
```

Wait for: `Uvicorn running on http://0.0.0.0:4000`

## 5. Open a SECOND Git Bash window, test the proxy

```bash
curl http://localhost:4000/health \
  -H "Authorization: Bearer sk-litellm-local-key"

curl http://localhost:4000/v1/chat/completions \
  -H "Authorization: Bearer sk-litellm-local-key" \
  -H "Content-Type: application/json" \
  -d '{"model": "glm-5.2", "messages": [{"role": "user", "content": "say hi"}]}'
```

Should return real JSON with a model reply, not an error.

## 6. Run Claude Code through the proxy (same second window)

```bash
cd ~/open-weight-agent-bench
source ~/eval-env.sh
claude
```

When prompted "Detected a custom API key... Do you want to use this API key?" → choose **1. Yes**

## 7. Test it

Ask it something simple, then try: `Read this repo and summarize its structure.`

---

## Notes

- Only run **one** LiteLLM instance at a time — a second one silently grabs a random port instead of 4000.
- Never paste your real `OPENROUTER_API_KEY` value anywhere outside your own terminal — rotate it on openrouter.ai if it ever leaks.
- Normal Claude Code use: just don't source `eval-env.sh` in that window.
