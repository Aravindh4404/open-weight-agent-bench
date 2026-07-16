#!/usr/bin/env bash
# Claude Code `Stop` hook: appends one row per turn to usage-log.csv with
# CUMULATIVE token usage for the whole session, pulled from the transcript.
#
# Values are cumulative (sum of every assistant message's usage block seen
# so far), not per-turn deltas — a single user turn can produce multiple
# assistant JSONL lines (one per tool-call round), so summing the whole
# transcript on every Stop event is simpler and safer than trying to track
# a per-turn delta. This means the LAST row for a session already holds
# that session's final totals — see hooks/summarize-usage.sh.
#
# Field paths (message.usage.input_tokens etc.) were confirmed empirically
# against a real transcript on 2026-07-16 (Claude Code v2.1.211) — Claude
# Code does not publish this schema and it can change between releases.
# If usage-log.csv ever shows 0s/blanks again, check usage-log.debug.jsonl
# (the raw transcript line last read) and cross-check against /cost.
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

# Sum usage across every assistant message in the transcript so far (a
# single user turn can span multiple assistant lines, one per tool-call
# round), and grab the model off the last one.
summary="$(jq -s -c '
  [ .[] | select(.type == "assistant" and .message.usage != null) ] as $au
  | {
      turns: ($au | length),
      model: (($au | last).message.model // ""),
      input_tokens: ($au | map(.message.usage.input_tokens // 0) | add // 0),
      output_tokens: ($au | map(.message.usage.output_tokens // 0) | add // 0),
      cache_creation_input_tokens: ($au | map(.message.usage.cache_creation_input_tokens // 0) | add // 0),
      cache_read_input_tokens: ($au | map(.message.usage.cache_read_input_tokens // 0) | add // 0)
    }
' "$transcript_path" 2>/dev/null)"

[ -n "$summary" ] || exit 0

printf '%s\n' "$summary" >> "$DEBUG_FILE"

turns="$(printf '%s' "$summary" | jq -r '.turns // 0' 2>/dev/null)"
[ "$turns" != "0" ] || exit 0

model="$(printf '%s' "$summary" | jq -r '.model // ""' 2>/dev/null)"
input_tokens="$(printf '%s' "$summary" | jq -r '.input_tokens // 0' 2>/dev/null)"
output_tokens="$(printf '%s' "$summary" | jq -r '.output_tokens // 0' 2>/dev/null)"
cache_creation="$(printf '%s' "$summary" | jq -r '.cache_creation_input_tokens // 0' 2>/dev/null)"
cache_read="$(printf '%s' "$summary" | jq -r '.cache_read_input_tokens // 0' 2>/dev/null)"

timestamp="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
harness="${HARNESS_NAME:-claude-code}"
env_model="${ANTHROPIC_MODEL:-}"

if [ ! -f "$CSV_FILE" ]; then
  printf 'timestamp,session_id,harness,env_model,transcript_model,assistant_turns_so_far,cumulative_input_tokens,cumulative_output_tokens,cumulative_cache_creation_input_tokens,cumulative_cache_read_input_tokens\n' > "$CSV_FILE"
fi

printf '%s,%s,%s,%s,%s,%s,%s,%s,%s,%s\n' \
  "$timestamp" "$session_id" "$harness" "$env_model" "$model" "$turns" \
  "$input_tokens" "$output_tokens" "$cache_creation" "$cache_read" >> "$CSV_FILE"

exit 0
