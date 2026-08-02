# Receipt — the fan-out supervisor stops lying (and I retract an overclaim)

**Date:** 2026-07-16 · **Track:** studio · **Surface:** THINKER · `viewer/command_center.cjs`
**Gates:** `fanout-liveness-not-from-killed`, `fanout-arm-refuses-without-ffmpeg`,
`flap-does-not-accuse-the-key`, `broadcast-test-stage4-partial-fails` — all registered **PENDING before**
the code changed; verdicts below.

Origin: the 52-agent adversarial sweep of 2026-07-16 (defects D2–D7). Everything here was found by trying
to falsify the studio, not by reading it approvingly.

---

## 0. THE RETRACTION — I told the operator something that was not true

During the PIN/fake-key walkthrough I said, of the health board:

> "This is the money shot … the health board says `FLAPPING — 13 respawn(s) in 46s (rejected key likely:
> attach → refused → die → respawn)`"

**That narration was wrong, and the row it quoted was wrong.** At that moment **air was OFF**. With no
publisher on `rtmp://127.0.0.1:1935/uni`, ffmpeg dies **at the input** in ~0.2 s — it never opens a
connection to YouTube or Twitch, so **the fake key was never presented to anything**. The flap I showed
was caused by the absent program, not by key rejection. Measured:

| condition | respawns / 46 s |
|---|---|
| idle ingest, **no** keys implicated | ~11 |
| my "rejected fake keys" demo | 13 |

**Statistically indistinguishable.** The row asserted the cause unconditionally; I repeated the assertion.

Why this matters more than a wrong sentence: G-PA requires ARM *before* the operator types CONFIRM, so
**the prescribed order guarantees a window in which perfectly good keys are accused of being rejected.**
The row was set up to send a live operator away to re-type working keys, mid-show, chasing nothing.

**What survives:** the *stage-4* catch during the broadcast test was genuine — stage 2 starts the stream,
so a publisher existed and the keys really were reaching the platform. Only the **health-board narration**
(air off) was false. The gate did not lie; my sentence about the gate did.

---

## 1. D5 — a flap may only name the key when the key was actually sent

`healthChecks()` now reads the fact that separates the two causes — `pmap.uni.ready`, the local ingest's
own publishing state, already in hand — and refuses to diagnose beyond what it can distinguish.

**Rehearsal, air OFF, two fake keys armed:**

```
--- AIR OFF, 2 fake keys armed ---
[RED ] Fan-out: YouTube #1 (YouTube)
        FLAPPING — but there is NO PROGRAM on the local ingest (:1935/uni is not publishing),
        so the pushers die at the input before your key is ever sent. YOUR KEY IS NOT IMPLICATED.
        This is normal when fan-out is armed before the stream starts.
[RED ] Fan-out: Twitch (Twitch)
        FLAPPING — but there is NO PROGRAM on the local ingest ... YOUR KEY IS NOT IMPLICATED.
```

Still **RED** (it is genuinely not pushing) — but it no longer accuses. Only a flap *while the ingest is
publishing* may say `A key <platform> is REJECTING is the usual cause.`

**Verdict: PASS.** Note the fence: this proves the row states the honest cause in the no-publisher case.
It does **not** prove the platform-rejection branch against a real rejecting platform — that needs a real
key and real air, and is **NOT VERIFIED**.

## 2. D3 — liveness was derived from `.killed`, which is only true when *we* do the killing

`alive` was `!!(rec.proc && !rec.proc.killed)`. `.killed` is set **only** when our code calls `.kill()`.
A pusher that dies on its own — bad key, network drop, no input: i.e. **every real failure** — leaves
`.killed === false` forever. Differential against a real child that exited by itself:

```
process is DEAD (exited by itself, exitCode=3); we never called .kill()
  .killed flag ............ false   <- only ever true if WE killed it
  OLD predicate (!killed) . true    <-- LIES: reports a corpse as alive -> green 'pushing ... stable'
  NEW predicate (exitCode). false   <-- correct: dead is reported dead
```

Now: `exitCode === null && signalCode === null && !spawnFailed`. **Verdict: PASS.**

## 3. D4 — the spawn-error handler was `() => {}`, and it killed the supervisor

Node emits `'error'`, **not** `'exit'`, when the binary cannot be spawned at all. The respawn timer hung
off the `exit` path only, so a missing/renamed ffmpeg meant the loop **stopped forever** — silently.

```
OLD  p.on('error', () => {})
   respawn attempts in 2s .. 0      <-- the supervisor is DEAD. It will never try again.
   spawnFailed recorded ... null    <-- health row reads green '0 respawn(s), stable'
NEW  p.on('error', record + respawn)
   respawn attempts in 2s .. 6
   spawnFailed recorded ... ENOENT  <-- health row goes RED and names the cause
```

A supervisor that can die without saying so is not a supervisor. Also added a **pre-flight**: ARM now
proves ffmpeg runs *before* claiming to have armed anything.

```
ARM pre-flight (ffmpegRunnable) against a missing binary:
   -> {ok:false, err:'ENOENT'} -- ARM REFUSES, HTTP 409, nothing claims to be armed
```

Positive control (real ffmpeg, this box): `POST /api/fanout {on:true}` → `{"ok":true,"count":2}` — the
pre-flight passes on a healthy box and does not block arming. **Verdict: PASS** (both gates).

## 4. D6/D7 — stage 4 passed the most realistic failure there is

The bar was `readers >= 1`. With two endpoints armed and **one** key bad, the healthy pusher pins readers
to ≥1 at both samples — **stage 4 went green with a platform dark.** New bar: every pusher we ARMED must
hold a reader, floored at 1 so the `restream.ps1` path (where `fanoutProcs.length` is 0) does not become a
permanent PASS — a worse lie than the one being fixed.

```
case                                    | OLD    | NEW    | NEW correct?
2 armed, BOTH healthy                   | PASS   | PASS   | yes
2 armed, ONE key bad (the real risk)    | PASS   | FAIL   | yes
2 armed, both dead                      | FAIL   | FAIL   | yes
restream.ps1 path (armed=0), 2 readers  | PASS   | PASS   | yes
restream.ps1 path (armed=0), 0 readers  | FAIL   | FAIL   | yes
1 armed, healthy                        | PASS   | PASS   | yes
```

**Verdict: PASS.** D7 (the 0-reader message said "turn FAN-OUT ON" *while fan-out was on* — sending the
operator to flip a switch already flipped) is fixed in the same message: when `armedN > 0` it names the two
real causes and points at the per-endpoint rows that distinguish them.

## 5. D8 — a run getting longer must not make an alarm quieter

The flap rate was `respawns / secondsSinceStart` — a **lifetime average with a growing denominator**. A key
revoked at hour 3 would read "stable" for ~22 minutes of dead air while the rate diluted. Now a **trailing
60 s ring** of exit timestamps: `>= 6 deaths in the last minute` is flapping, regardless of run length.

## 6. D2 — an orphaned PIN reported itself as a working one

`hasPin` was file existence. The reset path this panel itself prescribes ("delete `endpoints*.enc` by
hand") can leave a **wrapper with no store**: PIN accepted, passphrase unwrapped, opens nothing — and it
failed at `pin-arm`, **seconds before air**. Cheaply detectable at status time, so now said at status time
(`pinOrphan` + a panel line in red). Live: `{"hasPin":false,"pinOrphan":false,...}` — no false alarm on a
clean box.

Structural note: with the D1 module-boundary lock, no route can write the store under a *different*
passphrase, so the "PIN silently wraps a stale passphrase after a rotate" half of D2 is now closed **by
construction** rather than by a check. The trade is that **passphrase rotation is not possible through the
UI** — there is no rotate route today; if one is ever added it must re-wrap the PIN in the same
transaction.

---

## Housekeeping — I removed the trap I left

`viewer/runtime/endpoints.enc` still held **my** demo store from the walkthrough. Because `save()` now
authenticates against the store on disk, the operator's first real save would have been refused with
"wrong passphrase" against a passphrase **only I knew** (`demo-passphrase-2026`). Deleted, after
confirming every key in it was one I fabricated:

```
CONFIRMING what I am about to delete — every key must be a FAKE I created:
  YouTube #1   key=FAKE-yt-demo-key-0000-nope
  Twitch       key=live_000000000_FAKEDEMOKEYnope
All fake. Store deleted. exists now: false
```

The box is clean: no store, no PIN. The operator's first save starts fresh.

## What is still NOT VERIFIED

- The **platform-rejection branch** of the flap row against a real rejecting key on real air.
- That any of this reaches a human **not looking at the screen** — the studio still has no alarm that
  leaves the monitor. That is the sweep's standing **THE ONE CHANGE** and is not fixed here.
