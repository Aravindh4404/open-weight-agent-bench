#!/bin/bash
if [ -z "$OPENROUTER_API_KEY" ]; then
  echo "OPENROUTER_API_KEY is not set."
  echo "Run: export OPENROUTER_API_KEY=\"your-current-key\""
  return 1 2>/dev/null || exit 1
fi

export PI_MODEL="z-ai/glm-5.2"
echo "Pi eval environment active: provider=openrouter model=$PI_MODEL"
echo "Run: pi --provider openrouter --model \$PI_MODEL"
