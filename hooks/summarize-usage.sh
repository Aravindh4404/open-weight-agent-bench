#!/usr/bin/env bash
# Rolls up hooks/log-usage.sh's usage-log.csv into per-(session, model)
# totals, taking the LAST row for each pair (cumulative, not summed).
#
# Includes total_input_tokens_incl_cache, which matches OpenRouter's
# single "Input" figure directly (input + cache_creation + cache_read
# combined) -- no manual addition needed to compare against the website.
#
# Also flags any session that shows more than one model, or any row with
# a non-zero "other_routed" count.
#
# Expects the 13-column schema:
#   timestamp,session_id,harness,env_model,transcript_model,
#   unique_requests_so_far,cumulative_input_tokens,cumulative_output_tokens,
#   cumulative_cache_creation_input_tokens,cumulative_cache_read_input_tokens,
#   total_input_tokens_incl_cache,openrouter_routed_count,other_routed_count
#
# Usage:
#   ./hooks/summarize-usage.sh              # every session
#   ./hooks/summarize-usage.sh <session-id> # just one session (~= one task)

set -uo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
CSV_FILE="$PROJECT_DIR/usage-log.csv"
SESSION_FILTER="${1:-}"

if [ ! -f "$CSV_FILE" ]; then
  echo "No usage log found at $CSV_FILE — run a task with the Stop hook registered first." >&2
  exit 1
fi

header="$(head -n 1 "$CSV_FILE")"
header_cols="$(echo "$header" | awk -F',' '{print NF}')"
if [ "$header_cols" != "13" ]; then
  echo "WARNING: $CSV_FILE header has $header_cols columns, expected 13." >&2
  echo "This usually means the file mixes rows from an older script version. Back it up and delete it," >&2
  echo "then re-run a task so log-usage.sh recreates it with the current schema." >&2
  exit 1
fi

awk -F',' -v filter="$SESSION_FILTER" '
  NR == 1 { next }
  NF != 13 { next }
  filter != "" && $2 != filter { next }
  {
    key = $2 "|" $5   # session_id | transcript_model
    harness[key]  = $3
    turns[key]    = $6
    in_tok[key]   = $7
    out_tok[key]  = $8
    cache_c[key]  = $9
    cache_r[key]  = $10
    total_in[key] = $11
    or_routed[key] = $12
    other_routed[key] = $13
    models_seen[$2] = models_seen[$2] " " $5
    sessions[$2] = 1
  }
  END {
    printf "%-38s %-22s %-22s %6s %10s %10s %6s %8s\n", \
      "session_id", "harness", "model", "turns", "total_in", "output", "via_or", "other"
    for (k in turns) {
      split(k, parts, "|")
      printf "%-38s %-22s %-22s %6d %10d %10d %6d %8d\n", \
        parts[1], harness[k], parts[2], turns[k], total_in[k], out_tok[k], or_routed[k], other_routed[k]
    }
    print ""
    print "--- Contamination checks ---"
    for (s in sessions) {
      n = split(models_seen[s], seen, " ")
      delete uniq
      distinct = 0
      for (i = 1; i <= n; i++) {
        if (seen[i] != "" && !(seen[i] in uniq)) { uniq[seen[i]] = 1; distinct++ }
      }
      if (distinct > 1) {
        printf "⚠ session %s used %d different models:%s\n", s, distinct, models_seen[s]
      }
    }
    for (k in other_routed) {
      if (other_routed[k] + 0 > 0) {
        split(k, parts, "|")
        printf "⚠ session %s / model %s has %d message(s) NOT matching the OpenRouter id pattern -- verify these actually went through OpenRouter\n", parts[1], parts[2], other_routed[k]
      }
    }
  }
' "$CSV_FILE"
