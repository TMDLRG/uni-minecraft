# Receipt — the missing terrain: measured DATA, root cause found, fixed (staged for rebuild)

**2026-08-04, hour ~37 of a public run. PLAN 7 Front A, step A0 + the terrain fix.**

## The symptom

The on-air world camera (`:3020`, prismarine-viewer, captured as `cap_colony`) showed a UNI floating
in empty pale-blue sky with no ground — for hours, across a page reload.

## The measurement that decided it (DATA vs VIEW)

`viewer/probe_world.cjs` frames the fork: **DATA** (chunks never reached the client → character in
empty sky → fix = reconnect) vs **VIEW** (world loaded, camera pointed at sky → fix = move camera,
*reconnecting would be wrong*). Its `loadedChunks` field needs `window.viewer`, which prismarine-viewer
1.33 does **not** expose (measured: globals are only `__THREE__`, `THREE`), so that field was null.

So the decisive test was done a different way, and it is conclusive: **screenshot a BRAND-NEW client.**
A throwaway headless Chrome (`--headless=new --use-angle=swiftshader`, its own profile + debug port,
never the on-air 9220/9221 windows) was pointed at `http://uni-lab-lan.uni-lab.local:3020/`, given 14 s
to stream, and captured via CDP `Page.captureScreenshot`. Result: **one UNI, a nametag, and zero
terrain** — identical to the on-air frame.

**That rules out a stale on-air client.** A fresh client gets no terrain either, so a reconnect would
only produce another empty-sky client (and blank the live one — `stream_live.ex:263-265`). It is
**DATA, producer-side**: chunks are not reaching *any* client, while entities are.

Four throwaway-client probes were run over ~15 minutes; the fan-out restart counts held at 16/17
throughout (a one-shot headless probe is safe, unlike the 3-second rAF loops that gapped the audience
earlier — those are what task #25 forbids).

## Root cause

`viewer/director.js`'s own comment (`:80-82`) states the mechanism: *"we ask the SERVER to keep the
colony chunk-square loaded; the client then streams it fine."* On a 4 GB world server a camera
teleported every 100 ms (`:265`) at `viewDistance: 4` outruns the server's chunk generation into blue
void unless the chunks are already resident. **`forceload` is what keeps them resident** — and it was
gated behind `if (P.wide)` (old `:150`), so the four everyday shots (`orbit/closeup/follow/beauty`,
all `wide:false`) pinned **no terrain at all**, and `setShot` even `clearForceload()`d when switching
to a non-wide shot (old `:123`). The only shots that ever loaded terrain were the wide ones — and
`MAX_WIDE_MS=6000` reverts those to orbit within 6 s.

## The fix — **LIVE in the running container, but NOT in the image. A recreate reverts it.**

> **CORRECTED 2026-08-04.** This section previously read *"(staged — lands on the next
> `uni-producer` image rebuild)"*, which would tell an agent the fix is safely queued and inert.
> It is neither. It was copied into the **running container** and is working right now — and it
> lives only in that container's writable layer.
>
> Measured 2026-08-04, from the chip:
>
> | where | sha256 of `/app/viewer/director.js` |
> | --- | --- |
> | running `uni-producer` container | `f04022aa951a850e…` — **the fixed file** (matches the repo copy byte-for-byte) |
> | image `localhost/uni-producer:v1b-9e6cee1` | `edeb77802a8624bf…` — **the old, broken file** |
>
> `podman exec uni-producer grep -c "ensureForceload(base)"` returns `1`, so the unconditional
> forceload is genuinely in the running code.
>
> **What this means in practice.** `podman inspect` reports restart policy `no` with
> `RestartCount=0` — podman will not restart it, because the Quadlet unit hands restart control to
> systemd. So the fix does **not** evaporate on a crash loop. It evaporates on any **recreate**: a
> reboot, `systemctl --user restart uni-producer`, or a redeploy. Every one of those rebuilds the
> container from the image, and the image still carries the broken file. **The terrain would go
> back to empty sky and nothing would report a fault** — which is exactly how this defect hid the
> first time.
>
> The durable route is unchanged and still outstanding: rebuild the image (`Containerfile:32`
> bakes this file in), which is PLAN 7 Front A. Until that rebuild happens, treat the terrain fix
> as **live and load-bearing but not durable**, and re-apply it after any recreate.

Two edits to `viewer/director.js`, which is baked into the image (`Containerfile:32`), so it
becomes durable only on rebuild:

1. `glide()` now calls `ensureForceload(base)` on **every** shot, not just wide ones. `ensureForceload`
   dedups by chunk key, so it fires RCON only when the square moves — peak load is identical to what
   wide shots already produced.
2. `setShot()` no longer `clearForceload()`s on a non-wide shot. Teardown and disconnect still clear
   it (`:232`, `:252`), so no chunks are orphaned when the camera dies.

Syntax-checked (`node --check`), zero gated-forceload lines remaining.

## What proves it (on the rebuild, by eye — not asserted)

After the rebuild, screenshot a fresh `:3020` client the same way: terrain must be present under the
UNIs. The companion PLAN 7 A1 signal — `loadedChunks`/a non-flat-frac verdict wired into
`/producer/health` — is the durable instrument so a blank world can never again pass every check
(today it did: `/producer/health` read `verdict: LIVE` through the empty sky).

## Honest limits

- This is the leading, well-evidenced cause; the **rebuild is the test**. If terrain is still absent
  after it, the next candidates are the server's own view/simulation-distance and whether the UNIs sit
  in a genuinely sparse region — measurable then with RCON `data get entity … Pos` from inside the
  cluster (RCON does not reach from THINKER).
- The rotation-tween judder fix (`patches/apply_prismarine_rotation_tween.cjs`, now wired into
  `Containerfile` after `npm install`) ships on the same rebuild. The 100 ms→50 ms pose-rate change is
  deliberately **NOT** applied — it would double chunk churn on the un-guarded `worldView.updatePosition`
  and must wait until terrain is proven solid.
