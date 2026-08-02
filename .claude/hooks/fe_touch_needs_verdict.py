#!/usr/bin/env python3
"""
fe_touch_needs_verdict.py — PreToolUse hook (A-A3 in the UNI OS+MIND Deepening Plan).

Refuses a Bash tool call that would `git commit` / `git push` / `git merge`
when any file in the FE scope glob is dirty in the working tree unless a
docs/receipts/lab_team_review_<SHA_PREFIX>.md exists in the working tree
that references the pending HEAD.

FE scope (verbatim from the plan A-A3, and CLAUDE.md "Hard invariants"):
  lib/sp/brain/{infer,efe,plan,learn,precision,novelty,designer,model,
                genome,factors,homeostat,metabolism,motor,motor_control,
                slow_context,hierarchy2}.ex

Bypass: set UNI_SHIP_GATE_BYPASS=1 and a REASON in UNI_SHIP_GATE_BYPASS_REASON.
Bypass is audited to /var/lib/uni/broadcast/audit/prod-mcp.ndjson if that
path is writable, otherwise to logs/ship_gate_bypass.log.

Input protocol (Claude Code hooks): JSON on stdin with
  {"tool_name": "Bash", "tool_input": {"command": "..."}}
Output: exit 0 to allow, exit 2 to block (Claude Code convention).
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from pathlib import Path

FE_SCOPE = {
    "lib/sp/brain/infer.ex",
    "lib/sp/brain/efe.ex",
    "lib/sp/brain/plan.ex",
    "lib/sp/brain/learn.ex",
    "lib/sp/brain/precision.ex",
    "lib/sp/brain/novelty.ex",
    "lib/sp/brain/designer.ex",
    "lib/sp/brain/model.ex",
    "lib/sp/brain/genome.ex",
    "lib/sp/brain/factors.ex",
    "lib/sp/brain/homeostat.ex",
    "lib/sp/brain/metabolism.ex",
    "lib/sp/brain/motor.ex",
    "lib/sp/brain/motor_control.ex",
    "lib/sp/brain/slow_context.ex",
    "lib/sp/brain/hierarchy2.ex",
}

RECEIPT_RE = re.compile(r"docs/receipts/lab_team_review_[0-9a-f]{7,40}\.md$")
COMMIT_CMDS = re.compile(r"\bgit\s+(commit|push|merge|rebase)\b")


def repo_root() -> Path | None:
    try:
        out = subprocess.check_output(
            ["git", "rev-parse", "--show-toplevel"],
            stderr=subprocess.DEVNULL,
        ).decode().strip()
        return Path(out) if out else None
    except Exception:
        return None


def dirty_fe_files(root: Path) -> list[str]:
    try:
        out = subprocess.check_output(
            ["git", "status", "--porcelain"],
            cwd=root, stderr=subprocess.DEVNULL,
        ).decode()
    except Exception:
        return []
    dirty = []
    for line in out.splitlines():
        # porcelain: two-char status + space + path
        if len(line) < 4:
            continue
        path = line[3:].strip()
        # handle "old -> new" rename entries by taking the new path
        if "->" in path:
            path = path.split("->", 1)[1].strip()
        # normalize backslashes to forward slashes for glob compare
        path = path.replace("\\", "/")
        if path in FE_SCOPE:
            dirty.append(path)
    return dirty


def head_sha(root: Path) -> str:
    try:
        return subprocess.check_output(
            ["git", "rev-parse", "HEAD"],
            cwd=root, stderr=subprocess.DEVNULL,
        ).decode().strip()
    except Exception:
        return ""


def receipt_covers_head(root: Path, head: str) -> bool:
    """A matching receipt file exists AND names the head SHA (short or full) in its body."""
    recipes_dir = root / "docs" / "receipts"
    if not recipes_dir.is_dir():
        return False
    for p in recipes_dir.glob("lab_team_review_*.md"):
        if not RECEIPT_RE.search(p.as_posix()):
            continue
        try:
            body = p.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue
        if head and (head[:7] in body or head in body):
            return True
    return False


def audit_bypass(root: Path, reason: str, dirty: list[str], head: str) -> None:
    row = {
        "schema_version": 1,
        "source": "fe_touch_needs_verdict",
        "ts": subprocess.check_output(
            ["date", "-u", "+%Y-%m-%dT%H:%M:%SZ"], stderr=subprocess.DEVNULL,
        ).decode().strip() if os.name != "nt" else "",
        "kind": "event",
        "payload": {
            "action": "bypass",
            "reason": reason,
            "dirty_fe_files": dirty,
            "head_sha": head,
        },
        "provenance": {
            "server": os.environ.get("UNI_HOSTNAME", "thinker"),
            "git_commit": head,
            "evidence_class": "Sec",
            "audit_id": "",
        },
    }
    row_line = json.dumps(row) + "\n"
    prod_mcp = Path("/var/lib/uni/broadcast/audit/prod-mcp.ndjson")
    try:
        with prod_mcp.open("a", encoding="utf-8") as f:
            f.write(row_line)
            return
    except Exception:
        pass
    # fallback: repo logs
    log = root / "logs" / "ship_gate_bypass.log"
    log.parent.mkdir(parents=True, exist_ok=True)
    with log.open("a", encoding="utf-8") as f:
        f.write(row_line)


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except Exception:
        return 0  # cannot parse; do not block

    if payload.get("tool_name") != "Bash":
        return 0

    cmd = (payload.get("tool_input") or {}).get("command", "")
    if not COMMIT_CMDS.search(cmd):
        return 0

    root = repo_root()
    if root is None:
        return 0

    dirty = dirty_fe_files(root)
    if not dirty:
        return 0  # no FE files touched → nothing to gate

    head = head_sha(root)
    if receipt_covers_head(root, head):
        return 0  # ship gate honored

    # Bypass path
    if os.environ.get("UNI_SHIP_GATE_BYPASS") == "1":
        reason = os.environ.get("UNI_SHIP_GATE_BYPASS_REASON", "")
        if not reason.strip():
            print(
                "UNI ship-gate: bypass requested but UNI_SHIP_GATE_BYPASS_REASON is empty. "
                "Refusing bypass. Set a non-empty reason.",
                file=sys.stderr,
            )
            return 2
        audit_bypass(root, reason, dirty, head)
        print(
            f"UNI ship-gate: BYPASS accepted with reason={reason!r}. "
            f"Audited to prod-mcp.ndjson (or logs/ship_gate_bypass.log fallback).",
            file=sys.stderr,
        )
        return 0

    msg = (
        "UNI ship-gate refused this commit/push.\n"
        f"Reason: FE files dirty without a MERGED VERDICT receipt covering HEAD={head[:7] or '(none)'}.\n"
        f"Dirty FE files:\n  " + "\n  ".join(dirty) + "\n\n"
        "How to fix (do exactly one):\n"
        "  1) Run runs/lab_team_review.exs against your candidate SHA. Land\n"
        "     docs/receipts/lab_team_review_<sha>.md that references your HEAD.\n"
        "  2) Revert the FE changes if they were unintended (git checkout -- <file>).\n"
        "  3) Bypass ONLY as an operator: set UNI_SHIP_GATE_BYPASS=1 and\n"
        "     UNI_SHIP_GATE_BYPASS_REASON='<why>' (audited to prod-mcp.ndjson).\n\n"
        "This hook exists to enforce docs/LAB_PROTOCOL.md §II (MERGED VERDICT ship gate).\n"
        "See docs/handoffs/UNI_OS_MIND_DEEPENING_HANDOFF.md workstream A-A3."
    )
    print(msg, file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main())
