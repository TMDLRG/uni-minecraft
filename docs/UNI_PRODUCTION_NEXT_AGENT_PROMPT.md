# Master prompt for the next agent (paste into a fresh chat)

> Paste the block below into a new agent chat. Then share the additional repos (the YouTube video library
> repo(s) and content/film repos) when it asks. It will refine and expand the plan against everything it can
> see and write the result back into the Strings repo.

---

You are taking over the design and build of the **UNI Production Platform** — a full, end-to-end,
broadcast-grade LIVE production system for the **EducateWright** nonprofit and the **UNI** project. A working
foundation already exists; your job is to ingest the related repos (especially a **VAST existing YouTube
video library** and content/film repos the operator will share) and expand a saved plan into a complete,
buildable, **containerized-on-UNI.OS** design — then start building it.

**READ FIRST, in this order:**
1. `C:\Users\mpolz\Documents\Strings\docs\UNI_PRODUCTION_PLATFORM.md` — the grounding plan. Read it fully.
2. `C:\Users\mpolz\Documents\Strings\viewer\director_show.cjs`, `obs_stage.cjs`, `launch_channels.ps1`,
   `obs_inventory.cjs` — the PROVEN production foundation (an external **Director** cues a **set-once OBS
   vision-mixer**; OBS passes **ONE feed** to YouTube).
3. The Claude memory note **ops_multifeed_broadcast** — the architecture + the hard-won dual-GPU/WGC/CEF
   rendering lessons.
4. `C:\Users\mpolz\Documents\UNI.OS\services\glass\` (the REAL `/glass` cockpit), `services/control_mcp\`
   (the appliance MCP + approval gate), and `docs/plans/GLASS_COCKPIT_AND_APPROVAL.md`.

**ESTABLISHED FOUNDATION (build on it; do not relitigate):**
- The **Director model**: ONE external show-runner cues a set-once vision-mixer; the encoder passes ONE feed.
  Never pile sources into the encoder.
- On the Windows dev box, WebGL renders black in OBS CEF + cross-origin iframes; only real Chrome windows
  captured via WGC work. **This is a dev-box artifact and goes away once containerized on UNI.OS/Linux —
  design for the container target, not the dev box.**
- The real glass cockpit = `https://10.190.245.122/glass/` (NOT the `:8080` builder).
- The Minecraft colony production (Strings: `viewer/director.js` / `SP.Producer` / `:3020`) is
  self-contained — it is ONE source; leave it alone.

**THE GOAL:** a **7-day-a-week** live broadcast, **4 hours × 3/day** to cover all time zones, **multilingual**,
at **CNN/BBC/PBS/Twitch** quality, run by **ONE operator + guests + the UNI expert (AI)** with a full
**LLM/MCP-backed production team**. It must run as **containers in UNI.OS** (move the entire pipeline off the
dev box). Mission: the science feed for UNI + EducateWright — end school shootings, solve trauma, align
mental-health treatment to nature, world peace, global understanding, free food/water/health, and a path to
travel the stars.

**REQUIRED CAPABILITIES (expand each into a buildable, containerized design):**
- A containerized vision mixer/compositor on UNI.OS → ONE program → RTMP/SRT → YouTube (+ restream to
  Twitch/others).
- The **UNI Producer**: an LLM/MCP-driven show-runner that owns the run-of-show, cues cuts, controls **music
  volume + auto-ducking under speech**, writes & **speaks narration (multilingual TTS)**, manages guests, and
  obeys the operator's **voice OR text** commands (the one-man-band pedalboard).
- An **MCP production extension** so any LLM can drive the whole show (`cut_to`, `set_music_volume`, `duck`,
  `narrate(text,lang)`, `admit_guest`, `roll_clip`, `set_overlay`, `start_segment`, `schedule`, …), with
  destructive ops human-approval-gated.
- Sources: operator webcam(s)+mic, the colony cam, `/glass`, graphics overlays, and pre-recorded content from
  the **existing YouTube library**.
- **Remote guests**: a simple UNI.OS-hosted website where a guest connects cam+mic, authenticates, lands in a
  **green room**, and the host admits them to air (WebRTC; talking-head + panel layouts; multiple guests).
- A **broadcast graphics package**: lower-thirds, tickers, full-screen titles, bumpers, multilingual
  captions/subtitles, brand, clocks, ON AIR.
- A **scheduler/playout** for 24/7 resilience with fallback content from the YT library.
- **Multilingual** captions + narration.

**WHAT YOU MUST DO:**
1. Ingest the repos the operator shares — the YouTube video library repo(s), the content/film repos — plus
   UNI.OS, uni-mind, and Strings. Map what content exists and how it is produced.
2. Refine/expand `docs/UNI_PRODUCTION_PLATFORM.md` into a complete, buildable design: pick the containerized
   mixer tech, the WebRTC stack, the MCP tool surface, the graphics framework, the TTS/caption stack, the
   scheduler, and the restreamer — justify each choice.
3. Produce: Podman **quadlet container specs** for UNI.OS, the **MCP extension spec**, **run-of-show
   templates + a run-of-show guide**, the **guest-join app** design, the **operator control UI** (voice +
   text), and a phased build roadmap.
4. Save everything back into the Strings repo (`docs/` + a new `production/` tree), grounded in the proven
   foundation.

**CONSTRAINTS:** free/open tooling; containerized on UNI.OS (rootful Podman, quadlets, uni-lab MCP with
human-approval-gated mutations — you cannot self-approve); honesty (timestamp + source every status claim);
do not stress the dev box. Keep ONE operator + guests + the UNI expert able to run a CNN/BBC/PBS-par show by
voice or text.
