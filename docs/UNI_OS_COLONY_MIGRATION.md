# UNI Minecraft Colony → UNI.OS appliance — migration plan + OS-agent prompt

**Status (2026-06-21):** the colony is being migrated **off Thinker (local PC) onto the UNI.OS
appliance**, broadcast live as the "UNI.OS Live Workload Migration" world premiere.
- Thinker Minecraft world (`:25565`) = **paused** (graceful stop; world saved).
- Thinker OBS stream = **up**, showing the premiere card over the `:4000` glass cockpit.
- The bedrock fix (`SP.Brain.MC` surface preference) is **in the code** and travels with the colony.

## Appliance facts (verified via uni-lab MCP)
- `uni-lab`, Dell PowerEdge, `phase5_lab_os`. **39 GiB RAM (25 free), 5.5 TB disk (5.1 TB free)**, load ~4.4.
- Rootful Podman host. LAN `10.190.245.122` (eno4), WireGuard `10.13.13.1`, tailscale.
- Already running: biological-builder API `:8000`, aion AIF runtime UDP `:5515`, WSC world-bridge
  (`ready_phase4_wsc_adapters`), Prometheus/Grafana, cloudflared, forensic witness.
- **No colony container present** — the colony has never run here.
- Every mutating op (`podman_pull/run/quadlet_apply`, `nft` firewall via `os_exec`) **waits on a human
  approval** in the appliance's queue. Data on named volumes or `/srv` (avoid `/var/lib/uni`).

## Path A — lift-and-shift the colony as containers (now)
Repo: `TMDLRG/UNI.MineCraft`, branch `lab/ozone-life-uni-hard-science`. Stack:
1. **mc-server** — `eclipse-temurin:17-jre` + `mcserver/paper.jar`; world seed **8675309**;
   `server.properties` RCON on (`:25575` pass `sp`), `spawn-protection=0`. Volume for the world.
2. **uni-colony** — `elixir:1.16-otp-26` + the project; runs `ui/` Phoenix (`iex --sname uni --cookie sp
   -S mix phx.server`), serves the HUD `:4000` (`/stream`, `/`), reaches mc-server RCON. Carries the
   surface-preference fix. Pure-Elixir AIF — **no Nx/Rust/NIF/port** (standing invariant).
3. **uni-bodies** — `node:20` + `viewer/body.js` (mineflayer), `MC_HOST=mc-server`. N bodies.
4. **uni-cam** — `node:20` + **xvfb + mesa (headless GL)** + `viewer/director.js` (prismarine cam `:3020`).
   The headless WebGL context is the one genuinely new piece vs. Thinker.

Deploy: shared podman network so they resolve each other; `podman_quadlet_apply` (persistent) per
service; open `nft` for `:4000` + `:3020` on the LAN so **Thinker OBS captures them over the LAN** for
the stream (simplest cutover — no headless streaming yet). Verify: colony ticks (mailboxes 0, on the
surface), cam renders, HUD serves. Then OBS points "Colony Cam"/"Glass HUD" at
`http://10.190.245.122:3020` / `:4000` and cuts the program scene back from "Migration" to "Colony Live".

## Path B — native convergence (next)
Colony becomes a **WSC world on the appliance's own aion runtime** (`lab_world_register/attach`,
worldBridge, UDP `:5515`) — inference on UNI.OS, not Elixir; headless streaming on the appliance.
The "OS-as-mind" work. OS-agent's core domain.

## OS-AGENT PROMPT (copy to the OS agent)
> Deploy the UNI Minecraft colony (repo `TMDLRG/UNI.MineCraft`, branch
> `lab/ozone-life-uni-hard-science`) onto the UNI.OS appliance as persistent Podman services, per
> §"Path A" above. Build four images (mc-server, uni-colony, uni-bodies, uni-cam — the cam needs
> xvfb+mesa headless GL), wire them on a shared podman network (uni-colony+bodies+cam reach mc-server
> by name; RCON `:25575` pass `sp`; world seed `8675309`), deploy via quadlets, and open `nft` for
> `:4000` and `:3020` on the LAN so Thinker's OBS can capture them during the live cutover. Keep the
> WSC frozen (`worldStateInUShared: rejected`), no secrets in the repo, pure-Elixir colony invariant
> intact. Report: image build results, `podman_ps`, and a colony health check (agents ticking on a
> forested surface, mailboxes 0). Then hand back for the OBS cutover. All mutating ops are
> approval-gated — surface each for the human.
