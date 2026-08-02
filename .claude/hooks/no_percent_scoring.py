#!/usr/bin/env python3
"""
no_percent_scoring.py — PreToolUse hook (A-A5 in the UNI OS+MIND Deepening Plan).

Refuses a Bash `git commit` when any staged docs/receipts/*.md file contains
a headline percent-score OR is missing the honest-verdict YAML frontmatter.

docs/LAB_PROTOCOL.md §I: "Honest verdicts only: PASS / PARTIAL / FAIL /
WITHHELD. Never percent-scored."

Frontmatter contract (A-A5):
  ---
  verdict: PASS | PARTIAL | FAIL | WITHHELD
  evidence_class: A | B | C | Sec | pending
  ---

Bypass: set UNI_RECEIPT_LINT_BYPASS=1 (audited).
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from pathlib import Path

COMMIT_CMDS = re.compile(r"\bgit\s+(commit|push|merge|rebase)\b")

HEADLINE_PERCENT_RE = re.compile(
    r"(?im)^(?:#{1,6}\s+.*?|[-*]\s+\*\*[^*]+\*\*[^*]*|\|\s*[^|]*)\b(\d{1,3})\s*%\b"
)

FRONTMATTER_RE = re.compile(r"\A---\s*\n(.*?)\n---\s*\n", re.DOTALL)
VERDICT_LINE = re.compile(r"(?m)^\s*verdict:\s*(PASS|PARTIAL|FAIL|WITHHELD)\s*$")
CLASS_LINE = re.compile(r"(?m)^\s*evidence_class:\s*(A|B|C|Sec|pending)\s*$")


def repo_root() -> Path | None:
    try:
        out = subprocess.check_output(
            ["git", "rev-parse", "--show-toplevel"], stderr=subprocess.DEVNULL,
        ).decode().strip()
        return Path(out) if out else None
    except Exception:
        return None


def staged_receipts(root: Path) -> list[Path]:
    try:
        out = subprocess.check_output(
            ["git", "diff", "--cached", "--name-only", "--diff-filter=ACM"],
            cwd=root, stderr=subprocess.DEVNULL,
        ).decode()
    except Exception:
        return []
    files = []
    for line in out.splitlines():
        p = line.strip().replace("\\", "/")
        if p.startswith("docs/receipts/") and p.endswith(".md"):
            files.append(root / p)
    return files


def lint_receipt(path: Path) -> list[str]:
    """Return a list of human-readable violations (empty = clean)."""
    try:
        body = path.read_text(encoding="utf-8", errors="ignore")
    except Exception:
        return []
    problems: list[str] = []

    # Frontmatter present + honest verdicts
    m = FRONTMATTER_RE.search(body)
    if not m:
        problems.append("missing YAML frontmatter (need verdict: + evidence_class:)")
    else:
        head = m.group(1)
        if not VERDICT_LINE.search(head):
            problems.append(
                "frontmatter missing honest verdict "
                "(need `verdict: PASS|PARTIAL|FAIL|WITHHELD`)"
            )
        if not CLASS_LINE.search(head):
            problems.append(
                "frontmatter missing evidence_class "
                "(need `evidence_class: A|B|C|Sec|pending`)"
            )

    # Headline percent-score check
    for pm in HEADLINE_PERCENT_RE.finditer(body):
        line_start = body.rfind("\n", 0, pm.start()) + 1
        line_end = body.find("\n", pm.end())
        line = body[line_start:line_end if line_end != -1 else None]
        problems.append(
            f"headline percent-score (\"{line.strip()[:80]}...\") — honest verdicts only"
        )

    return problems


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except Exception:
        return 0

    if payload.get("tool_name") != "Bash":
        return 0
    cmd = (payload.get("tool_input") or {}).get("command", "")
    if not COMMIT_CMDS.search(cmd):
        return 0

    root = repo_root()
    if root is None:
        return 0

    receipts = staged_receipts(root)
    if not receipts:
        return 0

    problems: dict[str, list[str]] = {}
    for r in receipts:
        errs = lint_receipt(r)
        if errs:
            problems[r.relative_to(root).as_posix()] = errs

    if not problems:
        return 0

    if os.environ.get("UNI_RECEIPT_LINT_BYPASS") == "1":
        print(
            "UNI receipt lint: BYPASS accepted. Problems (audited):",
            file=sys.stderr,
        )
        for f, ps in problems.items():
            print(f"  {f}", file=sys.stderr)
            for p in ps:
                print(f"    - {p}", file=sys.stderr)
        return 0

    msg = [
        "UNI receipt lint refused this commit — docs/LAB_PROTOCOL.md §I says",
        "'Honest verdicts only: PASS / PARTIAL / FAIL / WITHHELD. Never percent-scored.'",
        "",
        "Problems:",
    ]
    for f, ps in problems.items():
        msg.append(f"  {f}")
        for p in ps:
            msg.append(f"    - {p}")
    msg += [
        "",
        "Fix each receipt's frontmatter + strip headline percent-scores, then re-commit.",
        "Bypass ONLY as an operator: set UNI_RECEIPT_LINT_BYPASS=1.",
    ]
    print("\n".join(msg), file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main())
