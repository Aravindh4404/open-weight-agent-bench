#!/bin/bash
export ANTHROPIC_BASE_URL="https://openrouter.ai/api"
export ANTHROPIC_AUTH_TOKEN="$OPENROUTER_API_KEY"
unset ANTHROPIC_API_KEY
export ANTHROPIC_MODEL="${MODEL_SLUG:-z-ai/glm-5.2}"
echo "Eval environment active: routing Claude Code to OpenRouter, model=$ANTHROPIC_MODEL"
