#!/bin/bash
# run-matrix.sh — fully automates one SWE-bench instance's harness x model
# comparison, with timing AND tokens captured automatically for Claude Code
# and Pi. OpenCode tokens still require a manual OpenRouter dashboard pull
# (no reliable per-session command exists for it yet).
#
# CONFIRMED non-interactive invocations (from `--help` output):
#   Claude Code: claude --permission-mode acceptEdits -p "<prompt>"
#   Pi:          pi --print "<prompt>" --model openrouter/<id>
#   OpenCode:    opencode run "<prompt>" --model openrouter/<id> --auto
#
# !!! REQUIRED BEFORE RUNNING !!!
# Claude Code token logging needs the OTLP receiver running in a SEPARATE
# terminal the whole time this script runs, or claude-usage-log.csv never
# gets written and Claude's token count will always show 0:
#   cd ~/open-weight-agent-bench && node claude-otlp-receiver.js
# Pi logs automatically via its own extension — no separate step needed.
#
# Each combo's own harness output (its reasoning/summary) is saved to
# <combo-folder>.log alongside the cloned repo, e.g. clean-claude-glm.log
# — kept separate from the results CSV on purpose, so the harness's own
# printed text never corrupts the timing/token columns.
#
# STILL NOT AUTOMATED (deliberately — do these manually after the script runs):
#   - Grading (copy the fix into a grading/ copy, run the FAIL_TO_PASS test).
#     Different repos need different test runners (pytest vs Django's
#     runtests.py, etc.) — worth eyeballing each one for now.
#   - OpenCode token counts (see note above).
#
# USAGE:
#   1. Fill in INSTANCE CONFIG below.
#   2. Save the verbatim problem_statement into PROMPT_FILE.
#   3. bash run-matrix.sh

set -uo pipefail  # not -e: one failed combo shouldn't kill the whole run

BENCH_ROOT="$HOME/open-weight-agent-bench"

# ============ INSTANCE CONFIG — edit per instance ============
# Every value can also be overridden from the environment, so a single lane can
# be test-run without editing (and then having to un-edit) this file:
#   INSTANCE_ID=flask-4045 REPO_URL=https://github.com/pallets/flask.git \
#   BASE_COMMIT=d8c37f4... PIP_INSTALL_CMD="pip install -e . && pip install pytest" \
#   HARNESS_LIST=claude MODEL_LIST=opus bash scripts/run-matrix.sh
INSTANCE_ID="${INSTANCE_ID:-xarray-4094}"
REPO_URL="${REPO_URL:-https://github.com/pydata/xarray.git}"
BASE_COMMIT="${BASE_COMMIT:-a64cf2d5476e7bbda099b34c40b7be1880dbd39a}"
PROMPT_FILE="${PROMPT_FILE:-${BENCH_ROOT}/prompt-${INSTANCE_ID}.txt}"
PIP_INSTALL_CMD="${PIP_INSTALL_CMD:-SETUPTOOLS_SCM_PRETEND_VERSION=0.15.2 pip install -e . && pip install 'numpy<1.24' 'pandas<1.4' pytest}"
PYTHON_VERSION="${PYTHON_VERSION:-3.9}"

# ============ MODEL REGISTRY ============
# Each lane model has TWO ids: the native Anthropic model id used when Claude
# Code talks to Anthropic directly, and the OpenRouter slug used by Pi and
# OpenCode (and by Claude Code for non-Anthropic models like GLM).
#
# WHY THIS IS A REGISTRY NOW: the previous scheme encoded "run natively" as an
# EMPTY model slug, and the native id was hardcoded to claude-sonnet-5 at the
# call site. Any lane labelled something other than sonnet on that path would
# have silently run Sonnet while being recorded under the other name. Both ids
# are now declared explicitly per model, and an unknown model name is a hard
# error rather than a silent fallback.
#
# A model with an empty native id (GLM) has no direct Anthropic route and always
# goes through OpenRouter, including for Claude Code.
model_native() {
  case "$1" in
    glm)    echo "" ;;
    sonnet) echo "claude-sonnet-5" ;;
    opus)   echo "claude-opus-5" ;;
    *)      return 1 ;;
  esac
}
model_openrouter() {
  case "$1" in
    glm)    echo "z-ai/glm-5.2" ;;
    sonnet) echo "anthropic/claude-sonnet-5" ;;
    opus)   echo "anthropic/claude-opus-5" ;;
    *)      return 1 ;;
  esac
}

# Space-separated overrides, e.g. MODEL_LIST="glm opus" HARNESS_LIST="claude"
read -r -a MODEL_NAMES <<< "${MODEL_LIST:-glm opus}"
read -r -a HARNESSES <<< "${HARNESS_LIST:-claude pi opencode}"
# ================================================================
BASE_DIR="${BENCH_ROOT}/tasks/${INSTANCE_ID}"
RESULTS_CSV="${BENCH_ROOT}/comparison-results.csv"
FULL_RESULTS_CSV="${BENCH_ROOT}/comparison-results-full.csv"
SNAP_DIR="$(mktemp -d)"
trap 'rm -rf "$SNAP_DIR"' EXIT

# Per-lane token capture.
#
# PREVIOUSLY: this script counted lines in the harness log before/after a lane
# and awk-summed ONLY the total column, throwing away input/output/cache before
# anything was written. That is why comparison-results.csv ended up total-only
# for all 30 rows of the first matrix, and why recovering the breakdown later
# needed an archaeology pass over claude-otlp-raw.jsonl, Pi's session
# transcripts, and OpenCode's SQLite DB.
#
# NOW: scripts/lane-usage.js snapshots session ids before the lane, re-reads
# after, and returns the full breakdown for whatever session appeared. Line
# counting was unreliable anyway — claude-usage-log.csv is rewritten whole by
# the OTLP receiver rather than appended to.
#
# OpenCode is no longer "MANUAL": its breakdown reads straight out of
# ~/.local/share/opencode/opencode.db (NOT the AppData path the older docs
# claim). Cross-check against OpenRouter still recommended — OpenCode's session
# counters exclude reasoning tokens and the session-title call, so they run
# slightly below the dashboard figure. If you do pull the OpenRouter CSV export,
# keep native_tokens_prompt / native_tokens_cached / native_tokens_completion as
# separate columns; never sum them to one number before recording.
snapshot_usage() {
  local harness="$1"
  node "${BENCH_ROOT}/scripts/lane-usage.js" snapshot "$harness" "${SNAP_DIR}/${harness}.ids" 2>/dev/null || true
}

# Emits: input_combined,fresh_input,output,cache_read,cache_creation,reasoning,total_tokens,session_id
diff_usage() {
  local harness="$1"
  node "${BENCH_ROOT}/scripts/lane-usage.js" diff "$harness" "${SNAP_DIR}/${harness}.ids" 2>/dev/null || echo ",,,,,,,"
}

# Fail fast on an unknown model name rather than silently running the wrong
# model for an entire matrix — the exact failure mode the old empty-slug
# convention allowed.
for m in "${MODEL_NAMES[@]}"; do
  if ! model_openrouter "$m" >/dev/null; then
    echo "ERROR: unknown model '$m'. Add it to model_native/model_openrouter first."
    exit 1
  fi
done

if [ ! -f "$PROMPT_FILE" ]; then
  echo "ERROR: $PROMPT_FILE not found. Put the verbatim problem_statement in it first."
  exit 1
fi

mkdir -p "$BASE_DIR"

CLEAN_SETTINGS_FILE="/tmp/clean-settings.json"
cat > "$CLEAN_SETTINGS_FILE" << 'SETTINGSEOF'
{}
SETTINGSEOF

# comparison-results.csv stays for backward compatibility with anything already
# reading it. comparison-results-full.csv is canonical going forward.
if [ ! -f "$RESULTS_CSV" ]; then
  echo "instance_id,harness,model,elapsed_real_seconds,total_tokens,pass_fail,verification_method" > "$RESULTS_CSV"
fi
if [ ! -f "$FULL_RESULTS_CSV" ]; then
  echo "instance_id,harness,model,elapsed_real_seconds,input_combined,fresh_input,output,cache_read,cache_creation,total_tokens,pass_fail,verification_method,reasoning,breakdown_total,total_delta,match_quality,session_id" > "$FULL_RESULTS_CSV"
fi

setup_clean_copy() {
  local dir="$1"
  rm -rf "$dir"
  git clone "$REPO_URL" "$dir" || return 1
  ( cd "$dir" \
    && git checkout "$BASE_COMMIT" \
    && rm -rf .git \
    && touch .git \
    && py -"$PYTHON_VERSION" -m venv venv \
    && source venv/Scripts/activate \
    && eval "$PIP_INSTALL_CMD" \
    && deactivate )
}

run_claude() {
  local dir="$1" model_name="$2"
  local native openrouter
  native="$(model_native "$model_name")"
  openrouter="$(model_openrouter "$model_name")"
  cd "$dir"
  source venv/Scripts/activate

  # GBRAIN_MODEL, if set, overrides the model Claude Code actually uses and
  # would silently invalidate the lane. Always cleared.
  unset GBRAIN_MODEL
  if [ -n "$native" ]; then
    # Direct Anthropic route — relies on the ambient Claude Code login.
    unset ANTHROPIC_BASE_URL ANTHROPIC_AUTH_TOKEN ANTHROPIC_API_KEY
    export ANTHROPIC_MODEL="$native"
  else
    export ANTHROPIC_BASE_URL="https://openrouter.ai/api"
    export ANTHROPIC_AUTH_TOKEN="${OPENROUTER_API_KEY:-}"
    unset ANTHROPIC_API_KEY
    export ANTHROPIC_MODEL="$openrouter"
  fi
  echo "  [claude] ANTHROPIC_MODEL=${ANTHROPIC_MODEL} base=${ANTHROPIC_BASE_URL:-native}" >&2
  export CLAUDE_CODE_ENABLE_TELEMETRY=1
  export OTEL_METRICS_EXPORTER=otlp
  export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
  export OTEL_EXPORTER_OTLP_PROTOCOL=http/json
  export OTEL_METRIC_EXPORT_INTERVAL=5000

  local t0 t1
  local log_file="${dir}.log"
  t0=$(date +%s)
  claude --settings "$CLEAN_SETTINGS_FILE" --dangerously-skip-permissions -p "$(cat "$PROMPT_FILE")" > "$log_file" 2>&1
  t1=$(date +%s)
  deactivate
  echo $((t1 - t0))
}

run_pi() {
  local dir="$1" model_name="$2"
  local openrouter
  openrouter="$(model_openrouter "$model_name")"
  cd "$dir"
  source venv/Scripts/activate
  export ANTHROPIC_BASE_URL="https://openrouter.ai/api"
  export ANTHROPIC_AUTH_TOKEN="${OPENROUTER_API_KEY:-}"
  unset ANTHROPIC_API_KEY

  local model_arg="--model openrouter/$openrouter"
  echo "  [pi] $model_arg" >&2

  local t0 t1
  local log_file="${dir}.log"
  t0=$(date +%s)
  pi --print "$(cat "$PROMPT_FILE")" $model_arg > "$log_file" 2>&1
  t1=$(date +%s)
  deactivate
  echo $((t1 - t0))
}

run_opencode() {
  local dir="$1" model_name="$2"
  local openrouter
  openrouter="$(model_openrouter "$model_name")"
  cd "$dir"
  source venv/Scripts/activate
  export ANTHROPIC_BASE_URL="https://openrouter.ai/api"
  export ANTHROPIC_AUTH_TOKEN="${OPENROUTER_API_KEY:-}"
  unset ANTHROPIC_API_KEY

  local model_arg="--model openrouter/$openrouter"
  echo "  [opencode] $model_arg" >&2

  local t0 t1
  local log_file="${dir}.log"
  t0=$(date +%s)
  opencode run "$(cat "$PROMPT_FILE")" $model_arg --auto > "$log_file" 2>&1
  t1=$(date +%s)
  deactivate
  echo $((t1 - t0))
}

for model_name in "${MODEL_NAMES[@]}"; do
  for harness in "${HARNESSES[@]}"; do
    dir="${BASE_DIR}/clean-${harness}-${model_name}"
    echo ""
    echo "=========================================="
    echo "=== ${INSTANCE_ID} | ${harness} | ${model_name} ==="
    echo "=========================================="

    if ! setup_clean_copy "$dir"; then
      echo "SETUP FAILED for $dir — skipping"
      echo "${INSTANCE_ID},${harness},${model_name},,SETUP_FAILED,," >> "$RESULTS_CSV"
      echo "${INSTANCE_ID},${harness},${model_name},,,,,,,SETUP_FAILED,,,,,setup_failed," >> "$FULL_RESULTS_CSV"
      continue
    fi

    snapshot_usage "$harness"

    case "$harness" in
      claude)   elapsed=$(run_claude "$dir" "$model_name") ;;
      pi)       elapsed=$(run_pi "$dir" "$model_name") ;;
      opencode) elapsed=$(run_opencode "$dir" "$model_name") ;;
    esac

    usage=$(diff_usage "$harness")
    IFS=',' read -r u_input u_fresh u_output u_cread u_ccreate u_reason u_total u_session <<< "$usage"

    if [ -z "$u_total" ]; then
      # Lane ran but no new session showed up in the harness's log. Record it as
      # a gap rather than a zero — a silent 0 reads as "this lane was free".
      u_total="NO_USAGE_CAPTURED"
      match_quality="missing"
    else
      match_quality="live_capture"
    fi

    # total_tokens here is the live-captured figure; breakdown_total is the same
    # number at capture time. They diverge only if the total is later corrected
    # against OpenRouter (expected for opencode) — total_delta then records it.
    echo "${INSTANCE_ID},${harness},${model_name},${elapsed},${u_total},," >> "$RESULTS_CSV"
    echo "${INSTANCE_ID},${harness},${model_name},${elapsed},${u_input},${u_fresh},${u_output},${u_cread},${u_ccreate},${u_total},,,${u_reason},${u_total},0,${match_quality},${u_session}" >> "$FULL_RESULTS_CSV"

    echo "Elapsed: ${elapsed}s | Total: ${u_total} (in=${u_input} out=${u_output} cache_r=${u_cread} cache_w=${u_ccreate})"
    echo "  -> $FULL_RESULTS_CSV"
  done
done

echo ""
echo "All ${#HARNESSES[@]}x${#MODEL_NAMES[@]} combos attempted for ${INSTANCE_ID} (models: ${MODEL_NAMES[*]})."
echo "Canonical results (full breakdown): $FULL_RESULTS_CSV"
echo "Backward-compat totals:            $RESULTS_CSV"
echo ""
echo "Still needed manually, per combo:"
echo "  1. Grade: copy the fix into grading/, run the FAIL_TO_PASS test, then fill"
echo "     pass_fail + verification_method in BOTH csvs."
echo "  2. OpenCode only: optionally cross-check the total against OpenRouter."
echo "     Its DB counters exclude reasoning tokens and the session-title call,"
echo "     so expect the dashboard to read a few hundred to a few thousand higher."
