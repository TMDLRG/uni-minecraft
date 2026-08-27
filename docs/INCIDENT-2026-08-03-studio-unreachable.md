# INCIDENT 2026-08-03 — "the studio does not load on the laptop"

**Status: PARTIALLY RESOLVED. One defect fixed and verified; one defect diagnosed and NOT fixed
(it needs the operator); one condition is not a defect at all and cannot be fixed by this estate.**

Written while live on air. The operator's laptop could not reach the studio publisher for several
hours after twelve hours of it working. Three independent causes were found. They presented
identically — "it does not load" — which is why each fix appeared not to work.

---

## What was actually wrong — three causes, not one

### CAUSE 1 — the TLS certificate covered ONE of THREE network planes. **FIXED.**

`viewer/auto.crt` was minted 2026-07-13 with SAN `localhost, 127.0.0.1, ::1, 10.190.245.196`.

THINKER is **tri-homed**:

| plane | interface | address |
| --- | --- | --- |
| Kilig LAN | Ethernet | `10.190.245.196` |
| P-Zin WLAN | Wi-Fi | `192.168.1.240` |
| Tailscale | tailscale0 | `100.98.223.27` |

The cert described the first and nothing else. Any browser reaching the box by its Wi-Fi or
Tailscale address got a hard TLS failure. `pub.html` needs `getUserMedia`, which requires an intact
secure context, so even a click-through leaves the camera dead.

`gen_auto_cert.ps1` made this permanent in two steps:
- line 21 hard-coded `$lanIp = '10.190.245.196'`, and line 52 put exactly that in the SAN;
- the idempotency check skipped regeneration while the cert had >30 days left, and certs were
  minted with `-days 3650`. **It could not refresh itself until 2036.**

**Fix:** the SAN set is now DISCOVERED, never declared — every non-loopback IPv4 the box holds read
live from the OS, plus loopback, the machine hostname, the Tailscale MagicDNS name read from
`tailscale status --json`, and the declared zone/public names in the new `viewer/cert_names.json`.
The idempotency check now tests **coverage**, not just expiry: if the box holds an address the cert
does not carry, it regenerates. `studio_up.ps1:446` already invokes the generator before starting
the publisher, so this self-heals on every studio start with no new wiring.

**Verified 2026-08-03** by reading the artifact back — 14 SAN entries, and a TLS handshake against
every plane and name reporting name-match rather than `NameMismatch`:

```
127.0.0.1                   MATCH        thinker                     MATCH
10.190.245.196              MATCH        thinker.[redacted: client-identifier].ts.net   MATCH
192.168.1.240               MATCH        thinker.uni-lab.local       MATCH
100.98.223.27               MATCH
```

#### A defect inside the fix, recorded because it nearly shipped

The first corrected generator **exited 0 and produced a broken cert.** Nested `-join` calls inside
an array literal did not apply; the SAN groups were separated by spaces instead of commas, and
openssl silently folded `IP:127.0.0.1 IP:::1 IP:10.190.245.196` into the tail of a DNS name. The
minted cert lost loopback **and the Ethernet address — the one path still working.** Nothing
reported an error.

It was caught only by reading the cert back. The generator now re-reads the minted cert and throws
on any missing entry. **An exit code says the command ran. It does not say the artifact is correct.**

---

### CAUSE 2 — THINKER is not managed by the dynamic DNS. **DIAGNOSED, NOT FIXED (operator).**

`/etc/uni/dns/pharus-owned.json` states the estate's own design:

> *"names + planes are DECLARED (they are policy, and stable); addresses are never written down
> (they are transient, and were the entire bug). uni-pharus reads this, reads the live interfaces,
> and regenerates the block inside its markers in the name map."*

and then, explicitly:

> *"Records for OTHER boxes (thinker .196, node2/relay, tab, signals, mc) are NOT owned here —
> they stay outside the markers, untouched."*

So every studio name — `studio`, `obs`, `cams`, `overlays`, `mediamtx`, `launcher`, `gaia`, `hud` —
is a hand-typed `10.190.245.196` literal sitting **outside** the generated markers, in a file whose
header says *"do NOT hand-pin literals here."* THINKER grew a third plane and nothing regenerated,
because nothing is watching THINKER. `uni-pharus` runs on the hub and has no implementation on
THINKER (grep over the repos returns only two prose mentions, no code).

The zone also draws a deliberate posture line:

```
# ── SERVICES (thinker — PORTABLE STUDIO, LAN only; NO wg/Tailscale record on the publish path) ─
```

Amending that is **S5-class** — and `obs.uni-lab.local` fronts the unauthenticated `:4455`
(`f31.obs-unauthenticated`, bound to `::`), so adding an overlay record to these names changes a
recorded security decision. **No agent may make that call.**

---

### CAUSE 3 — the two LANs do not route to each other. **NOT A DEFECT. Cannot be fixed by DNS.**

Measured 2026-08-03, sourcing from THINKER's own Wi-Fi address, which is what a laptop on that
WLAN would do:

```
ping -S 192.168.1.240 10.190.245.121   ->  2/2 lost
ping -S 192.168.1.240 10.190.245.196   ->  2/2 lost
```

The P-Zin WLAN and the Kilig LAN are fully isolated. Every name in `uni-lab.local` /
`uni-lab.solwright.com` resolves into `10.190.245.0/24`. The laptop on that WLAN also resolves via
`1.1.1.1` / `8.8.4.4` — **it never queries our dnsmasq at all**, so `localise-queries` can never
fire for it.

**DNS maps names to addresses. It does not create routes.** A perfect pharus record would still
hand that laptop an address it cannot reach. This is the load-bearing fact and it was the thing
being talked past for several hours.

#### Why `https://thinker/` failed — a fourth, separate reason

The WLAN hands out `[redacted: client-identifier]` as a connection-specific DNS suffix. The single-label name
`thinker` was expanded to `thinker.[redacted: client-identifier]`, answered by **public DNS**, and reached a
third-party TLS server that rejected the SNI — `ERR_SSL_UNRECOGNIZED_NAME_ALERT`. It never came
near this estate. The suffix hijacks single-label names on that network, so LLMNR never fires and
no bare name can work there.

---

## What actually reaches the studio, per network

| from | works | why |
| --- | --- | --- |
| Kilig LAN | every estate name | the zone points here; this is what worked for 12 hours |
| P-Zin WLAN | `https://192.168.1.240:8443/` **only** | same subnet; no estate name resolves to a routable address |
| any network | `https://thinker.[redacted: client-identifier].ts.net:8443/` | Tailscale — **requires Tailscale on the client** |

The only option that satisfies "all paths" is the tailnet: THINKER is already on it, the zone
already carries `100.98.223.27 thinker.uni-lab.local`, and the rebuilt cert already covers both the
MagicDNS name and that address. The remaining step is on the client, and it is the operator's.

## Open, and whose

- **S-DNS-1 (operator).** Declare THINKER in the pharus schema so its records regenerate from its
  live interfaces. Requires a pharus emitter that can reach a Windows peer; THINKER has no wg
  address, so the "wg-learned peer endpoints" path in the pharus README does not apply as written.
- **S-DNS-2 (operator, S5).** Whether the studio names may carry the overlay plane. This amends the
  zone's declared "LAN only; NO wg/Tailscale record on the publish path" posture, and `obs` fronts
  an unauthenticated control surface.
- **Client transport (operator).** Tailscale on the laptop, or stay on the Kilig WLAN.

## Not changed

The DNS zone, dnsmasq, the chip's nginx, and every service on the chip were left exactly as found.
An earlier attempt tonight to add records and an nginx vhost was reverted byte-for-byte
(`uni-lab.local.hosts` sha256 `c1147e0a795270abf7036c4cebc0e6c8f759f87b667676f6f514dca963357944`,
unchanged) after the operator's instruction. Nothing in this incident's remediation touched the
chip.
