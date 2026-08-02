# uni-lab.local zone "regression" — drift diagnosis + fix receipt, 2026-07-15

Gate: **`dns-zone-registry-synced`** (PASS, class B — this file is its receipt).
Companion revision: `overlook-producer-4200` (superseded PENDING row — builder/scene coherence + the
Chromium finding below). Ship-from tag: **`dns-hosts-20260715T0545Z`** (commit `12ac247`).

## The report

From THINKER ~02:55 UTC: `nslookup gaia.uni-lab.local 10.190.245.122` → NXDOMAIN, same for
`producer.uni-lab.local`, against a zone whose 17 declared names all resolved fresh on 2026-07-12
(dns-setup CLOSED). Reported as a regression on the chip's `uni-dns` (rootful dnsmasq).

## Diagnosis — drift wearing a regression's clothes

Measured before touching anything (all reads):

- **The resolver was healthy the whole time.** `obs.uni-lab.local` and every other 07-12 name
  answered from THINKER; `:53` open (the 07-12 nftables `trusted` accepts intact); `uni-dns`
  container up; dnsmasq startup log read `... uni-lab.local.hosts - 36 names` (podman_logs audit
  `3576cf0ea04948b0`).
- **A 24-name sweep isolated the misses to exactly three: `producer`, `gaia`, `hud`.**
- **The chip's live hosts map was byte-identical to the 07-12 ship tag**: `os_file_read
  /etc/uni/dns/uni-lab.local.hosts` (audit `2d497a44ef1c442b`) hashed
  `785631aa860d142bba360804d0ce3d576688c2fe6ab7d60c2f4f70851caad40f` — the exact sha in the
  dns_phase0_4 receipt's ship-from lock. Nothing was lost, emptied, or corrupted.

Root cause: **registry↔hosts drift.** gaia + hud (built 2026-07-14) and producer (2026-07-15)
entered `viewer/infra_registry.json` without the same-breath `production/dns/uni-lab.local.hosts`
update the DNS README requires ("keep the two in sync"). Their names never existed in the zone; the
"previously answered" premise held only for the 07-12 names, which never stopped answering.

## The fix (repo → pushed tag → chip, per the production shipping law)

1. Repo: three A records added (`producer → 10.190.245.122`, `gaia → 10.190.245.196`,
   `hud → 10.190.245.196` with an honesty comment — the native HUD binds loopback-only, resolving ≠
   LAN-reachable). README now states the burned-in same-commit rule. Commit `12ac247`, tag
   `dns-hosts-20260715T0545Z`, pushed; tag bytes sha256
   `fc93bcb3385539cfa5a02b8106b78fecea6b11d9304bc787566fa526748f1382`.
2. Ship: `os_file_write /etc/uni/dns/uni-lab.local.hosts` (audit `1e4edcbe4fbf4493`) — envelope
   sha256 == tag sha; `os_file_read` read-back (audit `80537a0bd9464ed5`) == tag sha.
3. **The single-file bind-mount inode trap, proven live:** the quadlet mounts the hosts file as a
   single-file `:ro` volume; `os_file_write` is atomic (temp+rename), so the host path got a NEW
   inode while the running container kept the OLD one. `podman exec uni-dns cat …` (os_exec
   two-step, audits `f6dadf47552b4c01` dry / `87f347fa0a9b4642` confirm) still hashed `785631aa…`
   inside the container after the host write. **SIGHUP was therefore ruled out by measurement** — it
   would have re-read the old inode.
4. Reload = **one clean unit-level restart**: `systemctl restart uni-dns` via os_exec (audit
   `a7e273893bd046a4`, rc 0). Deliberately NOT `podman restart` (the 07-12 receipt's
   quadlet-lifecycle fight) and **nothing touched nftables** (no reload/flush — the ERP/netavark
   hazard). `uni-dns` is `network=host`, so its restart involves zero netavark state. Honest
   deviation from the "no container replacement" intent: the container WAS replaced once, cleanly,
   by its own systemd unit; a zero-downtime reload is structurally impossible with single-file
   mounts (follow-up below).
5. Post-restart log (audit `1d81410feb5c434b`): `read /etc/uni/dns/uni-lab.local.hosts - 39 names`
   (36 + 3). No crash-loop (one startup block).

## Verification (all from THINKER)

- Direct to the chip resolver: `gaia → 10.190.245.196`, `hud → 10.190.245.196`,
  `producer → 10.190.245.122`; full regression sweep of every declared name unchanged (`mc` stays
  `10.89.1.40` COLNET; `uni-lab-lan → .122`; relay/tab/thinker/node2 all exact).
- Windows resolver path (what real apps use): NRPT rule `.uni-lab.local → 10.190.245.122` active;
  `Resolve-DnsName` answers all three new names correctly after a cache flush.
- node `getaddrinfo` path: `producer.uni-lab.local → 10.190.245.122`, and
  `GET http://producer.uni-lab.local:4200/producer/health` **by name** returned
  `verdict=LIVE driver=producer colony_count=6`.

## The Chromium finding (measured, load-bearing for the IP→name migration)

`http://producer.uni-lab.local:4200/producer/health` in Chrome → **error page**, while the same URL
by IP renders the full health JSON — and `http://masterplan.uni-lab.local:4100/` (a name declared
and OS-resolvable since 07-12) **also error-pages**. So Chromium-engine consumers on THINKER do not
resolve `.uni-lab.local` at all, and never did — Chromium resolves on its own path (built-in
async resolver / secure-DNS, plus RFC 6762 treats `.local` as mDNS), bypassing NRPT. The OS
resolver, node, and nslookup are unaffected. This was invisible until a `.uni-lab.local` URL was
actually driven through a browser engine.

**Consequence — the migration is split by consumer, not done wholesale:**

- **Node-side probes → DNS names** (proven live): `COLONY_HOST` defaults in `viewer/launcher.cjs`,
  `viewer/door_lifecycle.cjs`, `viewer/command_center.cjs` are now `uni-lab-lan.uni-lab.local` (the
  hosts map's plane-forced chip-LAN alias; env override preserved). Live-verified after a
  watchdog-respawn deploy: colony tile `driver=producer verdict=LIVE colony=6` through the name.
- **Browser-engine-consumed URLs → registry-DERIVED IPs, zero literals**: a tiny `regUrl(name,
  path)` derives `http://<ips[0]>:<port><path>` from `viewer/infra_registry.json` (the ONE allowed
  IP source). Applied to the OBS browser-source builder (`studio_stage.cjs` `cap_overlook`,
  `cap_web`) and the operator-clicked hrefs (`door_lifecycle.cjs` producer/colony/colonycam,
  `launcher.cjs` Producer-stream). Live-verified: door hrefs render the declared IPs.
- **Name unification for browser surfaces is a named follow-up**, not silently attempted: either
  the pre-planned `.local → .internal` zone flip (the README's escape hatch — this finding is that
  clause's trigger condition) or a bring-up whose stage-3 SEEN sweep proves CEF resolves the zone.

## Found + fixed in the same pass (latent revert bug)

`studio_stage.cjs` still BUILT `cap_overlook` at `:4000/stream` — missed by the eef66cc re-point
(the scene collection was edited; the idempotent builder that regenerates it was not). The next
staging run would have silently reverted OVERLOOK to the legacy node. Now `regUrl("producer",
"/stream")` — identical to the UNI.json value, one source of truth. `UNI.json` itself needed **no
edit**: it already holds `http://10.190.245.122:4200/stream`.

## Observed, not acted on (operator's call)

- **A zombie OBS**: `obs64` PID 23012 running since 2026-07-15 00:19 with `:4455` REFUSED, while the
  Door believes OBS is closed — the safe-mode/sentinel signature of CLAUDE.md law 3, and not a
  `studio_up.ps1` product. Scene-collection files are not editable (and staging should not run)
  until it is **gracefully** closed (`studio_up.ps1 -Stop` path; never force-kill).
- `os_systemctl_action` refused unit `uni-dns` (not in its unit allowlist) — the os_exec systemctl
  path covered it; consider allowlisting the unit.
- Mutating MCP calls returned without a visible approval pause again (matches the 07-15 note in the
  nft persistence receipt) — the queue contract still is not enforcing on this box.

## Follow-ups (named, not stacked into this cure)

1. **Kill the inode trap structurally**: switch the quadlet to mounting the `/etc/uni/dns`
   DIRECTORY (or dnsmasq `--hostsdir`), so a hosts-map ship reloads via SIGHUP/inotify with no
   container replacement.
2. **Chromium/.local decision**: `.internal` zone flip per the README escape hatch, or prove CEF
   name-resolution at a bring-up; until then browser-consumed URLs stay registry-derived.
3. Close the zombie OBS gracefully before the next bring-up; the stage-3 SEEN sweep then decides
   `overlook-producer-4200`.
