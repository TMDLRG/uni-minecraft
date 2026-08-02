# Voice control: mic -> STT -> intent -> production MCP

**What this is:** the voice-control grammar for the operator pedalboard. The operator speaks; the browser
captures the mic; an STT engine (whisper / faster-whisper, the same engine as `uni-bcast-captions`)
transcribes to text; an **intent resolver** maps the text to one production-MCP `tools/call`; the MCP
fires it under the same audit + session-gating as a button click. Anything the deterministic grammar does
not match falls through to an **LLM** that proposes a tool call (still gated).

This pairs with `DESIGN.md` (the panel) and `liveview-route.md` (the LiveView). The fixed tool surface is
in `docs/UNI_PRODUCTION_PLATFORM.md`; this doc adds no verbs. Voice has **no extra privilege** - it routes
through the identical MCP path, so gated verbs stay gated and a "go live" spoken command still needs a
human approval.

**Evidence posture:** DESIGN/REFERENCE, status `pending`. Nothing here runs yet. Honesty footer at the
foot.

---

## 1. The pipeline

```
  mic (getUserMedia / operator headset)
   -> STT  (whisper-cpp / faster-whisper; the captions engine reused)  -> transcript text
   -> NORMALIZE (lowercase, strip filler, number words -> digits)
   -> GRAMMAR MATCH  (the table in section 2; deterministic, fast, no network)
        |- hit  -> { tool, args }  -> confirm-if-risky -> MCP tools/call
        |- miss -> LLM FALLBACK (section 4): free text -> Claude -> proposed { tool, args }
                      -> ALWAYS show the proposal to the operator before firing -> MCP tools/call
   -> the same audit + session-gating as a click (gated verbs park pending; no extra privilege)
   -> the panel's read poll reflects the result
```

Three honesty rules baked into the pipeline:

1. **Show what was heard.** The recognized transcript is displayed (the footer "last heard" line) before
   any irreversible action; low-confidence STT (below a threshold) is shown but **not** auto-fired.
2. **Confirm the risky ones by voice or tap.** Outward-facing verbs (`start_broadcast`, `stop_broadcast`,
   `admit_guest`, `schedule`) require an explicit second confirmation - spoken ("confirm go live") or a
   tap - on top of the MCP human-gate. Voice cannot bypass the gate.
3. **The MCP is still the authority.** The intent resolver only chooses a tool + args; it never mutates
   show state directly. Gating + audit happen in the MCP.

---

## 2. The deterministic grammar (spoken command -> tool call)

Patterns are matched case-insensitively against the normalized transcript. `{...}` are captured slots.
Scene words map to the fixed scene set `COLONY GLASS GUESTS CLIP NEWSDESK TITLE STANDBY PIP`.

| Spoken (examples) | Intent | MCP tool | Args | Gating |
|---|---|---|---|---|
| "cut to colony" / "take colony" / "go to the colony" | cut | `cut_to` | `{scene:"COLONY", transition:"cut"}` | session-auth |
| "fade to glass" / "dissolve to glass over 600" | cut (fade) | `cut_to` | `{scene:"GLASS", transition:"fade", ms:600}` | session-auth |
| "cut to guests" / "panel" / "two shot" | cut | `cut_to` | `{scene:"GUESTS"}` | session-auth |
| "go to standby" / "drop to standby" | cut | `cut_to` | `{scene:"STANDBY"}` | session-auth |
| "picture in picture" / "p i p" | cut | `cut_to` | `{scene:"PIP"}` | session-auth |
| "music up" / "music to twenty percent" | level | `set_music_volume` | `{level:0.20}` | session-auth |
| "music down" / "quieter" | level (delta) | `set_music_volume` | `{level: cur-0.05}` | session-auth |
| "duck the music" / "duck" | duck on | `duck` | `{on:true}` | session-auth |
| "unduck" / "music back up" / "bring the music back" | duck off | `duck` | `{on:false}` | session-auth |
| "narrate {text}" / "say {text}" / "read this: {text}" | narrate | `narrate` | `{text, lang:"en"}` | session-auth |
| "narrate in spanish {text}" / "in hindi say {text}" | narrate (lang) | `narrate` | `{text, lang:"es"|"hi"}` | session-auth |
| "lower third for {name}" / "name strap {name}" | overlay | `set_overlay` | `{layer:"lowerThird", payload:{visible:true, title:"{name}", kicker:"UNI EXPERT", tone:"ok"}}` | session-auth |
| "clear the lower third" / "hide the name" | overlay hide | `set_overlay` | `{layer:"lowerThird", payload:{visible:false}}` | session-auth |
| "ticker {text}" / "add to the ticker {text}" | overlay ticker | `set_overlay` | `{layer:"ticker", payload:[...,{text,tone:"ok"}]}` | session-auth |
| "title card {text}" / "full screen title {text}" | overlay title | `set_overlay` | `{layer:"title", payload:{visible:true, text:"{text}"}}` | session-auth |
| "captions on" / "captions off" | overlay caption | `set_overlay` | `{layer:"caption", payload:{visible:true|false}}` | session-auth |
| "roll {clipId}" / "roll BnB phase one" / "play the BnB phase one clip" | roll | `roll_clip` | `{clipId:"BNB-P1", mode:"cut"}` | session-auth |
| "queue {clipId}" / "line up {clipId}" | roll (queue) | `roll_clip` | `{clipId, mode:"queue"}` | session-auth |
| "start the interview" / "interview segment" | segment | `start_segment` | `{template:"Interview", params:{}}` | session-auth |
| "panel of three" / "go to panel" | segment / layout | `start_segment` | `{template:"Panel"}` | session-auth |
| "talking head" / "single shot" | layout | `set_layout` | `{template:"talking-head"}` | session-auth |
| "drop the guest" / "send {name} to the green room" | remove | `remove_guest` | `{guestId:"{resolved}"}` | session-auth |
| "admit the guest" / "bring {name} up" / "send {name} to air" | admit | `admit_guest` | `{guestId:"{resolved}"}` | **HUMAN-GATED** |
| "save this slot" / "schedule this run of show" | schedule | `schedule` | `{slot, runOfShow}` | **HUMAN-GATED** |
| "go live" / "we are live" / "start the broadcast" | go live | `start_broadcast` | `{target:"youtube"}` (dry-run then confirm) | **HUMAN-GATED + 2-step confirm** |
| "stop the broadcast" / "we are off air" / "kill the stream" | stop | `stop_broadcast` | `{}` (dry-run then confirm) | **HUMAN-GATED + 2-step confirm** |
| "open a session" / "open the live session" | session | `open_session` | `{verbs:[in-show]}` (operator pre-auth) | one human act |
| "close the session" | session | `close_session` | `{}` | - |
| "what's on air" / "show state" | read | `get_show_state` | `{}` | read (never gated) |

Slot resolution:
- **Scenes:** a small synonym map ("the colony"->COLONY, "the os"/"glass"/"cockpit"->GLASS,
  "guests"/"panel"->GUESTS, "clip"->CLIP, "news desk"->NEWSDESK, "title"->TITLE, "standby"->STANDBY,
  "pip"/"picture in picture"->PIP).
- **Clip ids:** spoken phrases map to catalog ids via the catalog's title/alias index (e.g. "BnB phase
  one" -> the catalog row whose alias is "BnB phase 1" -> `clipId BNB-P1`). The resolver fetches the
  catalog via `list_clips` and fuzzy-matches; ambiguity is read back ("did you mean BNB-P1 or BNB-P10?").
- **Guest names:** matched against `list_guests` names; ambiguity is read back.
- **Numbers/percent:** "twenty percent" -> 0.20; "over six hundred" -> ms:600.

A reference resolver (deterministic, no LLM, runs in the browser before any fallback):

```javascript
// voice-intents.js (reference) - returns {tool, args, risky} or null on a miss.
function resolveIntent(transcript, ctx) {       // ctx = { music, clips, guests }
  const t = transcript.toLowerCase().trim();
  const scene = matchScene(t);                  // synonym map -> one of the 8 scene names
  if (/^(cut|take|go) to|^take /.test(t) && scene)
    return { tool: "cut_to", args: { scene, transition: /fade|dissolve/.test(t) ? "fade" : "cut",
             ...(msFrom(t) ? { ms: msFrom(t) } : {}) } };
  if (/duck the music|^duck\b/.test(t)) return { tool: "duck", args: { on: true } };
  if (/unduck|music back|bring the music/.test(t)) return { tool: "duck", args: { on: false } };
  if (/music (up|down|to)/.test(t)) {
    const pct = percentFrom(t); const cur = ctx.music?.volume ?? 0.18;
    const level = pct != null ? pct : /down|quieter/.test(t) ? cur - 0.05 : cur + 0.05;
    return { tool: "set_music_volume", args: { level: clamp01(level) } };
  }
  let m;
  if ((m = t.match(/^(?:narrate|say|read this:?)\s+(.+)/)))
    return { tool: "narrate", args: { text: cap(m[1]), lang: langFrom(t) } };
  if ((m = t.match(/lower third for (.+)|name strap (.+)/)))
    return { tool: "set_overlay", args: { layer: "lowerThird",
             payload: { visible: true, kicker: "UNI EXPERT", title: cap(m[1]||m[2]), tone: "ok" } } };
  if (/clear the lower third|hide the name/.test(t))
    return { tool: "set_overlay", args: { layer: "lowerThird", payload: { visible: false } } };
  if ((m = t.match(/^(?:roll|play)\s+(.+)/))) {
    const clipId = resolveClip(m[1], ctx.clips); if (clipId)
      return { tool: "roll_clip", args: { clipId, mode: /queue|line up/.test(t) ? "queue" : "cut" } };
  }
  if (/admit the guest|bring .* up|send .* to air/.test(t)) {
    const guestId = resolveGuest(t, ctx.guests);
    return { tool: "admit_guest", args: { guestId }, risky: true };   // human-gated
  }
  if (/go live|we are live|start the broadcast/.test(t))
    return { tool: "start_broadcast", args: { target: "youtube" }, risky: true };  // gated + 2-step
  if (/stop the broadcast|off air|kill the stream/.test(t))
    return { tool: "stop_broadcast", args: {}, risky: true };          // gated + 2-step
  return null;   // -> LLM fallback
}
```

`risky:true` intents always require the spoken/tap confirmation AND remain MCP-human-gated. The browser
then calls `mcp(tool, args)` (the same function in `control.html` / the same `handle_event` path in
`ControlLive`).

---

## 3. Confirmation + safety behaviour

- **Read-back before firing irreversible verbs.** For any `risky` intent the UI speaks/shows
  "Going live to YouTube - say 'confirm' or tap GO LIVE" and waits. Only a second explicit confirm starts
  the MCP 2-step (`dryRun` then `confirm`), which is itself human-gated.
- **STT confidence gate.** Below a confidence threshold the transcript is shown but the intent is parked,
  not fired ("did you say 'cut to colony'? tap to confirm"). Mishears never cut the show silently.
- **Session scope.** When no live session is open, even in-show voice verbs park pending (the MCP gate).
  Opening a session ("open the live session") is itself a spoken intent that sets the operator allowlist -
  operator pre-authorization, not agent self-approval.
- **No voice privilege escalation.** The voice path cannot reach a verb the click path cannot; both share
  the identical MCP call + gating. There is no "voice override" of the human gate on outward verbs.

---

## 4. LLM fallback (free text -> tool call)

For anything the grammar misses ("bring up Dr Rivera's lower third and start the interview, but keep the
music low"), the transcript (or the typed command box) goes to an LLM (Claude over the MCP - the same
on-air persona infra, but here used only as an intent compiler). Contract:

- **Input:** the free-text command + a compact tool catalog (the fixed verb table + current `ctx` from the
  read tools: scenes, clips, guests, music level) so the LLM resolves slots against real ids.
- **Output:** a strict JSON array of `{tool, args}` proposals from the **fixed verb set only** - the LLM
  is system-prompted that it may emit no verb outside the table and may not invent scene/clip ids.
- **Gate:** the proposals are **shown to the operator** as queued chips ("set_overlay lowerThird Dr Rivera
  - start_segment Interview - set_music_volume 0.10"); the operator confirms (tap or "do it") before any
  are fired. Each then runs through the MCP with its normal gating - so an LLM that proposes
  `start_broadcast` still hits the human gate + 2-step.
- **Honesty:** the LLM compiles intent; it does not act. It cannot self-approve and cannot bypass the gate.
  Multi-step proposals are fired in order, each audited; a denied step stops the chain (no auto-retry).

Reference call shape (the resolver posts to the MCP's intent/LLM path; the exact tool name is fixed by the
MCP server - `command` / an `intent` tool - and this resolver matches it, adding no verb):

```jsonc
POST /prod-mcp
{ "method":"tools/call",
  "params":{ "name":"command",
    "arguments":{ "text":"lower third for Dr Rivera then start the interview, music low",
                  "context":{ "scene":"NEWSDESK", "music":{"volume":0.18},
                              "guests":[{"guestId":"g_rivera","name":"Dr A. Rivera"}] } } } }
```

The MCP/producer returns the proposed `{tool,args}` list (or, if configured to act, runs them through the
gate). The UI always surfaces the proposals before any outward verb fires.

---

## Status (honest)

- This is a **DESIGN/REFERENCE** grammar, status `pending`. No STT capture, intent resolver, or LLM
  fallback is deployed; the JS above is reference target shape, not running code.
- No banned-unqualified word is used as a claim (no: verified, proven, guaranteed, isolated, secure, 100%,
  certified, real). That voice has **no extra privilege** over the click path, and that risky verbs cannot
  be voice-bypassed, is the **intended** contract, **pending confirmation** by a captured run (GAP
  **G-PA**, Class-Sec).
- The tool names, args, scene set, and gating are taken **as captured** from
  `docs/UNI_PRODUCTION_PLATFORM.md`; the overlay payloads match
  `production/schemas/broadcast.schema.json`. The grammar invents no verb and no scene/clip id.
- STT/intent latency and accuracy are unmeasured and overlap GAP **G-CAP** (real-time multilingual caption
  latency/quality pending measurement); voice-command latency is `pending` likewise.
- Live-appliance safety: the voice path never targets the business stack (`solutionwright-*`, odoo, jitsi,
  cloudflared, portainer); the producer/LLM only proposes and cannot self-approve. Every action routes
  through the human approval gate exactly as the click path does.
