#!/usr/bin/env bash
# Prints a per-request table (mirroring OpenRouter's website Logs view)
# by looking up every generation ID found in a transcript, using
# OpenRouter's /api/v1/generation endpoint.
#
# CONFIRMED FIELD NAMES (2026-07-16, verified against a real response):
#   native_tokens_prompt      -- total prompt tokens (fresh + cached)
#   native_tokens_cached      -- cached portion of the prompt
#   native_tokens_completion  -- output tokens
#   total_cost                -- cost in USD
# These "native_*" fields match Anthropic's own reported usage exactly
# (native_tokens_prompt - native_tokens_cached == transcript's
# input_tokens; native_tokens_completion == transcript's output_tokens).
#
# NOTE: OpenRouter also returns non-native "tokens_prompt" /
# "tokens_completion" fields -- these are OpenRouter's OWN tokenizer
# estimate and do NOT match the provider's native usage. Do not use them
# for reconciliation against transcript data; this script ignores them.
#
# Requires: jq, curl, OPENROUTER_API_KEY set in your shell.
#
# Usage:
#   ./verify-usage.sh /path/to/transcript.jsonl

set -uo pipefail

TRANSCRIPT="${1:-}"

if [ -z "$TRANSCRIPT" ] || [ ! -f "$TRANSCRIPT" ]; then
  echo "Usage: $0 /path/to/transcript.jsonl" >&2
  exit 1
fi

if [ -z "${OPENROUTER_API_KEY:-}" ]; then
  echo "OPENROUTER_API_KEY is not set in this shell. Export it first." >&2
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required but not found." >&2
  exit 1
fi

# Only real OpenRouter generation IDs look like "gen-...". Anthropic-native
# ids (msg_..., sg_...) will always 404 against this endpoint, so skip
# them rather than wasting a request and cluttering the output.
ids="$(jq -r 'select(.type == "assistant" and .message.id != null and (.message.id | startswith("gen-"))) | .message.id' "$TRANSCRIPT" | sort -u)"

if [ -z "$ids" ]; then
  echo "No OpenRouter-shaped generation IDs found in this transcript." >&2
  exit 1
fi

count=$(echo "$ids" | wc -l | tr -d ' ')
echo "Found $count unique OpenRouter generation ID(s). Querying..." >&2
echo "" >&2

printf "%-20s %-22s %10s %10s %10s %10s\n" "Date" "Model" "Prompt" "Cached" "Output" "Cost($)"
printf '%s\n' "----------------------------------------------------------------------------------------"

total_prompt=0
total_cached=0
total_completion=0
total_cost=0
missing=0

while IFS= read -r gen_id; do
  [ -z "$gen_id" ] && continue

  response=$(curl -s -H "Authorization: Bearer $OPENROUTER_API_KEY" \
    "https://openrouter.ai/api/v1/generation?id=$gen_id")

  ok=$(echo "$response" | jq -e '.data != null' >/dev/null 2>&1 && echo yes || echo no)
  if [ "$ok" = "no" ]; then
    missing=$((missing + 1))
    continue
  fi

  created_at=$(echo "$response" | jq -r '.data.created_at // "?"')
  model=$(echo "$response" | jq -r '.data.model // "?"')
  prompt=$(echo "$response" | jq -r '.data.native_tokens_prompt // 0')
  cached=$(echo "$response" | jq -r '.data.native_tokens_cached // 0')
  completion=$(echo "$response" | jq -r '.data.native_tokens_completion // 0')
  cost=$(echo "$response" | jq -r '.data.total_cost // 0')

  printf "%-20s %-22s %10d %10d %10d %10s\n" "$created_at" "$model" "$prompt" "$cached" "$completion" "$cost"

  total_prompt=$((total_prompt + prompt))
  total_cached=$((total_cached + cached))
  total_completion=$((total_completion + completion))
  total_cost=$(echo "$total_cost + $cost" | bc)

  sleep 0.3
done <<< "$ids"

echo ""
echo "=== Totals (native, OpenRouter-confirmed) ==="
echo "Requests found:              $((count - missing)) (missing: $missing)"
echo "Total prompt tokens:         $total_prompt"
echo "  of which cached:           $total_cached"
echo "  of which fresh:            $((total_prompt - total_cached))"
echo "Total completion tokens:     $total_completion"
echo "Total cost:                  \$$total_cost"
echo ""
echo "Compare 'fresh' + 'cached' above against usage-log.csv's"
echo "cumulative_input_tokens + cumulative_cache_read_input_tokens,"
echo "and 'Total completion tokens' against cumulative_output_tokens."