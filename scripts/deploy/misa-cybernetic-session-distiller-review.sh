#!/usr/bin/env bash
set -euo pipefail
umask 077

ENV_FILE="${MISA_SESSION_DISTILLER_ENV_FILE:-/etc/misa-hermes/session-distiller.env}"
if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck source=/dev/null
  . "$ENV_FILE"
  set +a
fi

PROJECT_ROOT="${MISA_HERMES_PROJECT_ROOT:-/root/misa-hermes-project}"
ARTIFACT_DIR="${MISA_SESSION_DISTILLER_ARTIFACT_DIR:-$PROJECT_ROOT/artifacts/session-distiller-systemd}"
SUMMARY_OUTPUT="${MISA_SESSION_DISTILLER_SUMMARY_OUTPUT:-$ARTIFACT_DIR/session-distiller-summary.json}"
ZILLIZ_MANIFEST="${MISA_SESSION_DISTILLER_ZILLIZ_MANIFEST:-$ARTIFACT_DIR/zilliz-session-chunks-manifest.jsonl}"
ZILLIZ_ROLLBACK="${MISA_SESSION_DISTILLER_ZILLIZ_ROLLBACK:-$ARTIFACT_DIR/zilliz-session-chunks-rollback.json}"
LLM_OUTPUT="${MISA_SESSION_DISTILLER_LLM_OUTPUT:-$ARTIFACT_DIR/session-llm-distillation-summary.json}"
RUN_MODE="${MISA_SESSION_DISTILLER_RUN_MODE:-scan-dry-run}"
DISTILLER_ENABLED="${MISA_SESSION_DISTILLER_ENABLED:-false}"

REVIEW_ENABLED="${MISA_SESSION_DISTILLER_CYBERNETIC_REVIEW_ENABLED:-true}"
REVIEW_DIR="${MISA_SESSION_DISTILLER_CYBERNETIC_REVIEW_DIR:-$ARTIFACT_DIR/cybernetic-review}"
WRAPPER="${MISA_CYBERNETIC_WRAPPER:-$PROJECT_ROOT/tools/misa_cybernetic_wrapper.py}"
NODE_BIN_DIR="${MISA_CYBERNETIC_NODE_BIN_DIR:-/opt/misa-node20/bin}"
CYBERNETIC_REPO="${MISA_CYBERNETIC_REPO:-/root/misa-cybernetic-evolution}"
WORK_ORDER_INBOX_ENABLED="${MISA_SESSION_DISTILLER_WORK_ORDER_INBOX_ENABLED:-true}"
OWNER_DIGEST_ENABLED="${MISA_SESSION_DISTILLER_OWNER_DIGEST_ENABLED:-true}"
WORK_ORDER_ROOT="${MISA_CYBERNETIC_WORK_ORDER_ROOT:-$PROJECT_ROOT/work-orders/cybernetic}"

mkdir -p "$REVIEW_DIR"

write_status() {
  local status="$1"
  local reason="$2"
  local exit_code="${3:-0}"
  {
    printf 'status=%s\n' "$status"
    printf 'reason=%s\n' "$reason"
    printf 'exit_code=%s\n' "$exit_code"
    printf 'run_mode=%s\n' "$RUN_MODE"
    printf 'summary_output=%s\n' "$SUMMARY_OUTPUT"
    printf 'timestamp_utc=%s\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  } > "$REVIEW_DIR/latest-hook-status.env"
}

if [[ "$REVIEW_ENABLED" != "true" ]]; then
  write_status "skipped" "cybernetic_review_disabled"
  exit 0
fi

if [[ "$DISTILLER_ENABLED" != "true" ]]; then
  write_status "skipped" "session_distiller_disabled"
  exit 0
fi

case "$RUN_MODE" in
  scan-dry-run|zilliz-plan-dry-run|production-write)
    ;;
  *)
    write_status "skipped" "run_mode_has_no_distiller_summary"
    exit 0
    ;;
esac

if [[ ! -s "$SUMMARY_OUTPUT" ]]; then
  write_status "skipped" "summary_output_missing"
  exit 0
fi

if [[ ! -x "$(command -v python3)" ]]; then
  write_status "failed" "python3_missing" 127
  exit 127
fi

if [[ ! -f "$WRAPPER" ]]; then
  write_status "failed" "cybernetic_wrapper_missing" 127
  exit 127
fi

if [[ -d "$NODE_BIN_DIR" ]]; then
  export PATH="$NODE_BIN_DIR:$PATH"
fi

timestamp="$(date -u +"%Y%m%dT%H%M%SZ")"
review_output="$REVIEW_DIR/session-distiller-review-$timestamp.json"
wrapper_output="$REVIEW_DIR/session-distiller-review-$timestamp.wrapper.json"

args=(
  --mode session-distiller-review
  --distiller-summary-output "$SUMMARY_OUTPUT"
  --session-review-output "$review_output"
)

case "$RUN_MODE" in
  zilliz-plan-dry-run)
    [[ -s "$ZILLIZ_MANIFEST" ]] && args+=(--zilliz-manifest-output "$ZILLIZ_MANIFEST")
    [[ -s "$ZILLIZ_ROLLBACK" ]] && args+=(--zilliz-rollback-output "$ZILLIZ_ROLLBACK")
    ;;
  production-write)
    [[ -s "$ZILLIZ_MANIFEST" ]] && args+=(--zilliz-manifest-output "$ZILLIZ_MANIFEST")
    [[ -s "$ZILLIZ_ROLLBACK" ]] && args+=(--zilliz-rollback-output "$ZILLIZ_ROLLBACK")
    [[ -s "$LLM_OUTPUT" ]] && args+=(--llm-distill-output "$LLM_OUTPUT")
    ;;
esac

cd "$PROJECT_ROOT"

set +e
python3 "$WRAPPER" "${args[@]}" > "$wrapper_output" 2>&1
exit_code=$?
set -e

if [[ "$exit_code" -ne 0 ]]; then
  write_status "failed" "cybernetic_review_failed" "$exit_code"
  exit "$exit_code"
fi

cp "$review_output" "$REVIEW_DIR/latest.json"
cp "$wrapper_output" "$REVIEW_DIR/latest.wrapper.json"

if [[ "$WORK_ORDER_INBOX_ENABLED" == "true" ]]; then
  inbox_output="$REVIEW_DIR/session-distiller-work-order-inbox-$timestamp.json"
  if [[ ! -f "$CYBERNETIC_REPO/scripts/work-order-inbox.mjs" ]]; then
    write_status "failed" "work_order_inbox_script_missing" 127
    exit 127
  fi

  set +e
  (
    cd "$CYBERNETIC_REPO"
    node scripts/work-order-inbox.mjs \
      --review-file "$review_output" \
      --root "$WORK_ORDER_ROOT" \
      --json
  ) > "$inbox_output" 2>&1
  inbox_exit_code=$?
  set -e

  if [[ "$inbox_exit_code" -ne 0 ]]; then
    write_status "failed" "work_order_inbox_export_failed" "$inbox_exit_code"
    exit "$inbox_exit_code"
  fi

  cp "$inbox_output" "$REVIEW_DIR/latest-work-order-inbox.json"

  if [[ "$OWNER_DIGEST_ENABLED" == "true" ]]; then
    owner_digest_output="$REVIEW_DIR/session-distiller-owner-digest-$timestamp.json"
    set +e
    (
      cd "$CYBERNETIC_REPO"
      node scripts/work-order-inbox.mjs \
        --owner-digest \
        --root "$WORK_ORDER_ROOT" \
        --json
    ) > "$owner_digest_output" 2>&1
    owner_digest_exit_code=$?
    set -e

    if [[ "$owner_digest_exit_code" -ne 0 ]]; then
      write_status "failed" "owner_digest_export_failed" "$owner_digest_exit_code"
      exit "$owner_digest_exit_code"
    fi

    cp "$owner_digest_output" "$REVIEW_DIR/latest-owner-digest.json"
  fi
fi

write_status "ok" "cybernetic_review_written"
