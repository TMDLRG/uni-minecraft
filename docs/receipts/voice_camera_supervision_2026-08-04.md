# Receipt — the voice, the camera link, and three instruments that did not exist

**Date:** 2026-08-04 · **Run:** the 2026-08-02→04 public broadcast, ~40 h, taken off air deliberately
**Programme run:** `4b868f37-5f6a-4a2c-9820-e9daf136d606` · **ADRs authored:** 254–260

---

## The one-line summary

Four separate faults were found on air. **Not one of them raised an error.** Every one of them was
a thing that existed perfectly, was configured correctly, and produced nothing — and every one was
found only by building an instrument that measured the *outcome* rather than the *configuration*.

---

## 1 · The agent voice had NO path to the broadcast at all

**Measured 2026-08-04.** Three candidate routes, all dead simultaneously:

| route | state |
| --- | --- |
| `ovl_voice` browser source — the mechanism CLAUDE.md documents | **absent from OBS entirely** |
| `ClaudeSpeak` wasapi process capture (the 2026-08-02 design) | **absent from OBS entirely** |
| `Desktop Audio` | present but **muted** |

Every line spoken was rendered locally and heard only in the room. The broadcast carried silence.

### Root cause, from OBS's own log — and it was self-inflicted

```
22:53:31.665  - source: 'ovl_voice' (browser_source)      <- present on ~18 scenes at load
22:53:48.793  User Removed scene 'NEWSDESK'
22:53:48.795  User Removed scene 'OVERLOOK'               <- every scene removed, 17s later
              ... 23 scenes removed ...
```

That 22:53 bring-up was **my own crash recovery**. `studio_up.ps1` triggered a `studio_stage.cjs`
rebuild (permitted — the stream was down post-crash). `studio_stage.cjs` **never declared
`ovl_voice`**, so the rebuild had nothing to recreate it from. It did not come back, and an absent
audio source raises no error — only silence, which is indistinguishable from nobody talking.

### The second, deeper fault: Web Audio never reached the mixer

Restoring the source was not enough. With `reroute_audio: true`, `mixers: 255`, unmuted, 0 dB, on
the program scene — OBS metered **every other source at 300+ frames and `ovl_voice` at nothing**,
while the operator heard the utterance **from the room's speakers**. The page's `AudioContext →
GainNode → destination` graph produced real audio that went to the Windows playback device.

Fixed by playing through an `HTMLAudioElement` (the path `chVidA` already proves for clip audio).
**Verified: `ovl_voice` at −3.7 dB over 337 frames, ShowRadio ducking to −6.7 beneath it.**

Both faults are now closed in three layers: live on 35 of 37 scenes; **declared** in
`studio_stage.cjs` so a rebuild recreates it; and the non-obvious settings documented at the
declaration — especially `restart_when_active: false`, which the generic `browser()` helper sets
*true* and which would reload the page on every cut and chop every sentence.

→ **ADR-254** (Web Audio), **ADR-255** (declare or it dies)

---

## 2 · The studio had ZERO audio measurement

One pixel measurement existed. No audio measurement existed at all. That asymmetry is exactly how
both this outage and the 2026-08-02 dead-device outage hid: `GetInputVolume` answers *how loud
would this be* — a claim. Nothing answered *how loud IS this*.

`viewer/audio_meter.cjs` now reads post-fader peak dB per input from obs-websocket's
`InputVolumeMeters`. Read-only. It is what proved the Web Audio defect and what verified its fix.

→ **ADR-256**

---

## 3 · A minimised window feeds OBS pure black, silently

`cap_overlook` fed black to air for hours while the process was present, the page was alive (a CDP
screenshot returned **106 KB of fully rendered view**), and the source was enabled on program. The
window was **minimised**, and Windows Graphics Capture cannot capture a minimised window.

`channel_windows_watchdog.ps1` now asks three independent questions — process, page, **window
capturability**. The repair path deliberately has **no on-air fence**, the opposite of the reload
path: a reload destroys what is on air, a restore can only add picture.

**The trap, recorded so nobody simplifies it away:** the channel windows are parked at
`-32000,-32000`, the *same* coordinate Windows uses for a minimised window's rect. A rect-based
test would convict every healthy window. `IsIconic` is the only honest signal — and
`-ProveWindow` mutation-proves exactly that on a throwaway window (5/5 pass).

→ **ADR-259**

---

## 4 · The camera link — split-brain DNS, diagnosed three times wrongly first

Blamed on the firewall, then routing, then Tailscale. All three were wrong. Measured:

| name | LAN resolver (chip) | public (1.1.1.1 / 8.8.8.8) |
| --- | --- | --- |
| `studio.uni-lab.solwright.com` | `10.190.245.196` (THINKER) ✅ | `10.190.245.121` (chip) ❌ |
| `publisher.uni-lab.solwright.com` | *absent from the zone* ❌ | `10.190.245.121` ❌ |

A wildcard `*.uni-lab.solwright.com` → the chip (proven by resolving a nonsense subdomain, which
also answered `.121`). The chip's nginx returns **401**. Any browser using DNS-over-HTTPS silently
takes the public answer. **The URL worked from the box it was tested on and failed everywhere else.**

Fixed here: `publisher` added to the chip zone (co-signed; zone sha256 `f43824084eded075…`,
independently re-verified on disk), `uni-dns.service` restarted properly — not SIGHUP, not
`podman restart`, both of which have taken DNS *and* DHCP down before. No regressions.

`viewer/camera_link.cjs` now compares **local vs public resolution** and disqualifies any
split-brain name from ever being canonical.

**Still open, and the operator's:** three Cloudflare A records (`publisher`/`studio`/`thinker` →
`10.190.245.196`, **DNS-only, not proxied**). No Cloudflare API token exists on the box; the only
credential present is a tunnel origin cert whose sole DNS power is creating a CNAME to a tunnel —
measured, not assumed.

→ **ADR-258**

---

## 5 · `dual_push --stop` reports success while the broadcast continues

Found while taking the run off air. `--stop` printed `stopped both pushers` while **both were still
delivering to YouTube and Twitch**. The success line is unconditional (kill inside `try/catch`,
message outside it), and **three** things resurrect the pushers.

`RUNBOOK_STUDIO.md`'s Shutdown section named `restream.ps1 -Stop` — which is not the fan-out and
which nothing starts. **Following it would have left the show on air.** Corrected, with the
verified shutdown order and a process-count verification that must read zero.

→ **ADR-257**

---

## 6 · A dedup guard that had never once worked

`studio_up.ps1` checked "is the watchdog already running?" with `Get-Process | Where CommandLine`.
**PowerShell 5.1's `Get-Process` has no `CommandLine` property.** The filter matched nothing, so
every bring-up stacked another supervisor while printing "started". Each copy held its own
in-memory anti-storm backoff, silently dividing it.

→ **ADR-260**

---

## Artifacts, with digests (sha256, first 16)

| file | digest |
| --- | --- |
| `viewer/channel_windows_watchdog.ps1` | `D13DD229EB69FC1F` |
| `viewer/studio_up.ps1` | `5425521444E8DA0D` |
| `viewer/studio_stage.cjs` | `7A806F06A291FB82` |
| `viewer/audio_meter.cjs` | `061CF8638E1C7F8A` |
| `viewer/camera_link.cjs` | `62196D1940CF1D2F` |
| `viewer/voice_everywhere.cjs` | `D0A8C6C2F9BDFFD7` |
| `production/overlays/voice.html` | `3CB3A33E0192ADBF` |
| `viewer/director.js` | `F04022AA951A850E` |
| chip `/etc/uni/dns/uni-lab.local.hosts` | `f43824084eded075…` |

---

## Adverse and open — none of this is closed

- **The terrain fix is LIVE but NOT DURABLE.** The running container has `f04022aa951a850e…`; the
  image still has `edeb77802a8624bf…`, the broken file. Restart policy is `no` (systemd owns it),
  so it survives a crash — but **any recreate, including a reboot, reverts it silently**. See
  `terrain_root_cause_2026-08-04.md`, corrected today.
- **`verify_publish_safe` is RED** — 7/8. It fails *closed* (exit 1, verified; an audit agent
  claimed exit 0 and was wrong). Four structural hits in tracked source; the **exported site scans
  clean** across 4938 files.
- **The `OAS-` prefix rule is now in the denylist** (operator's ruling, 2026-08-04), superseding the
  four literals `OAS-788/789/790/808`. The matcher is a plain substring test, so the bare prefix
  needed no code change. **It found more than the manual grep did on its first run:**

  | file | occurrences |
  | --- | --- |
  | `content/generated/docs.json` | 20 |
  | `content/generated/mcp.json` | 2 — **a file the manual search missed entirely** |

  Distinct ids: `OAS-001` ×2, `OAS-673` ×3, `OAS-710` ×17.

  **And it corrects something stated earlier in this receipt.** The line below said *"the exported
  site scans clean across 4938 files"*. That was the gate's honest answer **under the old
  denylist** — and it was blind, because `OAS-` was not a declared value. With the rule in place the
  **export check now FAILS**, naming 8 built pages under `/wiki/cookbook/master-plan/` and
  `/wiki/cookbook/recipes-l3-organ-heart-lab/`. The same blindness, one layer further out.

  The gate is now RED on three checks and **stays red until the corpus is dealt with** — the house
  pattern; a gate that goes green before the work is done is worse than no gate. Whether these ids
  are sensitive at all remains **the operator's call**: if they are, his own locked rule says such
  documents are *refused, never redacted*; if they are not, the rule wants narrowing rather than the
  content changing.

  **Durability — resolved 2026-08-04 by moving the rule upstream, and it corrects something
  else stated in this receipt.** I said *"a regeneration upstream will drop the prefix rule
  unless the generator is updated too."* Measurement then showed there is **no generator** on
  this box — the *"GENERATED, NEVER COMMITTED"* header is a discipline label (never commit
  it, don't index what we defend), not a build step. So my framing was inference from the
  header rather than measurement.

  The real defect was the shape. `OAS-` is a **category rule** (project-key prefix, catches
  every sibling), not a **value** (a specific sensitive string). `patterns.local.json`'s own
  preamble draws that line: *"the sensitive VALUES live in safety/patterns.local.json...
  this file — the public one — carries only the CATEGORIES."* Publishing "OAS-" leaks nothing
  (it names the key, not what any ticket is about); publishing "[redacted: client-identifier]" would identify
  the thing protected. Different classes, different homes.

  `OAS-` is now in `verify_publish_safe.cjs` as `COMMITTED_CATEGORY` — the committed gate
  source, alongside `STRUCTURAL`. Removed from `patterns.local.json` to avoid double-reporting.
  A mutation test asserts the rule bites on `OAS-999` AND leaves `ABC-999` clean (11/11
  mutations pass). Hits are now labelled `[cat:oas-ticket-prefix]` rather than an anonymous
  `[denied#N]` — a public label, because the rule itself ships publicly.

  **Durable by construction: the rule is what the gate runs, in one place, its regeneration
  story is `git`.** No future generator of `patterns.local.json` can drop it — it does not
  live there. See the block above `COMMITTED_CATEGORY` for the criterion (a rule belongs
  upstream when publishing the rule itself leaks nothing) and the mutation test alongside
  the existing structural mutations.
- **No gate consumes** the audio signal, the window-state signal, or the camera-link signal.
- The sign-off went out at **−29.7 dB** because voice level tracks the music bed and the bed was
  down. It needs a floor.

## The correction I owe my own record

I twice stated something as fact that measurement then refuted, and both are recorded rather than
quietly dropped: I reported **three** duplicate watchdogs when there were **two** (the third was my
own shell, matched by its own filter — which is also what killed that shell mid-command), and I
began to report the published ticket ids as a client leak before the context showed them to be
internal. Both corrections were made out loud, before acting on them.
