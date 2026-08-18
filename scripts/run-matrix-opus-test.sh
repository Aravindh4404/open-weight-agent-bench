#!/bin/bash
# run-matrix.sh — TEST RUN: django-10914, Opus 5 only, all 3 harnesses.
# Once this is confirmed working, copy this file per instance and edit the
# INSTANCE CONFIG block for each of the remaining 4.

set -uo pipefail

# ============ INSTANCE CONFIG — edit per instance ============
INSTANCE_ID="django-10914"
REPO_URL="https://github.com/django/django.git"
BASE_COMMIT="e7fd69d051eaa67cb17f172a39b57253e9cb831a"
PROMPT_FILE="$(pwd)/prompt-${INSTANCE_ID}.txt"
PIP_INSTALL_CMD="pip install -e ."
PYTHON_VERSION="3.9"

# === MODEL CONFIG — Opus 5 only ===
MODEL_SLUGS=("")                 # empty = subscription branch below
MODEL_NAMES=("opus")
OPUS_SLUG_FOR_OPENROUTER="anthropic/claude-opus-5"   # !!! VERIFY THIS ON openrouter.ai/models BEFORE RUNNING !!!
# ================================================================

BASE_DIR="$HOME/open-weight-agent-bench/tasks/${INSTANCE_ID}"
RESULTS_CSV="$HOME/open-weight-agent-bench/comparison-results.csv"
CLAUDE_LOG="$HOME/open-weight-agent-bench/claude-usage-log.csv"
PI_LOG="$HOME/open-weight-agent-bench/pi-usage-log.csv"

get_claude_tokens_since() {
  local before_count="$1"
  tail -n +$((before_count + 1)) "$CLAUDE_LOG" 2>/dev/null | \
    awk -F',' '{sum+=$NF} END {print sum+0}'
}

get_pi_tokens_since() {
  local before_count="$1"
  tail -n +$((before_count + 1)) "$PI_LOG" 2>/dev/null | \
    awk -F',' '{sum+=$8} END {print sum+0}'
}

log_line_count() {
  local f="$1"
  [ -f "$f" ] && wc -l < "$f" || echo 0
}

HARNESSES=("claude" "pi" "opencode")

if [ ! -f "$PROMPT_FILE" ]; then
  echo "ERROR: $PROMPT_FILE not found. Put the verbatim problem_statement in it first."
  exit 1
fi

mkdir -p "$BASE_DIR"

CLEAN_SETTINGS_FILE="/tmp/clean-settings.json"
cat > "$CLEAN_SETTINGS_FILE" << 'SETTINGSEOF'
{}
SETTINGSEOF

# NOTE: still 5 columns here — matches the script's own output format.
# You will need to manually append pass_fail + verification_method after
# grading, same as every prior instance, since your real
# comparison-results.csv uses 7 columns.
if [ ! -f "$RESULTS_CSV" ]; then
  echo "instance_id,harness,model,elapsed_real_seconds,total_tokens" > "$RESULTS_CSV"
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
  local dir="$1" model="$2"
  cd "$dir"
  source venv/Scripts/activate
  unset GBRAIN_MODEL

  if [ -z "$model" ]; then
    unset ANTHROPIC_BASE_URL ANTHROPIC_AUTH_TOKEN ANTHROPIC_API_KEY
    export ANTHROPIC_MODEL="claude-opus-5"   # FIXED: was hardcoded to sonnet before
  else
    export ANTHROPIC_BASE_URL="https://openrouter.ai/api"
    export ANTHROPIC_AUTH_TOKEN="${OPENROUTER_API_KEY:-}"
    unset ANTHROPIC_API_KEY
    export ANTHROPIC_MODEL="$model"
  fi
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
  local dir="$1" model="$2"
  cd "$dir"
  source venv/Scripts/activate
  unset GBRAIN_MODEL
  export ANTHROPIC_BASE_URL="https://openrouter.ai/api"
  export ANTHROPIC_AUTH_TOKEN="${OPENROUTER_API_KEY:-}"
  unset ANTHROPIC_API_KEY

  local model_arg=""
  if [ -n "$model" ]; then
    model_arg="--model openrouter/$model"
  elif [ -n "${OPUS_SLUG_FOR_OPENROUTER:-}" ]; then
    model_arg="--model openrouter/$OPUS_SLUG_FOR_OPENROUTER"
  fi

  local t0 t1
  local log_file="${dir}.log"
  t0=$(date +%s)
  pi --print "$(cat "$PROMPT_FILE")" $model_arg > "$log_file" 2>&1
  t1=$(date +%s)
  deactivate
  echo $((t1 - t0))
}

run_opencode() {
  local dir="$1" model="$2"
  cd "$dir"
  source venv/Scripts/activate
  unset GBRAIN_MODEL
  export ANTHROPIC_BASE_URL="https://openrouter.ai/api"
  export ANTHROPIC_AUTH_TOKEN="${OPENROUTER_API_KEY:-}"
  unset ANTHROPIC_API_KEY

  local model_arg=""
  if [ -n "$model" ]; then
    model_arg="--model openrouter/$model"
  elif [ -n "${OPUS_SLUG_FOR_OPENROUTER:-}" ]; then
    model_arg="--model openrouter/$OPUS_SLUG_FOR_OPENROUTER"
  fi

  local t0 t1
  local log_file="${dir}.log"
  t0=$(date +%s)
  opencode run "$(cat "$PROMPT_FILE")" $model_arg --auto > "$log_file" 2>&1
  t1=$(date +%s)
  deactivate
  echo $((t1 - t0))
}

for i in "${!MODEL_SLUGS[@]}"; do
  model="${MODEL_SLUGS[$i]}"
  model_name="${MODEL_NAMES[$i]}"

  for harness in "${HARNESSES[@]}"; do
    dir="${BASE_DIR}/clean-${harness}-${model_name}"
    echo ""
    echo "=========================================="
    echo "=== ${INSTANCE_ID} | ${harness} | ${model_name} ==="
    echo "=========================================="

    if ! setup_clean_copy "$dir"; then
      echo "SETUP FAILED for $dir — skipping"
      echo "${INSTANCE_ID},${harness},${model_name},,SETUP_FAILED" >> "$RESULTS_CSV"
      continue
    fi

    claude_before=$(log_line_count "$CLAUDE_LOG")
    pi_before=$(log_line_count "$PI_LOG")

    case "$harness" in
      claude)   elapsed=$(run_claude "$dir" "$model") ;;
      pi)       elapsed=$(run_pi "$dir" "$model") ;;
      opencode) elapsed=$(run_opencode "$dir" "$model") ;;
    esac

    tokens=""
    case "$harness" in
      claude) tokens=$(get_claude_tokens_since "$claude_before") ;;
      pi)     tokens=$(get_pi_tokens_since "$pi_before") ;;
      opencode) tokens="MANUAL" ;;
    esac

    echo "${INSTANCE_ID},${harness},${model_name},${elapsed},${tokens}" >> "$RESULTS_CSV"
    echo "Elapsed: ${elapsed}s | Tokens: ${tokens} — logged to $RESULTS_CSV"
  done
done

echo ""
echo "All 3 combos attempted for ${INSTANCE_ID} on Opus 5."
echo "Timing in: $RESULTS_CSV"
echo ""
echo "Still needed manually:"
echo "  1. Pull OpenCode's token count from OpenRouter dashboard"
echo "  2. Grade: copy each fix into grading/, run the FAIL_TO_PASS test, record pass/fail"
echo "  3. Append pass_fail + verification_method to the CSV rows (remove-then-append pattern)"
