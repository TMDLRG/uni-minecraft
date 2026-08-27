# SLOT VERIFICATION FINDING — PARTIAL

**Root cause of PARTIAL:** the running `publisher.cjs` (PID 40356) started at
`2026-08-02 01:40:10 -0500` (06:40:10 UTC) — **8 hours BEFORE** commit f67a5d7 was authored
(2026-08-02 14:05:22 UTC). Every runtime feature f67a5d7 added — the `/slots` endpoint, the
`slot_busy` collision refusal, and the `slot_taken_over` eviction — is **not present** in the
running gateway code, because that gateway hasn't been restarted since. Restarting `publisher.cjs`
is explicitly out-of-scope per the ORCHESTRATE prompt ("Do not restart: publisher services"), so
we record PARTIAL and do not restart.

## What IS verified

- **f67a5d7 IS an ancestor of HEAD** (commit is in the tree). PASS.
- **Served pub.html byte-identical to repo** — hash `5b2b557a…`, 36 197 bytes on both, served over
  HTTPS `:8443/pub.html`, HTTP 200. `publisher.cjs` reads `pub.html` from disk on every request
  (line 87), so the BROWSER page is always fresh regardless of when the gateway started. PASS.
- **All shipped f67a5d7 strings present in served body**: `"IN USE"` × 2, `"refreshSlots"` × 6,
  `"/slots"` × 3, `"slot_busy"` × 1, `"slot_taken_over"` × 1, `"SLOT_BASE"` × 3. PASS.
- **`slot_busy` was introduced by f67a5d7** in `viewer/publisher.cjs`
  (`git log -S 'slot_busy'` → single result: f67a5d7). Confirms the gateway-side feature is
  scoped to that commit.

## What CANNOT be verified while publisher.cjs is pre-f67a5d7

- **`GET /slots`** returns HTTP 404 "not found" (raw curl `HTTP/1.1 404 Not Found`). The handler
  code exists in `viewer/publisher.cjs:72` but is NOT in the running process bytes. FAIL for the
  runtime check; the source-code check separately confirms the handler is present in the file.
- **Active duplicate → `slot_busy` event**: NOT_MEASURED. The register handler in the running
  gateway is the pre-f67a5d7 `clients.set()` — a second device would silently replace the first
  (the operator's original complaint). We cannot generate `slot_busy` without restarting the
  gateway, which is out of scope.
- **Stale takeover → `slot_taken_over` event**: NOT_MEASURED. Same reason.
- **pub.html 4-second relabel to "● IN USE — <who>"**: NOT_MEASURED. `refreshSlots()` polls
  `/slots` every 4 s and silently swallows fetch errors (pub.html:169), so the picker shows every
  slot as free regardless of true state.

## Blast radius on-air

`/registrations` (loopback :8095) IS working — it returns rich records for all live slots. The
command center reads it and treats `ageMs < 30000` as live (command_center.cjs:1023), so the
STUDIO side knows which slots are hot even though the LAN side (pub.html) cannot show it.
The operator's own picker on the studio console is not affected. The affected surface is the
LAN capture page (pub.html) that a GUEST device opens to publish.

Current live occupancy (from `/registrations`):
- cam1: "M. Regenerative Architect" (BCC950 ConferenceCam) from Stick Cam, publishedAt 23:07 UTC
- cam3: screen share from SWU-MCP
- cam5: screen share from Claude

None of these show the RemoteCam mute-state ratcheting that P4 fixed — they are all `muted:false`
and being consumed by OBS. No production slot was disturbed by this verification.

## Recommendation (operator's call)

Restarting `publisher.cjs` would load the f67a5d7 code and make the client-side polling actually
work. Cost: brief LAN-guest gateway blip during the restart (<2 s), but production RTMP fan-out
is unaffected (the fan-out lives on node2/restream.ps1, not on publisher.cjs). The restart is
NOT taken here per prompt constraints.
