# Agent instant-status contract — READ THIS FIRST (2026-07-14)

> Any Claude/LLM/agent joining a fresh chat in this repo: **your first tool call must be** to fetch
> the state, not to grep the repo. Grepping for state (as happened 2026-07-14 post-reboot when a
> fresh agent searched for "resonance" across viewer/docs to answer "what is my door lifecycle")
> means the wiring failed you. This doc + the endpoint below fix that permanently.

## The ONE call that answers everything

```
curl -s http://127.0.0.1:8090/api/status
```

Returns **in a single response**:
- `stack` — UP / PARTIAL / DOWN (the operator's coarse "are we open")
- `journey_current_step` — the exact vector the operator is on RIGHT NOW, with its live-check
  detail (e.g. "NOT rebooted (measured, not assumed)"), the step's description, and the next 3
  predicted steps
- `door_open` — every door in the lifecycle circle: `open`/`locked`/`circle_ok`/`prediction`
- `studio_ports` — every surface's live probe (obs, mediamtx, console, overlays, publisher, colony,
  colonycam, gaia, relay)
- `gaia_up` — Gaia's **liveness only** (the cheap `:8096` tcp probe reused from `mission()`)
- `gaia_gate` — **deliberately NOT a verdict.** This route never runs Gaia's lint, so it never
  claims its result; the field names the gate (`node viewer/gaia/verify_gaia.cjs`) instead.
- `hud_up` / `hud_surface` / `hud_api` — the HUD is a **native WPF widget, not a webpage**: there
  is no URL that shows it (`Ctrl+Shift+H` / tray icon / `hud_widget_open.vbs`). `:8100` is a
  loopback-only JSON API.
- `endpoints` — a curated MAP of every actionable endpoint with a one-line purpose (so the agent
  never has to grep to know what to call)
- `laws` — the 7 non-negotiable operating laws inlined, so they can't be lost

### Honesty fixes to this route (2026-07-16) — three false claims it used to make

This route is what every fresh agent trusts first, so its own lies are the most expensive kind.
Three were found and fixed by **measuring** it rather than reading it:

1. **`gaia_up` was PERMANENTLY `false`, `gaia_gate` permanently `"unreachable"`.** The route probed
   Gaia's `/api/gaia` envelope with a **3000ms** timeout — but that envelope is a measured **~20s /
   611KB** computation (every seat route computes it in full before filtering,
   `gaia_server.cjs:150`). The call could never complete, so the fields were hard-coded lies by
   construction, while Gaia served 200s the whole time — and the same payload's
   `studio_ports.gaia.up` said `true`, contradicting itself. Liveness now reuses `mission()`'s
   already-computed cheap tcp probe (free). *Same defect class as the HUD's `gaia_drift` upstream,
   fixed the same day: **never aim a short timeout at Gaia's envelope.***
2. **`gaia_gate` claimed `"green"` without running the lint** — asserting a verdict from the mere
   fact that JSON parsed. Now reports liveness only and names the gate.
3. **`hud_url` advertised `http://hud.uni-lab.local:8100/hud`** — false twice: `:8100` binds
   **loopback** (the name resolves to `.196`, so it looks reachable and is not — a claim
   `docs/HUD.md` had already retired), and **`GET /hud` is a 404** (the native rewrite deleted the
   page). Replaced with `hud_surface` + `hud_api`.

Bonus: removing the doomed 3s Gaia await roughly **halved** the route's latency (5.75s → 2.77s).

If `/api/status` is down, the door itself is down — that's a different kind of problem (see
`docs/DOOR_LIFECYCLE_SEQUENCES.md` §1 boot + §appendix incident). But if the door is up (`:8090`
answers), `/api/status` MUST answer.

## Answering the operator's common questions from `/api/status` alone

| Operator asks | Field to read | No grep needed |
|---|---|---|
| "what state is my door lifecycle" | `door_open.*` (each door's open/locked/circle_ok/prediction) | ✓ |
| "what is Gaia resonance" | `door_open.gaia`, plus `curl :8096/api/gaia` for the signals | ✓ |
| "what could I do next" | `journey_current_step.predicts_next` | ✓ |
| "what do you predict I will do" | same field (the journey plan IS the prediction) | ✓ |
| "what should I have already predicted" | `journey_current_step` gives the current vector, and every closed door's `prediction` states what should have already been true | ✓ |
| "what do you see that you did not predict" | diff `studio_ports` vs the journey's expected state at this step | ✓ |
| "what might I see that was not predictable" | Gaia's `drift` seat — `curl :8096/api/gaia/drift` | ✓ |

## The rule

**No fresh session ever grep-hunts for state.** Ever. If you find yourself grepping to answer a
"what is the state of X" question, that means `/api/status` is either down (report it) or missing a
field (extend the endpoint in `viewer/launcher.cjs`; don't paper over it with a search). The living
map on `/door` is the visual counterpart; `/api/status` is the machine counterpart. Both are
first-class.

## For humans opening a new chat

Paste `NEW_CHAT_LAUNCH_PROMPT.md` as the first message. It directs the fresh agent to hit
`/api/status` before anything else — including reading CLAUDE.md.
