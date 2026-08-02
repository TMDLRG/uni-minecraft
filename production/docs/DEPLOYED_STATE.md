# DEPLOYED STATE — P1 broadcast platform on uni-lab-79740c (LOCKED 2026-07-11)

> **⚠️ P7 CORRECTION (2026-07-12) — read [ADR-PROD-011](adr/ADR-PROD-011-native-windows-obs-on-render-host.md) + [ADR-PROD-012](adr/ADR-PROD-012-encoder-placement-policy.md) + [../../docs/STUDIO_SYSTEMS.md](../../docs/STUDIO_SYSTEMS.md) first.**
> The mixer / overlays / pubgate rows for node2 are **RETIRED** (P1 of the remediation removed
> `uni-bcast-pubgate`, `uni-bcast-mixer`, `uni-bcast-overlays`, `/opt/uni/production/*`, and pruned
> `/var/lib/uni/broadcast/*` to just `mediamtx.yml` + `certs/`). Only `uni-bcast-relay` remains on
> node2 — plus the fan-out authorization on mediamtx to accept publishes from THINKER LAN
> 10.190.245.196/32 on `uni/program` (P2). THINKER surface rows to add: native OBS (mixer), MediaMTX-local,
> `viewer/command_center.cjs`, `viewer/overlay_server.cjs`, `viewer/publisher.cjs`, `viewer/systray_watchdog.ps1`.
> L1 aborted attempt: `uni-bcast-overlays` container + `uni-bcast-obs` image + `/var/lib/uni/broadcast*`
> trees were removed under P1.3 as a documented reverted deployment.

This is the durable, machine-verifiable record of what runs. Re-prove at any time with the
committed gate — never trust a claim without it:

```
podman run --rm --network host -v /var/lib/uni:/w:ro -v /etc/containers/systemd:/q:ro \
  --entrypoint sh docker.io/alpine/git /w/broadcast-src/production/verify_p1.sh
```

## The lock (how "aligned" is made non-mistakable)

1. **Repo == node, byte-proven.** The node's build/config source `/var/lib/uni/broadcast-src`
   is an exact unpack of `git archive a5d1a85` (tarball sha256
   `c1f6bdc1c724ddf390418397420e0a0231b291423518cfe70fbb3b4c9435a727`, verified with
   `sha256sum -c` on the node before unpack; provenance stamped in
   `/var/lib/uni/broadcast-src/SHIP_PROVENANCE.txt`).
2. **Deployed control files == git index, sha-for-sha** (verified 2026-07-11T21:12:33Z by the
   gate, after re-applying the canonical bytes):

   | file | sha256 (git index @ a5d1a85 == node) |
   |---|---|
   | /etc/containers/systemd/uni-bcast-mixer.container | `e7a2ad2ff2caca8965cba3f29ae6e2502b85502729b7a8d988e707a76ede046f` |
   | /etc/containers/systemd/uni-bcast-relay.container | `39d6f87c2cfee18ccf6a115594d7af6031879fc475c53c01f1f40692a726992c` |
   | /etc/containers/systemd/uni-bcast-overlays.container | `7e782f65e740a068873c18930c290923d24b202446e99819cced101b0562b211` |
   | /var/lib/uni/broadcast/mediamtx.yml | `9d314adb33f1a657768fb1dd11c5d07c2d15f3011e24273e7dc6c2f6309a531a` |
   | /var/lib/uni/broadcast/overlays/Caddyfile | `e8ce5d3ca57bfca5421de11635a8b27902ab4b0cc68fc1b83e462d58fbbb39d6` |

3. **Image provenance.** `localhost/uni-bcast-obs:latest` = `2fea38dd798f…`, built ON the node
   FROM the sha-verified archive context (commit a5d1a85). Upstream images recorded at pull:
   caddy:alpine config `af555904a096…`, mediamtx:latest-ffmpeg config `92b88836e05d…`,
   alpine/git `43bd018f4d0e…`, podman/stable `bbd66b0da1dc…`. The box never auto-pulls
   (platform policy), so tags cannot drift silently.
4. **Line endings are enforced at the git layer** (`/.gitattributes`: `production/** eol=lf`,
   index renormalized) and ships go via `git archive` (index bytes), never the working tree —
   the CRLF incident class is structurally dead.
5. **Claim rules are binding** (docs/STUDIO_SYSTEMS.md): platform-up claims require this gate;
   overlay claims require viewer/verify_overlays.cjs; colony claims require
   colony_count == RCON − Director.

## Why this state is stable (mechanism, not vibes)

- All three broadcast containers are **systemd-supervised quadlets** with `Restart=on-failure`
  + bounded `StartLimitBurst` (no crash-loop spam), `[Install] WantedBy=multi-user.target
  default.target` → regenerated and **auto-started at boot** by podman-system-generator.
- `uni-production-mcp.service` is `systemctl enable`d (symlink in multi-user.target.wants),
  `Restart=always`.
- Verified surfaces (gate run 2026-07-11T21:12:33Z, all PASS): overlays :8099 state+page,
  relay :9997 API + `uni/program` configured, mixer :4455 obs-websocket (426), MCP **:8095 (401 token-gated)**.
- Containers observed Up post-restart onto canonical bytes; spool + configs on persistent
  `/var/lib/uni` (NVMe, 158G free), not tmpfs.

## Preflight addendum (2026-07-11 ~21:20Z — two more truths found and fixed)

- **Port collision, fixed:** the designed `:8094` belongs to `uni-glass-configure.service` on THIS
  node (lab-os allocation; free on the appliance where the design was authored). The production-MCP
  crash-looped on Errno 98 while the glass configurator's 404s answered health probes — a false
  "RUNNING". Moved to **`:8095`** (ss-verified free) in the unit, the gate, and the nginx reference.
- **Second drift-guard fix:** `server.py` `_APPROVALS` had the same bare-guard bug as `_AUDIT`
  (crash on lab-os predating the `Approvals` class); fixed with the same hasattr guard — zero
  bare-guard patterns remain (grep-verified).
- **Gate hardened:** check #5 now DOUBLE-probes with a 6s gap + documents
  `systemctl is-active uni-production-mcp` as the authoritative liveness — a single probe was
  fooled by the port-collision 404s. **The healthy signature is `401 Unauthorized`** (the real
  MCP fail-closing unauthenticated requests); a 404 is the impostor signature and is REJECTED.
- **Final preflight verdict (21:27:16Z): gate ALL PASS against the real service** —
  `is-active: active`, `:8095` 401-token-gated on both probes, all shas index-identical.

## 2026-07-12 — broadcast-lane deployments (show-runner + safety + observability)

Each item below is backed by a captured gate in `production/docs/receipts/` (named). All shipped via
`git archive` of a pushed tag, sha-verified on-node; all node mutations approval-gated via the uni-lab MCP.

- **Show-runner LIVE.** `uni-producer` + `uni-playout` host services deployed to
  `/opt/uni/production/{producer,playout,mixer}` and `systemctl enable --now` (boot-persistent). The mixer
  now has the **8 canonical scenes built** (`build_scenes` → BUILD COMPLETE, OBS canvas pinned 1280x720@30),
  program on **STANDBY**. Overlays-on-program PROVEN: `verify_scenes` → `SCENE PROOF: PASS`. Show-runner
  wiring proven end-to-end (`start_segment → run_template → beats`). Receipt: `phase_ix_deploy_2026-07-12.md`.
  Venv gained `websocket-client` + `requests` (the obs/tts adapter deps — the MCP's 401 had never exercised
  those paths).
- **Panic kill-switch LIVE.** `panic` MCP verb deployed to `:8095` (session-authed, audited, NOT
  human-gated); MCP restarted clean (verify_p1 401 double-probe → startup bijectivity passed). Backups
  `server.py/help.py.bak-prepanic` on-node. Receipt: `panic_verb_deploy_2026-07-12.md`. Operator PANIC
  rehearsal (human-typed firing) still pending → G-STOP partial.
- **Observability LIVE.** `uni-heartbeat.timer` enabled (60s, boot-persistent), writing `heartbeat.ndjson`
  with `p1_gate_pass` (re-runs verify_p1 each tick). `notify.sh` alert path wired (needs `UNI_NOTIFY_URL`).
  Receipt: `heartbeat_deploy_2026-07-12.md`. → G-OBS partial.
- **Colony scene GATED off program.** Colony forage RED = WITHHELD (colony lane). The producer substitutes
  any `COLONY`-scene beat → `STANDBY` unless `UNI_COLONY_ONAIR` is set (default off) — proven on-node. Flip
  when the colony passes its RED: `UNI_COLONY_ONAIR=true` in `/etc/uni/runtime.env` + restart `uni-producer`.
- **Standby content bootstrap.** `catalog.json` (4 placeholder rows) + a SMPTE-bars `placeholder.mp4`
  (visible inside the mixer container); `uni-playout` reloaded `catalog rows=4`. Provenance:
  `production/catalog/BOOTSTRAP.md`. Real content stays gated on G-YTLIB + G-MUSIC (operator).
- **G-PA closed** (`corroborated`): red-team 3/3, ledger-confirmed (`g_pa_red_team_2026-07-11.md`).
- **LiveKit SRI**: real client vendored + real SHA-384 pinned (`production/overlays/vendor/`).
- **`prod-mcp.conf` authored** (`production/nginx/prod-mcp.conf`) — deploy is operator-coordinated (shared
  nginx; node co-hosts the SolutionWright stack).

## Honest scope (what "stable" does NOT yet claim)

- **(Updated 2026-07-12 — see the deployments section above.)** The mixer now has the 8 scenes built and
  program on STANDBY, and producer/playout are deployed — BUT the relay still publishes **no program**
  (`ready:false` is correct): nothing is broadcast until the human-typed `start_broadcast` (G-PA). Colony
  source stays OFF program (WITHHELD; gated).
- Still NOT deployed: captions + livekit quadlets (guests/captions are downgrade-permitted for first-light),
  nftables guest ports; the `nginx /prod-mcp` conf is authored but its deploy is operator-coordinated (shared
  web front). Producer/playout host services ARE now authored + deployed (the earlier "never authored" gap is
  closed).
- Phase I/XIII private unlisted smoke test not run (needs operator-held YT key at that moment).
- Node is shared with the aion/orchestrate stack; encode floor is 720p30 x264 (G-ENC open).
- Incident recorded + repaired: `/etc/uni/runtime.env` overwrite, restored from the Jul-3
  backup; a Jul-3 `UNI_APPROVALS_AUTOAPPROVE` line was NOT recoverable — operator re-adds it
  if approvals start prompting after the node's next service restart/reboot.

---

## Replaced by UNI (self-authored changes)

This table grows over time. Every row is a UNI-authored change that was landed through
`uni_propose_change` (`production/mcp/SPEC_uni_propose_change.md` — C-C1 in the
UNI OS+MIND Deepening Plan) via the SAME MERGED VERDICT ship gate as any operator change.

Adding a row REQUIRES:
- a MERGED VERDICT of `SIGN` or `SIGN_WITH_CHANGES` at the linked receipt,
- a typed spec + paired RED launcher (per `docs/LAB_PROTOCOL.md` §II),
- an evidence bundle conforming to `production/schemas/evidence_bundle.schema.json`.

**Charter link:** `CLAUDE.md:16-21`.

| Tag | Files touched | MERGED VERDICT receipt | Date | Evidence class |
|---|---|---|---|---|
| _(none yet — this table starts empty; the `uni_propose_change` verb is a SPEC awaiting `/lab-team-review`)_ | — | — | — | — |

**How to add a row**:
1. Run `runs/lab_team_review.exs` against your candidate SHA.
2. Land the review verdict receipt (`docs/receipts/lab_team_review_<sha>.md`) with `SIGN` or `SIGN_WITH_CHANGES`.
3. Compose the evidence bundle.
4. Call `uni_propose_change(...)` on the production MCP; wait for human approval.
5. On approval, the verb writes `production/docs/receipts/uni_authored_<tag>.md` AND appends the row here.

Do NOT edit rows by hand: the append pathway is the ONLY writer for this table.
