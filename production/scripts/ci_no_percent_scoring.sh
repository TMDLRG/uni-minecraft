#!/usr/bin/env bash
# ci_no_percent_scoring.sh — CI mirror of .claude/hooks/no_percent_scoring.py (A-A5).
#
# Fails CI when any staged docs/receipts/*.md file has a headline percent-score
# OR is missing frontmatter with `verdict:` + `evidence_class:`.
#
# Env: UNI_RECEIPT_LINT_BYPASS=1 -> allow (still reported).

set -euo pipefail

base="${GITHUB_BASE_REF_SHA:-$(git merge-base HEAD origin/main 2>/dev/null || git rev-parse HEAD~1 2>/dev/null || echo)}"
[ -z "$base" ] && base="HEAD~1"

mapfile -t staged < <(git diff --name-only --diff-filter=ACM "${base}" HEAD 2>/dev/null | grep -E '^docs/receipts/.*\.md$' || true)
[ "${#staged[@]}" -eq 0 ] && { echo "ci_no_percent_scoring: no receipts touched — OK"; exit 0; }

problems=0
for f in "${staged[@]}"; do
  [ -f "$f" ] || continue

  # Frontmatter present?
  if ! head -1 "$f" | grep -q '^---$'; then
    echo "  $f: missing YAML frontmatter"; problems=$((problems+1)); continue
  fi

  # Verdict + evidence_class present?
  fm=$(awk '/^---$/{c++; if(c==2) exit; next} c==1' "$f")
  if ! echo "$fm" | grep -qE '^verdict:[[:space:]]*(PASS|PARTIAL|FAIL|WITHHELD)$'; then
    echo "  $f: missing/invalid 'verdict:' (need PASS|PARTIAL|FAIL|WITHHELD)"; problems=$((problems+1))
  fi
  if ! echo "$fm" | grep -qE '^evidence_class:[[:space:]]*(A|B|C|Sec|pending)$'; then
    echo "  $f: missing/invalid 'evidence_class:' (need A|B|C|Sec|pending)"; problems=$((problems+1))
  fi

  # Headline percent-score?
  if grep -nE '^(#{1,6}[[:space:]]+.*|\|.*|[-*][[:space:]]+\*\*.*\*\*.*)\<[0-9]{1,3}[[:space:]]*%\>' "$f"; then
    echo "  $f: headline percent-score — honest verdicts only"; problems=$((problems+1))
  fi
done

if [ "$problems" -gt 0 ]; then
  if [ "${UNI_RECEIPT_LINT_BYPASS:-}" = "1" ]; then
    echo "ci_no_percent_scoring: ${problems} problems, BYPASS accepted" >&2
    exit 0
  fi
  echo "ci_no_percent_scoring: REFUSED — ${problems} receipt problems." >&2
  exit 2
fi
echo "ci_no_percent_scoring: OK"
exit 0
