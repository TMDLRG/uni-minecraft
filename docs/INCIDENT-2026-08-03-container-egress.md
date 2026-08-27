# INCIDENT 2026-08-03 — three public services down for 1h43m, all reporting healthy

**Status: RESOLVED, root cause found, and a self-healing guard installed and proven.**

The signals appliance, its Tailscale funnel, and the math workbench all went dark at **03:37Z** and
came back at **05:20Z**. Every service involved was running, healthy, and logging nothing wrong for
the entire window.

---

## What was actually wrong

`/etc/uni/nftables.conf` begins with `flush ruleset`. Applying it destroys the `inet netavark`
table, which holds the **masquerade (source-NAT) rule for every podman network on the box**.
Netavark rebuilds a network's rules only when a container *on that network* starts.

So after the firewall was applied, containers on nine of the ten podman bridges were sending
packets to the internet with an **untranslated private source address**. The packets left. The
replies had nowhere to come back to. Every new outbound connection timed out.

Three backups dated today record the apply that did it:

```
/etc/uni/nftables.conf.bak-pre-colonycam-20260803
/etc/uni/nftables.conf.with-colonycam-3020-20260803
/etc/uni/nftables.conf.with-colonycam-and-radio-20260803
```

### Why it was so hard to see

Everything pointed at the wrong layer:

- containers stayed **running**; `podman ps` was clean
- Postgres kept checkpointing normally
- loopback health checks stayed **green**
- the host itself had full internet — `ping 1.1.1.1` answered in 11ms, and the host's own
  Tailscale node (`uni-lab-hub`) stayed **online**, because host traffic has a real source
  address and needs no translation
- `nftables`' own `output` chain was `policy accept` with no rules
- conntrack was at **4021 / 262144** — 1.5%
- the Cloudflare edges cloudflared could not dial were, from another box on the same LAN and the
  same gateway, **reachable on TCP 7844**

The only visible symptom was `failed to dial to edge with quic: timeout: no recent network
activity`, repeating forever, from two unrelated tunnels at once.

### The accident that gave it away

The one network that still worked was `10.88.0.0/16` — whose container, `cpradio`, had been
restarted fifteen minutes earlier **for a completely unrelated reason** (the music). Restarting a
container makes netavark rebuild that network's rules. That single accidental control group is what
made the pattern legible.

### Two wrong diagnoses on the way, recorded because they were wrong

1. **Dual default routes.** The chip is dual-homed and had two default routes at identical metric
   1024, one via a filtered WLAN. That is a real latent defect and it is *not* what broke this.
   A metric-100 route was added, changed nothing, and was **removed again**.
2. **`flush ruleset` wiped `table ip nat`.** Right about the mechanism, wrong about the table —
   modern podman uses netavark, and `table inet netavark` existed the whole time. It just had
   rules for one network out of ten.

Neither fixed anything. The third diagnosis did.

## The fix

```
podman network reload --all      # 62 containers, 17s, restarted nothing
```

`healthz` went 530 → 200 in twelve seconds.

**Blast radius, corrected:** this also fixed `workbench.uni-lab.solwright.com`, which had been
filed the previous night as "down, pre-existing, not caused by tonight." Same bug the whole time.

---

## The durable fix — `uni-vigil-retis`

Installed on uni-lab, following the estate's own `/etc/uni/systemd` → `systemctl link` pattern and
its `uni-vigil-*` watchman naming.

| file | role |
| --- | --- |
| `/opt/uni/tools/uni-vigil-retis.sh` | the guard — check, repair, re-measure |
| `/etc/uni/systemd/uni-vigil-retis.service` | oneshot runner |
| `/etc/uni/systemd/uni-vigil-retis.timer` | 60s backstop |
| `/etc/uni/systemd/uni-vigil-retis-prove.service` | proves the detector bites |

It compares podman bridge subnets from `ip route show scope link` against the live `inet netavark`
ruleset. Any bridge present but absent from the ruleset is a container network that cannot reach
the internet. It repairs with `podman network reload --all`, then **re-measures**, and fails loudly
if anything is still unprotected.

**Three triggers, because there are three ways the rules are lost:**

```
nftables.service.wants/uni-vigil-retis.service   -> fires the instant the firewall is reapplied
multi-user.target.wants/uni-vigil-retis.service  -> covers boot
timers.target.wants/uni-vigil-retis.timer        -> every 60s
```

The timer is not redundant. A hand-run `nft -f /etc/uni/nftables.conf` never touches systemd, so
the first two triggers would never fire. **That is exactly what happened, and it ran unseen for
1h43m.**

### Proven, not asserted

```
systemctl start uni-vigil-retis-prove.service
journalctl -u uni-vigil-retis-prove.service -n 20 --no-pager -o cat
```

Measured 2026-08-03 10:51Z:

```
uni-vigil-retis: SELFTEST PASS -- empty ruleset flags all 10 bridge(s); live ruleset flags 0
```

It drives the real comparison against a deliberately empty ruleset and requires that it flags every
bridge. A detector that has never returned red is not evidence of anything — which is the entire
lesson of this incident.

**Honest limit, stated in the script itself:** `--selftest` proves the *comparison* bites. It does
**not** prove the repair works on a genuinely broken box; only dropping the live table would, and
that costs a real outage. The repair path was proven by hand at 05:20Z.

### Read it, don't rediscover it

```bash
systemctl start uni-vigil-retis.service                 # check + repair now
bash /opt/uni/tools/uni-vigil-retis.sh --check          # gate: read-only, exit 1 if degraded
systemctl start uni-vigil-retis-prove.service           # prove the detector still bites
journalctl -u uni-vigil-retis.service -n 50 --no-pager -o cat
```

## Deliberately not done

The guard does **not** edit `nftables.conf` and does not try to prevent the flush. The flush is
legitimate — it is how a declarative firewall is applied. The defect was that nothing put the
container rules back afterwards. Repairing the consequence is correct; fighting the cause would
make the firewall non-declarative, which is worse.

## Still open

- **Leads.** `/leads/recent` returns **404**, not 530 — it is reachable now but unrouted. The
  Cloudflare tunnel sends everything to `swu-ingest:8787` and has no `/leads` ingress; the
  Tailscale funnel has it (`/etc/uni/swu-funnel-serve.json`) and the Cloudflare one never got it.
  `infra/swu-leads/README.md` lists adding it as a required deploy step. **Unverified and not
  asserted:** the site's `INTAKE_WEBHOOK_URL` posts to that same path, so lead *capture* may have
  been failing too. Only a GET has been measured. External (Cloudflare) change — operator's.
- **`TUNNEL_TOKEN`** for the signals tunnel was read in plaintext during this investigation and is
  in the session transcript. It needs rotation.
- **The chip's dual default routes** at equal metric remain. Not this bug, but a real coin-flip.
