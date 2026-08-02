#!/usr/bin/env bash
# ci_fe_touch_check.sh — CI mirror of .claude/hooks/fe_touch_needs_verdict.py (A-A3).
#
# Fails CI when the pending push contains changes to FE files without a
# matching docs/receipts/lab_team_review_<sha>.md that references the pushed HEAD.
#
# Env:
#   UNI_SHIP_GATE_BYPASS=1 + UNI_SHIP_GATE_BYPASS_REASON=<why> -> allow.
#   GITHUB_SHA / CI_COMMIT_SHA / HEAD auto-detected.
#
# Exit: 0 clean; 2 refused; 1 tool failure.

set -euo pipefail

FE_SCOPE=(
  "lib/sp/brain/infer.ex"
  "lib/sp/brain/efe.ex"
  "lib/sp/brain/plan.ex"
  "lib/sp/brain/learn.ex"
  "lib/sp/brain/precision.ex"
  "lib/sp/brain/novelty.ex"
  "lib/sp/brain/designer.ex"
  "lib/sp/brain/model.ex"
  "lib/sp/brain/genome.ex"
  "lib/sp/brain/factors.ex"
  "lib/sp/brain/homeostat.ex"
  "lib/sp/brain/metabolism.ex"
  "lib/sp/brain/motor.ex"
  "lib/sp/brain/motor_control.ex"
  "lib/sp/brain/slow_context.ex"
  "lib/sp/brain/hierarchy2.ex"
)

# Determine the SHA range to inspect.
head_sha="${GITHUB_SHA:-${CI_COMMIT_SHA:-$(git rev-parse HEAD 2>/dev/null || echo)}}"
if [ -z "${head_sha}" ]; then
  echo "ci_fe_touch_check: could not determine HEAD SHA; skipping (fail-open in CI-less runs)" >&2
  exit 0
fi

# The push's newly-introduced diff vs origin/main (fallback to HEAD~1).
base="$(git merge-base "${head_sha}" origin/main 2>/dev/null || git rev-parse "${head_sha}"~1 2>/dev/null || echo)"
if [ -z "${base}" ]; then
  echo "ci_fe_touch_check: no base ref found; treating as full HEAD scan" >&2
  base="${head_sha}"
fi

# Files touched between base..HEAD.
mapfile -t touched < <(git diff --name-only "${base}" "${head_sha}" 2>/dev/null | tr '\\' '/')
fe_dirty=()
for f in "${touched[@]}"; do
  for scope in "${FE_SCOPE[@]}"; do
    if [ "$f" = "$scope" ]; then
      fe_dirty+=("$f")
    fi
  done
done

if [ "${#fe_dirty[@]}" -eq 0 ]; then
  exit 0
fi

# Look for a matching receipt.
short_sha="${head_sha:0:7}"
found_receipt=""
if compgen -G "docs/receipts/lab_team_review_*.md" > /dev/null; then
  for r in docs/receipts/lab_team_review_*.md; do
    if grep -qE "\\b${short_sha}\\b|\\b${head_sha}\\b" "$r"; then
      found_receipt="$r"; break
    fi
  done
fi

if [ -n "${found_receipt}" ]; then
  echo "ci_fe_touch_check: OK — MERGED VERDICT receipt found (${found_receipt})"
  exit 0
fi

if [ "${UNI_SHIP_GATE_BYPASS:-}" = "1" ]; then
  reason="${UNI_SHIP_GATE_BYPASS_REASON:-}"
  if [ -z "${reason// /}" ]; then
    echo "ci_fe_touch_check: bypass requested but UNI_SHIP_GATE_BYPASS_REASON empty — REFUSED" >&2
    exit 2
  fi
  echo "ci_fe_touch_check: BYPASS accepted with reason='${reason}'" >&2
  exit 0
fi

{
  echo "ci_fe_touch_check: REFUSED — FE files touched without MERGED VERDICT receipt."
  echo "Head: ${head_sha}"
  echo "FE files dirty:"
  for f in "${fe_dirty[@]}"; do echo "  - $f"; done
  echo ""
  echo "Fix: run runs/lab_team_review.exs against ${short_sha}, land"
  echo "docs/receipts/lab_team_review_${short_sha}.md, and re-run CI."
} >&2
exit 2
