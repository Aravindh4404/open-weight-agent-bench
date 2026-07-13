Let's set this up properly in Git Bash on your Windows machine. Since your Claude Code auth already broke once from a system-wide env var, we're being extra careful here — everything stays scoped to a script you manually source, never touching Windows system environment variables.

## Step 1: Open Git Bash and go to your home directory

```bash
cd ~
pwd
```

This should show something like `/c/Users/aravi`. That confirms you're in Git Bash's view of your Windows user folder.

## Step 2: Create the eval-env script

```bash
touch eval-env.sh
```

## Step 3: Edit it

Open it in VS Code (since that's your usual editor):

```bash
code eval-env.sh
```

Paste this in:

```bash
#!/bin/bash
# eval-env.sh — source this ONLY in a terminal doing model-eval work.
# Do NOT put this in .bashrc. Do NOT set these system-wide.

export ANTHROPIC_BASE_URL="http://localhost:4000"
export ANTHROPIC_API_KEY="sk-litellm-local-key"

echo "Eval environment active: routing Claude Code through local LiteLLM proxy at $ANTHROPIC_BASE_URL"
```

Save it.

## Step 4: Make it executable (optional but good practice)

```bash
chmod +x eval-env.sh
```

## Step 5: Verify it's NOT touching your normal setup

Before sourcing anything, check your current env is clean:

```bash
echo $ANTHROPIC_BASE_URL
echo $ANTHROPIC_API_KEY
```

Both should print nothing (empty) if your normal Claude Code subscription auth is untouched — which is what you want as the baseline.

## Step 6: Test sourcing it

```bash
source ~/eval-env.sh
```

You should see the echo message confirm it's active. Then check:

```bash
echo $ANTHROPIC_BASE_URL
```

Should now print `http://localhost:4000`.

## Step 7: Confirm it's session-scoped, not permanent

Close this Git Bash window entirely, open a **new** Git Bash window, and run:

```bash
echo $ANTHROPIC_BASE_URL
```

This should print **nothing**. If it prints the localhost URL, something leaked into a persistent file (`.bashrc`, `.bash_profile`, or — worse — Windows system env vars via `sysdm.cpl`), and we'd need to hunt that down before going further, given what happened last time.

---

**The workflow going forward:**
- **Normal Claude Code use** → just open Git Bash as usual, don't source anything.
- **Eval work** → open a fresh Git Bash window, `source ~/eval-env.sh`, then work in that window only.

Once you confirm Step 7 checks out clean, next step is standing up the actual LiteLLM proxy so `localhost:4000` has something listening on it. Want to move to that now?



model_list:
  - model_name: deepseek-flash
    litellm_params:
      model: openrouter/deepseek/deepseek-v4-flash
      api_key: os.environ/OPENROUTER_API_KEY

  - model_name: glm-5.2
    litellm_params:
      model: openrouter/z-ai/glm-5.2
      api_key: os.environ/OPENROUTER_API_KEY

general_settings:
  master_key: sk-litellm-local-key