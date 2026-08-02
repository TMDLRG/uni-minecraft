# Receipt — Phase X: nginx /prod-mcp deployed + proven (reachable operator MCP surface)

**Status: `/prod-mcp` LIVE on `uni-lab-79740c` through the operator nginx front.** The `/control`
LiveView (colony lane's Phoenix) is the remaining cross-system piece.

The operator can now reach the production broadcast MCP at `https://<node>/prod-mcp` with their bearer,
instead of only via a loopback SSH tunnel. All via the uni-lab MCP, approval-gated.

## Verified before touching (not assumed)

- **nginx is the shared :443 front** (`ss -ltnp`: nginx pid 729 on `0.0.0.0:443` + `:8080`).
- **But it fronts ONLY the UNI/lab surface**, NOT the co-hosted SolutionWright business stack. The
  active vhost `sites-available/uni-ssl.conf` (server_name `uni-lab.local _`) proxies `/api/`→:8000,
  `/mcp`→:8090 (fleet MCP), `/glass/`, `/approvals/`, `/status/`. The business services (swo-* on
  :8710/:3110/:6432, portainer :9443) are NOT in this nginx — they have their own ingress. So adding
  `/prod-mcp` here did **not** touch the never-mutate business stack.
- The DEPLOY.md §6 "drop a location in `/etc/nginx/conf.d/`" recipe is WRONG for this node — `conf.d`
  is included at the HTTP level, so a bare `location` there is invalid. The block had to go INSIDE the
  `sites-available/uni-ssl.conf` server{}.

## What was done

1. Wrote the full updated vhost to `/var/lib/uni/broadcast/uni-ssl.conf.new` — the current 60-line file
   plus one `location /prod-mcp` block, mirroring the existing `/mcp`→:8090 block (streamable-HTTP:
   `Connection ""`, `Host 127.0.0.1:8095` to defeat the MCP DNS-rebinding guard, `proxy_buffering off`,
   long timeouts). `:8095` is the production-MCP (`:8094` is uni-glass-configure).
2. Backup `uni-ssl.conf.bak-preprodmcp`, installed the new file (container). **`diff -w` confirmed the
   ONLY change is the added `/prod-mcp` block** — all 6 existing locations intact.
3. `systemctl reload nginx` (rc 0).

## Proof (behavioral, through nginx)

```
/prod-mcp -> 401     # NEW: active + routed to the fail-closed production-MCP :8095 (not a 404 miss)
/mcp      -> 401     # existing fleet MCP still works (regression clean)
/status/  -> 403     # existing (dir listing off) — unchanged
/         -> 200     # UNI frontend still serves — vhost intact
```

`401` (not `404`) on `/prod-mcp` is the healthy signature: the location matched, nginx forwarded to
:8095 with the rebinding-safe Host, and the MCP fail-closed the unauthenticated request. Rollback if
ever needed: restore `uni-ssl.conf.bak-preprodmcp` + `systemctl reload nginx`.

## Remaining (colony + operator)
- **`/control` LiveView** — colony lane's Phoenix route (`router.ex` + `control_live.ex`), landing after
  their current forage RED; then add a `location /control { proxy_pass <colony-phoenix>; }` (WebSocket
  upgrade) to the same vhost.
- **`/vendor/` + `/overlays/`** — optional unified-front conveniences (the committed
  `production/nginx/prod-mcp.conf` carries them); `/vendor/` needs the vendored LiveKit js shipped to the
  overlays Caddy root first (Phase VII on-node, guests-deferred).
