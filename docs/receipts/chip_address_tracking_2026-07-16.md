# The chip's address moved and the studio didn't notice — receipt, 2026-07-16

**Track:** studio/infra. **Touched no `lib/sp/**`. Set no science gate. Made no life/awareness claim.**
**Gate:** `chip-address-tracking` — `node viewer/verify_host_tracking.cjs` (exit 0 = PASS).
**Verdict: PASS · evidence class B** (observed-with-artifact: live probes + a red→green reproduction
of the original defect against the pre-fix tree).

---

## 1. What happened

The chip's LAN lease moved `10.190.245.122` → `10.190.245.121`. Three of the four places that must
know the chip's address had already been moved to `.121` — the zone file
(`production/dns/uni-lab.local.hosts`), the Windows NRPT rule, and `infra.cjs`'s two sanctioned
bootstrap literals. **`viewer/infra_registry.json` was not.** Its own zone file even says "Corresponds
1:1 to viewer/infra_registry.json. Keep the two in sync."

Everything that resolved the chip **by name** kept working (the launcher's probes, `/api/status`,
which reported `driver=producer verdict=LIVE colony=6` throughout). Everything that read the registry's
hand-declared `ips[0]` addressed a dead host.

### The sentinel was already screaming; nobody was reading it

`infra.cjs`'s `dnsDrift()` compares each declared `ips[]` against what the chip's resolver actually
answers. Measured at the start of this session, before any change:

```
DRIFT  dns.uni-lab.local          resolved=10.190.245.121  declared=10.190.245.122,10.13.13.1,...
DRIFT  colony.uni-lab.local       resolved=10.190.245.121  declared=10.190.245.122
DRIFT  colonycam.uni-lab.local    resolved=10.190.245.121  declared=10.190.245.122
DRIFT  producer.uni-lab.local     resolved=10.190.245.121  declared=10.190.245.122
DRIFT  glass / erp / meet / mail / masterplan / mcp        declared=10.190.245.122
fresh  studio / obs / cams / overlays / mediamtx / launcher / gaia / hud   (thinker, static)
fresh  relay                                                              (node2, static)
```

**10 chip rows DRIFT, every static row fresh.** The check did its job perfectly. The reason it changed
nothing is the finding worth keeping: for a DHCP-dynamic host, `resolved != declared` is the *normal*
condition, so those rows sat at `drift` as permanent background noise. **An alarm that is always on is
not an alarm.** That is why this fix reclassifies them rather than just re-pointing them (§3).

## 2. Ground truth measured before changing anything

| surface | by name | result |
|---|---|---|
| `producer.uni-lab.local:4200/producer/health` | → .121 | **200**, `driver=producer`, `frame` advancing |
| `producer.uni-lab.local:4200/stream` | → .121 | **200** |
| `colony.uni-lab.local:4000/stream` | → .121 | **200** (legacy v2 node) |
| `colonycam.uni-lab.local:3020` | → .121 | **UP** |
| `uni-lab-lan.uni-lab.local:25565` (MC) | → .121 | **timeout** |
| `uni-lab-lan.uni-lab.local:25575` (RCON) | → .121 | **timeout** |

`10.190.245.122:4200/producer/health` → connection fail. The colony was **LIVE at .121 the whole time.**

## 3. The fix — and why not just write `.121`

Writing `.121` where `.122` was would have restored service and **re-armed the identical trap for the
next lease.** The chip's LAN address is not a declarable fact; it is a DHCP lease on a disposable uplink
(`docs/handoffs/ADAPTIVE_SELF_NETWORK_HANDOFF_2026-07-15.md`). DNS — uni-dns on the chip, which the chip
itself keeps current — is the authority.

- **`viewer/host_resolve.cjs` (new).** The ONE seam turning a declared NAME into a live address, with
  provenance (`via: dns | declared | none`) and a 30s TTL. It exists *only* for the consumer class that
  cannot use a name: anything a **Chromium engine loads** (operator Chrome, OBS CEF), which bypasses the
  OS resolver and error-pages on `.local` (measured 2026-07-15). Node probes keep using names directly.
  Retire it after the planned `.local` → `.internal` flip.
- **`viewer/infra_registry.json`.** Chip services carry `"lan": "dynamic"` and declare **stable planes
  only** (mesh/overlay); `ips: []` is now a legitimate, honest value. Probes address **names**. The
  `_lan_dynamic_law` field states the rule in-file so the next editor meets it before the octet.
- **Consumers moved onto the seam:** `door_lifecycle.cjs` (hrefs resolved per `state()`, so a move
  self-heals within one poll), `launcher.cjs`, `studio_stage.cjs` (resolved in `main()` at bring-up —
  module load is too early to ask DNS, and a DNS hiccup can no longer throw on `require`).
- **`infra.cjs`:** dynamic-LAN rows now report **`tracking`** (name resolves; consumers follow) instead
  of a permanent `drift`. `dnsSetupClosure` counts `tracking` as satisfied — otherwise DNS would read
  permanently open on a system working exactly as designed. Hard `drift` is preserved for static hosts,
  where it is still a real defect (`cams` MUST be THINKER's `.196` — node2's publish ACL pins that /32).

## 4. Gaia: the `producer_health` signal was aimed at a retired surface — independent of the IP move

`colony.producer_health` read `svc("colony")` — the **legacy v2 node on :4000, which has no
`/producer/health` route at all.** With the registry's colony probe path it was really probing
`:4000/stream`. **That signal could never have carried a Producer health verdict regardless of any
address.** Both Producer signals now read `svc("producer")` (:4200). The legacy node keeps its own
honestly-labeled `colony.legacy_v2.stream` signal so "the legacy node answers" and "the Producer is
alive" can never be conflated again.

**Gaia's own law caught my first attempt.** My new signal's detail string used the word *narration* — a
`FORBIDDEN_TOKEN` in `sig.cjs`. `gaia_lint.cjs` failed the build (`[b] FORBIDDEN_TOKEN ... colony.legacy_v2.stream`).
The wording was the defect, not the law; reworded, lint PASS. Gaia gate back to **11 PASS / 0 FAIL**.

### Honest scope of the Gaia repair — 2 of 4, not 4 of 4

The red seat showed 4 DOWN. **Two were honestly down and remain down:**

- `colony.mc.port.25565` and `colony.rcon.port.25575` are **not LAN-published**. `mc.uni-lab.local`
  resolves to the container network `10.89.1.40` (unroutable from THINKER) and the zone carries an
  explicit `# NV-HOLD (gate: prove a host port-forward of :25565)`. Verified: both ports **time out at
  `.122` AND at `.121`** — structural, pre-existing, **not** address drift. Fixing the address does not
  and must not turn them green.

Post-fix colony seat, live: `producer_health` **up**, `producer.stream` **up**, `legacy_v2.stream`
**up**, `mc.port.25565` **down**, `rcon.port.25575` **down**.

## 5. Two live breakages found that were NOT in the brief

1. **The glass badge pusher (`command_center.cjs`) was SSHing to `uni@10.190.245.122` every 2s** —
   dead since the move, respawning every 5s, so the glass badge had silently been reading **STALE**.
   Found by the new gate's literal scan, confirmed on the live process list.
   A second, subtler cause surfaced on repair: with `BatchMode=yes`, ssh **cannot prompt**, so a host
   key it has never seen is a hard failure — exactly what switching from an IP to a NAME produces.
   Added `StrictHostKeyChecking=accept-new` (first-contact TOFU only; a **changed** key for a known host
   is still refused — this is *not* `StrictHostKeyChecking=no`).
   **Verified end-to-end:** spawn count 1 (loop gone), and the badge JSON read back off the chip —
   `{"level":"OFF",...,"utc":"2026-07-16T16:26:09.788Z"}`, `mtime=2026-07-16 16:26:10` (seconds old).
2. **Gaia's litigation-hold mind capture** (`capture_minds_run.cjs`) derives its ssh host from
   `colony.probe.host` — it had been pointed at the dead `.122`, i.e. the **mandatory
   capture-before-destroy** path was broken. It now follows the name. *(Repaired by construction; a real
   capture is the science seat's mandated procedure and was NOT run here.)*
3. Retired `launcher.cjs`'s hardcoded `GLASS_HOST = "10.190.245.122"` — an IP literal in code **and** a
   dead link served to the operator on every poll.

## 6. The gate, and proof it has teeth

`chip-address-tracking` deliberately does **not** assert "the address is .121" — that would pass today
and rot exactly like the literal it replaces. It asserts the property that matters: **consumers derive
the address from the name, live, and therefore follow it when it moves.**

Check 4 is the teeth: it **simulates a lease move** by stubbing `getaddrinfo` to answer `203.0.113.7`
(RFC5737 TEST-NET-3 — non-routable, unmistakably synthetic, never contacted) and asserts the consumer
emits the new address. Anything pinned at module load, over-cached, or falling back to a declared
literal fails. A residue check confirms the synthetic answer never survives into a real consumer.

**Red→green against the real defect.** Run against the pre-fix tree (a detached worktree at HEAD
`4cb0205`, so the shared checkout was never touched):

```
PRE-FIX  → HOST-TRACKING GATE: FAIL — 2 PASS, 5 FAIL
  [FAIL] no-chip-literal-in-consumer-code   (command_center.cjs:1207 -> 10.190.245.122 ...)
  [FAIL] registry-declares-no-dynamic-lan   box 'uni-lab' is not marked lan:"dynamic"
  [FAIL] chip-names-resolve-via-dns         no service marked dynamic — vacuous pass, not a pass
  [FAIL] door-hrefs-track-the-name          href http://10.190.245.122:4200/stream != live 10.190.245.121
  [FAIL] gaia-producer-signals-aim-at-4200  locator reads probes.httpJson(10.190.245.122,4000,"/stream")
FIXED    → HOST-TRACKING GATE: PASS — 7 PASS, 0 FAIL
```

### The gate's own first draft was defective — recorded because it is the point

The first draft **PASSED against the pre-fix tree** on three checks. Both defects are the kind this
project exists to refuse, so they are named here rather than quietly fixed:

- **Circular allowlist.** The literal scan derived "legitimate addresses" from the registry, so the
  stale registry *declaring* `.122` **allowlisted every `.122` literal in the code**. The gate took its
  notion of legitimate from the very declaration under test — so it blessed the exact defect it exists
  to catch. Fixed by anchoring on the chip's **box name** (`uni-lab`), a durable fact, so no address-field
  edit can launder a chip address into the allowlist.
- **Vacuous passes.** `registry-declares-no-dynamic-lan` and `chip-names-resolve-via-dns` iterated only
  services already marked dynamic — against a tree where none were, they reported `0 dynamic-LAN
  service(s) ... PASS` and `0/0 ... PASS`. **Deleting the markers would have turned the gate green on
  nothing.** Both now assert the declaration EXISTS before asserting it is honoured; zero is a FAIL.

## 7. Verification run (all live, this session)

```
node viewer/verify_host_tracking.cjs   -> PASS  7/7, exit 0
node viewer/gaia/verify_gaia.cjs       -> PASS  11 PASS / 0 FAIL / 0 SKIP
node viewer/gaia/gaia_lint.cjs         -> PASS  0 violations
node viewer/verify_overlays.cjs        -> PASS  exit 0
GET :8090/api/status                   -> 200
GET :8090/api/door/state               -> 14 doors, 0 circle_ok violations
```

Live door hrefs after the launcher + gaia_server reload (both via their own watchdogs — the proven
crash-restart path; OBS and the stream were never touched, air stayed `OFF` throughout):

```
producer   OPEN  http://10.190.245.121:4200/stream   -> 200
colony     OPEN  http://10.190.245.121:4000/         -> 200
colonycam  OPEN  http://10.190.245.121:3020/         -> 200
```

## 8. What is NOT claimed

- **No life/awareness/health claim.** This gate demonstrates an address-tracking behaviour of studio
  consumers. Nothing else. The claim fence is untouched.
- **`colony-of-N` (`verify_colony.cjs`) still FAILs**, on RCON — and this fix does not change that.
  RCON `:25575` is unreachable at **both** `.122` and `.121` (measured); `verify_colony.cjs` and
  `rcon.cjs` are **untouched by this change** (`git status` clean for both). Pre-existing and
  structural: RCON is not LAN-published. **Not a regression from this work, and not repaired by it.**
- **The zone file and the NRPT rule still carry `.121` literals**, and that is correct — they are the
  DNS bootstrap, the one place an address may live. This change did not automate them: **on the next
  lease move those two still need updating** (by the reconciliation beacon when it lands — P1 of
  `ADAPTIVE_SELF_NETWORK_HANDOFF_2026-07-15.md`; by hand until then). What changed is the blast radius:
  **two bootstrap points instead of ~15 scattered consumers**, and the consumers now degrade *honestly*
  (an unresolvable name yields no href → a non-clickable door) instead of linking to a dead address.
- **`mc`/`rcon` remain honestly DOWN.** Publishing them needs the `NV-HOLD` port-forward gate, which is
  not this work.
- The glass cockpit link now resolves to `https://<chip>:443/glass/`; the `glass` service is still
  registry-`nv: true` (port never live-probed). Its link is no longer *dead*, but "glass is up" is
  **NOT VERIFIED**.
