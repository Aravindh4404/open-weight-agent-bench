#!/usr/bin/env bash
# Rolls up hooks/log-usage.sh's usage-log.csv into per-session totals.
#
# log-usage.sh writes CUMULATIVE totals on every Stop event (one row can
# already include everything from earlier rows in the same session), so
# this script takes the LAST row per session_id rather than summing all
# rows for that session — summing would double-count.
#
# Expects the 10-column schema:
#   timestamp,session_id,harness,env_model,transcript_model,
#   assistant_turns_so_far,cumulative_input_tokens,cumulative_output_tokens,
#   cumulative_cache_creation_input_tokens,cumulative_cache_read_input_tokens
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
if [ "$header_cols" != "10" ]; then
  echo "WARNING: $CSV_FILE header has $header_cols columns, expected 10." >&2
  echo "This usually means the file mixes rows from an older script version. Back it up and delete it," >&2
  echo "then re-run a task so log-usage.sh recreates it with the current schema." >&2
  exit 1
fi

awk -F',' -v filter="$SESSION_FILTER" '
  NR == 1 { next } # skip header
  NF != 10 { next } # skip any stale/mismatched rows instead of misreading them
  filter != "" && $2 != filter { next }
  {
    # Overwrite (not accumulate) per session_id -- rows are appended in
    # chronological order and each one is already a cumulative total, so
    # the last row seen for a session is that session final answer.
    key = $2
    harness[key]  = $3
    model[key]    = $5
    turns[key]    = $6
    in_tok[key]   = $7
    out_tok[key]  = $8
    cache_c[key]  = $9
    cache_r[key]  = $10
  }
  END {
    printf "%-38s %-22s %-25s %6s %10s %10s %10s %10s\n", \
      "session_id", "harness", "transcript_model", "turns", "input", "output", "cache_c", "cache_r"
    for (k in turns) {
      printf "%-38s %-22s %-25s %6d %10d %10d %10d %10d\n", \
        k, harness[k], model[k], turns[k], in_tok[k], out_tok[k], cache_c[k], cache_r[k]
    }
  }
' "$CSV_FILE"
