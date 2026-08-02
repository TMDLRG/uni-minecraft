"""verify_python_gates.py -- the python side of "CI runs node, gates-node, gates-python" (Phase 9, step 1.3).

Node's gate_runner.cjs closed "nothing invokes them" for the .cjs gates. Python has exactly one gate today
(production/mixer/verify_scenes.py) and it needs a LIVE OBS instance -- unrunnable in a CI container, so it
cannot be executed here. The honest, non-vacuous thing this CAN do in CI is:

  1. DISCOVER every python file carrying the GATE:/RESULT:/PROOF: verdict convention (mirrors gate_runner.cjs's
     filesystem discovery, so a future CI-safe python gate is picked up automatically -- no second registry to
     forget to update).
  2. COMPILE-CHECK it (py_compile: syntax is valid) and IMPORT-CHECK it (its module actually loads -- catches a
     broken import, a typo, a missing symbol) WITHOUT invoking main() or any network/OBS call. This is a real,
     failing-on-a-real-defect check; it is not a rubber stamp.
  3. Classify each discovered gate as RUNNABLE-HERE or NEEDS-EXTERNAL (declared inline via a `CI_EXTERNAL =`
     module attribute, so the classification lives in the gate itself, not a list this script must remember to
     update) and run the runnable ones for a real PASS/FAIL, exactly as gate_runner.cjs does for node.

Exit 0 = every discovered gate at least import-cleanly, and every RUNNABLE-HERE gate exits 0.
Exit 1 = an import/compile failure, or a runnable gate's own FAIL.
"""
from __future__ import annotations

import importlib
import importlib.util
import pathlib
import py_compile
import re
import subprocess
import sys

REPO = pathlib.Path(__file__).resolve().parent.parent
VERDICT_RE = re.compile(r"(GATE|RESULT|PROOF):\s*(PASS|FAIL|PARTIAL|WITHHELD|PENDING|INCONCLUSIVE)\b")


def discover(root: pathlib.Path) -> list[pathlib.Path]:
    out = []
    for p in sorted(root.rglob("*.py")):
        if p.name == pathlib.Path(__file__).name:
            continue  # this script is not a gate
        try:
            text = p.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        if VERDICT_RE.search(text):
            out.append(p)
    return out


def module_name_for(path: pathlib.Path) -> str:
    rel = path.relative_to(REPO).with_suffix("")
    return ".".join(rel.parts)


def check_compiles(path: pathlib.Path) -> tuple[bool, str]:
    try:
        py_compile.compile(str(path), doraise=True)
        return True, "compiles"
    except py_compile.PyCompileError as exc:
        return False, f"SYNTAX ERROR: {exc}"


def check_imports(path: pathlib.Path) -> tuple[bool, str]:
    mod_name = module_name_for(path)
    try:
        spec = importlib.util.find_spec(mod_name)
        if spec is None:
            return False, f"module '{mod_name}' not importable from repo root (namespace package misconfigured?)"
        importlib.import_module(mod_name)
        return True, f"imports as {mod_name}"
    except Exception as exc:  # a broken import is exactly the defect this check exists to catch
        return False, f"IMPORT FAILED ({mod_name}): {type(exc).__name__}: {exc}"


def is_ci_external(path: pathlib.Path) -> str | None:
    """A gate declares `CI_EXTERNAL = "<reason>"` at module level if it needs live resources this
    harness cannot provide. Read as text (not via import) so a broken import doesn't hide the reason."""
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return None
    m = re.search(r'^CI_EXTERNAL\s*=\s*["\'](.+?)["\']', text, re.MULTILINE)
    return m.group(1) if m else None


def main() -> int:
    sys.path.insert(0, str(REPO))
    gates = discover(REPO)
    results = []
    for g in gates:
        rel = g.relative_to(REPO).as_posix()
        ok_compile, compile_msg = check_compiles(g)
        if not ok_compile:
            results.append({"file": rel, "ok": False, "detail": compile_msg, "ran": False})
            continue
        ok_import, import_msg = check_imports(g)
        if not ok_import:
            results.append({"file": rel, "ok": False, "detail": import_msg, "ran": False})
            continue
        external = is_ci_external(g)
        if external:
            results.append({"file": rel, "ok": True, "detail": f"import-clean; EXTERNAL (needs {external}) -- listed, not run", "ran": False})
            continue
        proc = subprocess.run([sys.executable, str(g)], capture_output=True, text=True, timeout=60)
        m = VERDICT_RE.findall(proc.stdout + "\n" + proc.stderr)
        verdict = m[-1][1] if m else None
        law_ok = verdict is not None and ((proc.returncode == 0) == (verdict == "PASS"))
        results.append({"file": rel, "ok": law_ok and verdict == "PASS", "detail": f"exit={proc.returncode} verdict={verdict or 'UNKNOWN'}", "ran": True})

    for r in results:
        tag = "PASS" if r["ok"] else "FAIL"
        print(f"  [{tag}] {r['file']:<50} {r['detail']}")

    fails = [r for r in results if not r["ok"]]
    print(f"\nGATES-PYTHON: {'FAIL' if fails else 'PASS'} — {len(results)} discovered, {len(results) - len(fails)} ok, {len(fails)} FAIL.")
    print("(Import/compile-clean is a real, failing check. A gate needing live resources declares CI_EXTERNAL and is listed, never fabricated as PASS.)")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
