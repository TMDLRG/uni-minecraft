# ADR-PROD-012 - Encoder placement policy: any physical host with a real GPU AND not the ERP appliance

- **Status:** Accepted
- **Date:** 2026-07-12
- **Deciders:** UNI Production architecture
- **Supersedes-in-part:** ADR-PROD-003 (encoder host and codec: dedicated broadcast node) — for the
  *host classification* rule, not the codec floor (x264 `faster` 720p30 stays as the software fallback;
  NVENC preferred when the host GPU supports it)
- **Master contract:** `docs/STUDIO_SYSTEMS.md`, ADR-PROD-011 (native OBS on render host)

## Context

ADR-PROD-003 wrote the encoder placement rule as "a dedicated non-ERP broadcast node" and implied that box
was a Linux server. In practice the mixer must run on a host with a real GPU (see ADR-PROD-011). Whether
that host is Linux or Windows is not the load-bearing question; the load-bearing questions are:

1. Does the host have a real GPU that can composite CEF-based overlays and (ideally) encode via NVENC/VAAPI?
2. Is the host classified as the ERP business appliance (`uni-lab` @ 10.190.245.122 / mesh 10.13.13.1)?

ADR-PROD-003 correctly answered #2 with "never on the ERP appliance." That invariant stays. What must be
made explicit is #1: encoder placement follows the GPU, not the OS.

## Decision

**An encoder may be sited on any physical host that satisfies BOTH:**

- **(a)** the host has an actual GPU capable of accelerated compositing (CEF browser sources render real
  pixels, not a black frame), and
- **(b)** the host's role classification is **not** the ERP business appliance.

Under the current fleet, the qualifying encoder host is **THINKER** (Windows 11, NVIDIA T1000 4 GB + Intel
UHD 630, LAN 10.190.245.196, non-ERP). **L1 uni-lab** (Matrox G200, no 3D, no hardware encode, ERP
appliance) is **forbidden** by (a) and (b) both. **node2 uni-lab-79740c** (headless Linux, no GPU) is
forbidden by (a) and collapses to relay-only.

Codec floor is unchanged from ADR-PROD-003: **x264 `faster` 720p30** is the software fallback that any
qualifying host must be able to sustain; NVENC/VAAPI is preferred when the host GPU supports it.

## Consequences

**Positive:**

- ERP appliance invariant preserved: no broadcast render or encode ever runs on `uni-lab` (10.190.245.122 /
  mesh 10.13.13.1). ADR-PROD-003's core protection stands.
- **Colony carve-out (2026-07-12, binding — ADR-PROD-013):** this never-render/encode-on-ERP rule governs the
  **broadcast surface only**. The SAME box `uni-lab` (`10.190.245.122`) is ALSO the rootless UNI-OS **colony
  host** — the Minecraft world + Phoenix/`SP.Producer` FEP brain + `body.js` bots run there rootless under `uni`
  (no GPU required), captured by THINKER over the LAN. "Never render/encode on the ERP appliance" does NOT mean
  "nothing UNI runs there": the colony (science lane) runs there permanently; only broadcast/render/encode never
  does. Do not read the ERP-appliance framing as "zero UNI surface."
- GAP G-ENC largely closes on the currently deployed fleet: T1000 NVENC available on THINKER; x264 `faster`
  floor kept as the safety net.
- Future-proof: a Linux non-ERP node with a real GPU (e.g. a dedicated headless render appliance) can host
  the encoder without another ADR — it satisfies both (a) and (b) as written.

**Negative:**

- Encoder placement is now tied to the physical GPU location. Adding a new encoder host means installing a
  GPU. Mitigated by the fact that this was already true in practice; ADR-PROD-003 just did not name it.
- DR is now 2 SPOFs (THINKER for encode + render, node2 for relay) instead of the previously-implied 1
  broadcast node. See `production/docs/GAPS_REGISTER.md` G-DR entry (updated).

## Gates preserved

- Placement compliance is auditable: `uname -a` + `lspci | grep -i vga` on Linux, `Get-CimInstance
  Win32_VideoController` on Windows, plus the ERP-appliance classification tag on each host's mesh entry.
  Any encoder starting on `uni-lab` fails the classification check and is refused before publish.
- Never claim LIVE from process existence — the 3-signal machine gate is unchanged.
- Human-typed `CONFIRM` on GO LIVE / OFF AIR (G-PA) is unchanged.

## What did not change

- The **codec floor**: x264 `faster` 720p30 is still the safety net. ADR-PROD-003's codec section stays
  authoritative there.
- The **never-on-ERP** invariant. This ADR restates it in more general terms; it does not weaken it.
- The **fleet approval queue** gates any mutating change on a non-local host (see the uni-lab MCP), so
  provisioning a new encoder placement still requires exactly one human approval.
