# ops/master_plan — the live master-plan collaboration surface

One plain URL that the owner streams and any LLM/agent reads to get the FULL plan + honest science ledger +
live run status. **No MCP, no login.** This is the shared coordination surface for the MineCraft track AND
the weekend live OS upgrade.

## Files
- `index.html` — human / stream view. **Self-contained** (inline CSS/JS, full state embedded as fallback) so
  it renders even if `state.json` can't be fetched (stream reliability). It also fetches `./state.json` every
  30 s and overrides the embedded snapshot when served — that is the "live" path.
- `plan.md` — the plain-text plan (best surface for an LLM to read the full detail fast).
- `state.json` — machine-readable status (`uni.masterplan.v1`). The thing the live-update timer regenerates.

## Honesty contract (binding)
- Gate vocabulary: **PASS / PARTIAL / FAIL / WITHHELD** — never percent-scored, never spun.
- Claim fence per item: **proven / designed / hypothesized / not-yet-built**.
- Where prose and a committed receipt disagree, **the receipt wins**. No headline outruns its committed receipt.

## Serving from uni-lab (deploy)
Write the three files under an allowlisted root (`/var/lib/uni/master_plan/`) and serve them statically:

```
# via the uni-lab MCP (each mutating call is one human approval):
os_file_write  /var/lib/uni/master_plan/{index.html,plan.md,state.json}
podman_run     static server (e.g. python:3-alpine `python -m http.server 4100 -d /srv/master_plan`
               with -v /var/lib/uni/master_plan:/srv/master_plan:ro and -p 4100:4100), firewall-open 4100
```
Target URL (intended): `http://<lab-box>:4100/`. Confirm the box + reachable IP with `limbs_list` / `os_sysinfo`.

## Live update (follow-on, Track A2)
A rootless `systemd --user` timer regenerates `state.json` (and re-derives the embedded snapshot in
`index.html`) from `git` (branch/head), the committed science ledger, and — once Track A3 lands — the pulled
run metrics in `docs/receipts/`. Until that timer exists, this is an honest **static snapshot**; `state.json`
`generated_by` says which.

## Editing
`plan.md` is the text source; keep `state.json` and the embedded `FALLBACK` in `index.html` in sync with it.
The authoritative long-form docs remain `docs/DEEPENING_PLAN.md`, `docs/specs/*`, and the session plan file.
