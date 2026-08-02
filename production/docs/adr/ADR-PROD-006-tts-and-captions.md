# ADR-PROD-006 - TTS + captions: Piper narration + faster-whisper captions

- **Status:** Proposed
- **Date:** 2026-06-21
- **Deciders:** UNI Production architecture
- **Master contract:** `docs/UNI_PRODUCTION_PLATFORM.md` (decision 5; unit `uni-bcast-captions`; GAP G-CAP)

## Context

The broadcast is multilingual and must reach all time zones: it needs **narration** in N languages (UNI
expert voice-overs, segment intros) and **live captions** + translated subtitles for accessibility and a
YouTube caption track. Piper is already the stack (`tts-sidecar:8500`, voices configured per language -
en / es / fr / it / pt / hi, plus the ClaudeSpeak EN+HI code-switch engine), observed this session
(Class-B/C). We must pick the caption engine and define how narration mixes against the music bed.

## Decision

- **Narration -> Piper.** The MCP `narrate(text, lang, voice?)` verb synthesizes a WAV (via the existing
  `tts-sidecar:8500`) and OBS plays it on a **dedicated narration bus** with the music bed **auto-ducked**
  (`duck` / `set_music_volume`, ADR-PROD-002/005). Per-language voices are selected by `lang`; the EN+HI
  ClaudeSpeak code-switch engine is available for Hinglish.
- **Live captions -> faster-whisper** (CTranslate2, open) as `uni-bcast-captions`
  (`127.0.0.1:8500`-class sidecar; Piper already on 8500 so the captioner gets its own port/binding per the
  quadlet). It transcribes the program/mic audio -> caption text; translation (the existing translator path
  or an LLM) yields multilingual subtitles. The caption overlay (`caption.html`, ADR-PROD-005) renders the
  current line + translations from `broadcast.json.caption`, and/or a YouTube caption track is pushed.
- Real-time **multilingual caption latency/quality is GAP G-CAP** (`pending_hardware`) - unmeasured until a
  captured run on the broadcast node.

## Alternatives considered

- **Cloud STT/TTS (e.g. a managed speech API) for captions/narration.** Rejected on free/open + on-appliance
  constraints, on the audit/approval model, and on not wanting outbound telemetry from the broadcast node.
- **whisper.cpp instead of faster-whisper.** Considered; faster-whisper (CTranslate2) is chosen for its
  throughput on the streaming transcription path and its straightforward translate option. whisper.cpp
  remains a documented fallback if the node lacks the CTranslate2 backends.
- **A different neural TTS than Piper.** Rejected: Piper is already deployed and voiced per language; reusing
  it avoids a second TTS toolchain and keeps the EN+HI code-switch engine that is already configured.
- **OBS-native captions / burned-in only.** Rejected as the only path: a data-driven caption line in
  `broadcast.json` lets the overlay render + translate + push a YT track, which OBS-native text cannot do.

## Consequences

- Reuses the deployed Piper TTS (no new TTS stack) and adds one open caption engine; narration auto-ducks
  the music bed for intelligible voice-overs. Honest tradeoff: real-time multilingual captioning is
  compute-hungry and its latency/quality on the chosen node is **unmeasured** - **GAP G-CAP**
  (`pending_hardware`); the design does not claim a latency or accuracy figure.
- Caption text and translations live in `broadcast.json.caption`, so the caption overlay and any YT track
  read one source of truth.
- The captioner sharing the 8500 family with Piper requires a distinct bind in the quadlet to avoid a port
  clash (a deploy detail, **pending**).
- Evidence class: Piper-deployed is **Class-B/C** as captured; faster-whisper latency/quality is
  **pending_hardware** (G-CAP).

## Links

- Master: `docs/UNI_PRODUCTION_PLATFORM.md`
- Stack: `tts-sidecar:8500` (Piper), the ClaudeSpeak EN+HI engine
- Related: ADR-PROD-005 (`caption.html`, `broadcast.json.caption`), ADR-PROD-002 (`narrate` / `duck`),
  ADR-PROD-009 (UNI-expert voice uses `narrate`)
- Gap: `production/docs/GAPS_REGISTER.md` row G-CAP
- Quadlet: `production/containers/systemd/uni-bcast-captions.container`

## Status (honest)

This ADR is a **design**, status `pending`; nothing new is deployed or claimed to run. No banned-unqualified
word is used as a claim. Piper-on-8500 is **Class-B/C** as captured 2026-06-21; faster-whisper real-time
multilingual latency/quality is **pending_hardware** (G-CAP). The business stack (`solutionwright-*`, odoo,
jitsi, cloudflared, portainer) is **never** a mutation target; the producer agent **cannot self-approve**.
