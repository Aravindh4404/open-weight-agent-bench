#!/usr/bin/env bash
# Claude Code "Stop" hook: appends one row PER MODEL SEEN SO FAR in the
# session, with cumulative token usage for that model, plus a routing
# breakdown (OpenRouter-shaped ids vs not).
#
# CONFIRMED BUG FIX (2026-07-16): Claude Code writes MULTIPLE transcript
# lines per real API request. This script dedupes by message.id first
# (keeping the LAST line per id) before summing anything. Verified
# against OpenRouter's own per-session log, token-for-token.
#
# total_input_tokens_incl_cache = input_tokens + cache_creation_input_tokens
# + cache_read_input_tokens. Anthropic's API splits prompt tokens into
# those three separate fields, but OpenRouter's dashboard shows a single
# combined "Input" figure per request -- this column is added so you can
# compare directly against OpenRouter's website without doing that
# addition by hand every time.
#
# Values are cumulative per (session_id, model) -- the LAST row for a
# given session+model pair holds that pairing's final totals. See
# hooks/summarize-usage.sh.
#
# Never blocks the Stop event: any failure here degrades to a no-op.

set -uo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
CSV_FILE="$PROJECT_DIR/usage-log.csv"
DEBUG_FILE="$PROJECT_DIR/usage-log.debug.jsonl"

if ! command -v jq >/dev/null 2>&1; then
  exit 0
fi

input="$(cat)"

session_id="$(printf '%s' "$input" | jq -r '.session_id // ""' 2>/dev/null)"
transcript_path="$(printf '%s' "$input" | jq -r '.transcript_path // ""' 2>/dev/null)"

[ -n "$transcript_path" ] && [ -f "$transcript_path" ] || exit 0

summary="$(jq -s -c '
  [ .[] | select(.type == "assistant" and .message.usage != null) ] as $all_lines
  | ($all_lines | group_by(.message.id) | map(last)) as $deduped
  | ($deduped | group_by(.message.model // "unknown")) as $groups
  | [ $groups[] | {
      model: (.[0].message.model // "unknown"),
      turns: length,
      input_tokens: (map(.message.usage.input_tokens // 0) | add // 0),
      output_tokens: (map(.message.usage.output_tokens // 0) | add // 0),
      cache_creation_input_tokens: (map(.message.usage.cache_creation_input_tokens // 0) | add // 0),
      cache_read_input_tokens: (map(.message.usage.cache_read_input_tokens // 0) | add // 0),
      openrouter_routed: (map(select((.message.id // "") | startswith("gen-"))) | length),
      other_routed: (map(select(((.message.id // "") | startswith("gen-")) | not)) | length)
    }
    | . + { total_input_tokens_incl_cache: (.input_tokens + .cache_creation_input_tokens + .cache_read_input_tokens) }
  ]
' "$transcript_path" 2>/dev/null)"

[ -n "$summary" ] && [ "$summary" != "[]" ] || exit 0

printf '%s\n' "$summary" >> "$DEBUG_FILE"

timestamp="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
harness="${HARNESS_NAME:-claude-code}"
env_model="${ANTHROPIC_MODEL:-}"

if [ ! -f "$CSV_FILE" ]; then
  printf 'timestamp,session_id,harness,env_model,transcript_model,unique_requests_so_far,cumulative_input_tokens,cumulative_output_tokens,cumulative_cache_creation_input_tokens,cumulative_cache_read_input_tokens,total_input_tokens_incl_cache,openrouter_routed_count,other_routed_count\n' > "$CSV_FILE"
fi

printf '%s' "$summary" | jq -c '.[]' | while IFS= read -r group; do
  model="$(printf '%s' "$group" | jq -r '.model')"
  turns="$(printf '%s' "$group" | jq -r '.turns')"
  input_tokens="$(printf '%s' "$group" | jq -r '.input_tokens')"
  output_tokens="$(printf '%s' "$group" | jq -r '.output_tokens')"
  cache_creation="$(printf '%s' "$group" | jq -r '.cache_creation_input_tokens')"
  cache_read="$(printf '%s' "$group" | jq -r '.cache_read_input_tokens')"
  total_input="$(printf '%s' "$group" | jq -r '.total_input_tokens_incl_cache')"
  openrouter_routed="$(printf '%s' "$group" | jq -r '.openrouter_routed')"
  other_routed="$(printf '%s' "$group" | jq -r '.other_routed')"

  printf '%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s\n' \
    "$timestamp" "$session_id" "$harness" "$env_model" "$model" "$turns" \
    "$input_tokens" "$output_tokens" "$cache_creation" "$cache_read" \
    "$total_input" "$openrouter_routed" "$other_routed" >> "$CSV_FILE"
done

exit 0
