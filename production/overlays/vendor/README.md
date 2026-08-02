# production/overlays/vendor/

Status: **VENDORED 2026-07-12** (the file is present and its SRI hash is pinned in both guest pages).

This directory holds vendored on-air JS dependencies served locally by
`uni-bcast-overlays` (Caddy, `:8099`) instead of being pulled from a public
CDN at broadcast time. An on-air dependency must not depend on a third-party
CDN being reachable, unthrottled, and unmodified during a live show.

## What is here

`livekit-client-2.5.7.umd.min.js` — the LiveKit JS client UMD bundle, pinned
at version `2.5.7`, fetched from `cdn.jsdelivr.net` on 2026-07-12 and committed
here as a vendored binary (`.gitattributes` marks `vendor/*.js binary`).

- **bytes:** 364065
- **SHA-384 (SRI):** `sha384-8MchKu+uhKf1LR8KGk472KudVHw8lg9vmXj/XW6mPzWLSXlVTlnW/+oJixUtGYbX`
- **pinned in:** `production/guest/join.html` and `production/guest/stage.html` (the `integrity=`
  attribute on the `<script src="/vendor/livekit-client-2.5.7.umd.min.js">` tag now carries this hash).

Note: jsdelivr prepends a short "already minified" comment to the served bytes; that comment is part of
the vendored file and therefore part of the hashed bytes, so the SRI is self-consistent when Caddy serves
these exact bytes back from `/vendor/`.

Remaining (operator/on-node): serve this dir at `/vendor/` from `uni-bcast-overlays` (see
`production/overlays/Caddyfile`) and, if a stricter supply-chain bar is wanted, cross-check the bytes
against the npm package tarball's published integrity (not just the CDN response) before go-live.

## How to vendor it (the still-pending live step)

1. Fetch the exact pinned version from the upstream CDN/npm registry, e.g.:
   ```sh
   curl -fsSL -o livekit-client-2.5.7.umd.min.js \
     https://cdn.jsdelivr.net/npm/livekit-client@2.5.7/dist/livekit-client.umd.min.js
   ```
2. Verify the download against the published npm package checksum/provenance
   before trusting it (do not just trust the CDN response).
3. Compute the SHA-384 integrity hash:
   ```sh
   openssl dgst -sha384 -binary livekit-client-2.5.7.umd.min.js | openssl base64 -A
   ```
4. Replace `sha384-PLACEHOLDER-COMPUTE-AND-REPLACE` in BOTH
   `production/guest/join.html` and `production/guest/stage.html` with
   `sha384-<the base64 output from step 3>`.
5. Serve this directory at `/vendor/` from `uni-bcast-overlays` (Caddy,
   `:8099`) — see `production/overlays/Caddyfile` for the existing static
   file-serving pattern used for the other overlay pages.

## The exact `<script>` tag both HTML files use once this lands

```html
<script src="/vendor/livekit-client-2.5.7.umd.min.js" integrity="sha384-<REAL-HASH-HERE>" crossorigin="anonymous"></script>
```

Until step 4 above is done, the `integrity=` attribute in both guest pages
is a placeholder and the `<script>` tag will fail its Subresource Integrity
check in any browser that enforces it (the load will be blocked, failing
safe rather than silently loading an unverified script).
