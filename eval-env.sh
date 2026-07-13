#!/bin/bash
export ANTHROPIC_BASE_URL="https://openrouter.ai/api"
export ANTHROPIC_AUTH_TOKEN="$OPENROUTER_API_KEY"
unset ANTHROPIC_API_KEY

echo "Eval environment active: routing Claude Code directly to OpenRouter at $ANTHROPIC_BASE_URL"
export ANTHROPIC_MODEL="z-ai/glm-5.2"
