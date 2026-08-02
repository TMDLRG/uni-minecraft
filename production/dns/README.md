# UNI Fleet DNS — `uni-lab.local` (repo artifacts + gated deploy)

Authoritative unicast **dnsmasq** for the `uni-lab.local` zone, so the whole fleet is reachable by
human names instead of a sprawl of IPs and ports. Chosen over mDNS because mDNS cannot cross the
WireGuard mesh / Tailscale or answer for podman containers. This is **additive** — avahi keeps
running for host zeroconf; the router keeps DHCP (dnsmasq here is DNS-only).

The single source of truth for names is **`uni-lab.local.hosts`** (mirrored 1:1 by
`viewer/infra_registry.json`, which the live-infra UI at `launcher :8090 → /infra` diffs against
real reads). Keep the two in sync — **in the SAME commit that adds a service to the registry, add
its A record here and ship it to the chip** (`/etc/uni/dns/` + SIGHUP). This rule was burned in
2026-07-15: gaia/hud/producer entered the registry on 07-14/07-15 without hosts records, and the
"dnsmasq zone regression" (NXDOMAIN for declared names) was exactly that drift — the chip's file
was byte-identical to the 07-12 tag the whole time (receipt:
`production/docs/receipts/dns_zone_drift_fix_2026-07-15.md`).

## Files (all in this dir — Phase 1, repo-only, revertible with `git revert`)
| file | what |
|---|---|
| `uni-lab.local.hosts` | the NAME MAP — dnsmasq `addn-hosts`; one A record per line, PTRs auto-generated. |
| `dnsmasq.uni.conf` | resolver config: `local=/uni-lab.local/`, `localise-queries`, `bind-dynamic` on `127.0.0.1 / 10.190.245.122 / 10.13.13.1` only (never collides with aardvark-dns on the podman bridges), upstream `10.190.245.188 → 1.1.1.1 → 9.9.9.9`. |
| `uni-dns.container` | the quadlet (`network=host`, config+hosts mounted `:ro`), modeled on `uni-bcast-relay.container`. |
| `nftables.conf` | the chip's **`/etc/nftables.conf` with `:53` accept added** to the `trusted` chain — the sole line the chip needed to let LAN/wg peers reach dnsmasq. See "off-box reachability" below. |

## Gated deploy (each mutating step = ONE human co-sign via the uni-lab MCP; fully reversible)
The MCP filesystem sandbox (`/opt/uni /var/lib/uni /etc/uni /var/log/uni /run`) with `os_exec` OFF
shapes the order: configs land in **`/etc/uni/dns`** (in-sandbox), the container ships via
`podman_quadlet_apply` (not a raw `/etc/containers/systemd` write), and the resolver cutover is
isolated to Phase 5 — the ONE step needing `os_exec` enabled or an owner hand-edit.

| Phase | Path | Action | Reachability gate | Reversal |
|---|---|---|---|---|
| **0 Pre-flight** | MCP read | confirm `127.0.0.1:53 / .122:53 / 10.13.13.1:53` unbound; back up `/etc/resolv.conf` + `/etc/nsswitch.conf` | 3 sockets free | — |
| **1 Author** | LOCAL | this dir; commit + push + tag (`production/** eol=lf`) | `git archive` of the tag unpacks clean | `git revert` |
| **2 Stage inert** | MCP ×2 | `os_file_write` conf + hosts → `/etc/uni/dns/` (in-sandbox) | `os_file_read` bytes back | delete files |
| **3 Bring up bound-but-unused** | MCP | `podman_quadlet_apply uni-dns.container`; no client points at it | `os_systemctl_status uni-dns` active | `podman_stop` + quadlet remove |
| **4 Out-of-band validate** | THINKER + MCP read | `nslookup mc.uni-lab.local 10.190.245.122 → 10.89.1.40`; `google.com` forwards | all fleet names + upstream resolve | none needed |
| **5 Host cutover** ⚠ | **owner-signed; needs `os_exec` on OR hand-edit** | `/etc/resolv.conf → nameserver 10.190.245.122` (+`.188` fallback); `nsswitch hosts:` dns before mdns4 | **RED GATE 5:** `getent hosts mc.uni-lab.local` resolves **and** `swo*` + `mc-server` still Up/healthy **and** a public MX still resolves. Any name that STOPS resolving = auto-fail. | restore 2 backups |
| **6 Containers** | SSH (colony) | colony's *next* deploy adds `--dns 10.190.245.122`; **mc-server NOT recreated**; ERP untouched | container `nslookup mc.uni-lab.local` | drop `--dns` next deploy |
| **7 THINKER** | THINKER PS | `Add-DnsClientNrptRule -Namespace ".uni-lab.local" -NameServers 10.190.245.122` | `Resolve-DnsName studio.uni-lab.local → 10.190.245.196` | `Remove-DnsClientNrptRule` |
| **8 node2** | MCP `limb=uni-lab-79740c` | **BLOCKED — node2 UNREACHABLE.** When up: resolv.conf → `10.13.13.1` | `relay.uni-lab.local` resolves on-box | restore backup |

**Safe to land now:** Phase 1 (this commit). Phases 0–4 are approval-gated but non-disruptive
(nothing points at the resolver yet). **Owner sign-off required:** Phase 5 cutover (changes what
every container resolves; needs `os_exec` or a hand-edit) and Phase 8 (node2 down).

**`.local` escape hatch:** if any client's mDNS interception fights us, flip the single
`local=/uni-lab.local/` to `local=/uni-lab.internal/` — identical zone, zero redesign.

## Off-box reachability — one nftables line (found + fixed 2026-07-12)

The chip runs a real default-deny nftables firewall (`table inet filter`; chain
`input` has `policy drop`). LAN/wg peers are routed through the `trusted` chain,
which explicitly accepts `:22`/`:443`/`:4000` etc. — but originally had **no `:53`
accept**, so LAN queries to dnsmasq were silently dropped BEFORE reaching the
socket. That was the real Phase-4-secondary block (not a Windows-side EDR filter
as first hypothesized — the corrected diagnosis lives in the Phase 0–4 receipt).

**Runtime fix (applied 2026-07-12; audits `5b2d5a0a…` / `83a96f30…`):**
```
nft add rule inet filter trusted tcp dport 53 accept
nft add rule inet filter trusted udp dport 53 accept
```

**Persistence:** stage `nftables.conf` (this dir) at `/etc/uni/dns/nftables.conf.new`
(already there from the Phase-7 fix, sha256 `d1f639b8…`), then:
```
sudo cp /etc/uni/dns/nftables.conf.new /etc/nftables.conf
sudo systemctl reload nftables
```
Runtime rules added by other services (netavark, aion, swo, etc.) re-add themselves
as those services fire — the file is the minimal baseline, matched 1:1 by
`production/dns/nftables.conf` in the repo. Backup the current file first:
`sudo cp /etc/nftables.conf /etc/nftables.conf.pre-uni-dns`.

## Invariants (unchanged by DNS)
Colony stays rootless on uni-lab; ERP (`swo-*`/Odoo/Jitsi/mail) never externalized or mutated by
this; stream keys never leave `/etc/uni/runtime.env`; every rootful mutation gates on one human
co-sign; public go-live stays human-typed and **BLOCKED on node2**. External DNS/TLS/tunnel (Stage F
in `docs`/the plan) is a separate, later, owner-domain-gated effort — this file is internal names only.
