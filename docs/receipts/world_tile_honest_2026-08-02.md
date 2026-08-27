# The world tile measured this box's networking and called it the world

**Date:** 2026-08-02 · **Track:** studio · **Reported by:** the operator, live on air · **Commit:** `0438aa7`
**Files:** `viewer/launcher.cjs` (world tile) · `viewer/door_lifecycle.cjs` (world door)

## What he said

> "not true, there is a minecraft paper server and it was and is running look, UNI is on the chip and
> the world IS running"

**He was right.** Measured while he was saying it, from `/producer/health` on the chip:

```
driver        : producer
verdict       : LIVE
colony_count  : 5
tps           : {"up":true,"tps":20}
frame         : 20            (phoenix :4000 separately at frame 443306)
director_up   : true   producer_up: true   show_up: true
last_action   : beat_social
```

A Paper server reporting **20.0 TPS** is definitionally running, and a prismarine camera bot was
**connected to that world** on `:3020`.

## What the surfaces said

Two of them said the world was **down**, both from the same signal:

| surface | code | signal |
|---|---|---|
| `viewer/launcher.cjs` world tile | `up: mc` | `tcp(COLONY_HOST, 25565)` from THINKER |
| `viewer/door_lifecycle.cjs` world door | `probe: () => tcp(COLONY_HOST, 25565)` | same |

The colony runs **rootless in Podman** and `25565` is **not LAN-published** — the name resolves to
`10.89.1.40`, a podman-internal address. That probe **cannot succeed from this box, by design.**

So the probe measured *"this box cannot open that port"* and rendered it, under the label
**"World (Minecraft) @UNI-LAB"**, as *"the world is down"*. Those are different claims and only the
first was measured. Both files' `detail` strings were honest about it. **The boolean is what draws the
light, and it was permanently red against a healthy world.**

**An alarm that can never clear is not an alarm** — the same lesson this repo already paid for with the
chip's `drift`/`tracking` rows ("all 10 chip rows sat at `drift` for a day and nobody read them").

## Why this is a gate violation, not just a wrong pixel

**The refutation was inside the same payload.** `/api/status` asserted `world.up = false` and then, two
fields later, published the world's own tick rate and colony count, while `colonycam` reported a bot
connected to it:

```
"world":     {"up": false, "detail": "…:25565 not reachable from here…"}
"colony":    {"up": true,  "detail": "driver=producer verdict=LIVE colony=5 frame=8"}
"colonycam": {"up": true,  "detail": "prismarine …:3020"}
```

Gate `status-endpoint-honest` forbids exactly this: *"no two fields in one payload disagree about the
same subject."*

## The lesson had already been learned — and not propagated

Two other places in the estate had **already** written this down and handled it correctly:

- `viewer/command_center.cjs:1382` — *"The raw Minecraft game port :25565 is NOT reachable from the
  studio box BY DESIGN … Probing :25565 from here always reddened honestly-unreachable"*. Its
  `/api/health` reports `mc: ok=true, "Colony observable (@UNI-LAB via :3020/:4000)"`.
- `viewer/gaia/caps.cjs:218` — *":25565/:25575 are NOT LAN-published … and therefore read DOWN even
  against a healthy colony — structural, never masked."*

**The launcher and the Door never got the memo.** That is the whole shape of the fault: a correction
applied in one surface and not carried to the others.

## Blast radius — checked, and it is limited

**Nothing false went out on air.** The on-air health board reads from `command_center`'s `/api/health`,
which was already correct. Measured live:

```
colonycam  ok=true   Colony camera (:3020 @UNI-LAB)
phoenix    ok=true   Colony node (:4000 @UNI-LAB)
mc         ok=true   Colony observable (@UNI-LAB via :3020/:4000)
```

The false claim was confined to the **operator-facing** surfaces — `/api/status` and the Door — which is
exactly where he saw it.

## The fix

Liveness now comes from the world's **own tick rate** (`/producer/health` `.tps`), which actually
measures the world. Port reachability is still reported, as the separate networking fact it always was.
Fallbacks are explicit: if the producer is unreachable we fall back to the port probe; if **both** are
silent the launcher tile says **UNKNOWN** rather than asserting down, because at that point nothing here
has measured the world at all.

Verified against the live colony **before** commit:

```
producer health status : 200
tps object             : {"up":true,"tps":20}
world via TPS          : true
world via :25565 port  : false   (expected — not LAN-published)

NEW world door result  : true     OLD world door result: false
```

## Stated residual

- **Not live yet.** Needs the launcher restarted (`:8090`). That is outside the broadcast path — the
  Door is deliberately independent of the studio stack — but it is still a service restart during a
  show, so it waits for the operator's window.
- **This asserts the world is RUNNING, not that anything in it is alive.** TPS is a server tick rate.
  The science claim fence (`forage-pureworld-graduation` et al.) is untouched and nothing here should be
  read as bearing on it.
- **`viewer/discovery.cjs:110` and `viewer/door.html:298`** still describe the world by its `:25565`
  port. They are labels and a diagram node, not verdict-bearing probes, so they were left alone — but
  they are the same vocabulary and worth revisiting if the port ever does get published.
