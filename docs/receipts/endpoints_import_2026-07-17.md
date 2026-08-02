# Receipt — the safe import: keys go from your file to the encrypted store, the agent never sees them

**Date:** 2026-07-17 · **Track:** studio · **Gate:** `endpoints-import-key-blind`

## Why (the operator's teaching)

Copy-paste of keys through the agent was the wrong workaround. My refusal to hold keys was right in
principle; the correct fix is a route where the **agent** triggers the import but the **keys** stay
entirely between the operator's local file and the server. The agent's request body carries nothing
sensitive; the response contains only masked names + counts. This is the durable answer to "keys get
lost if you miss the import step" — because now there is one.

## What it is

`POST /api/endpoints {action:"import"}` reads `~/Desktop/streaming.txt` **server-side**, encrypts straight
into `endpoints.enc` (AES-256-GCM), optionally wraps the PIN, and returns only masked keys. The route
requires the same `x-uni-cc:1` header every other console POST does (the CSRF fence).

**File format** (`~\Desktop\streaming.txt`, delete after import):

```
# streaming.txt — the server reads this; the agent never sees it. Delete after import.

passphrase: <your AES-256-GCM passphrase — REQUIRED>
pin: <4-8 digit PIN — OPTIONAL, wraps the passphrase so ARM is one PIN click>

# Endpoints — pipe-separated OR JSON per line. Comments (# ...) and blank lines ignored.
YouTube #1 | rtmp://a.rtmp.youtube.com/live2/ | live_yourkey
Twitch     | rtmp://live.twitch.tv/app/       | live_yourkey
{"name":"YouTube #2","url":"rtmp://a.rtmp.youtube.com/live2/","key":"live_backup"}
```

## PASS

The response body contains only masked keys (`****last4`), the `endpoints.enc` on disk is ciphertext (a
grep for any plaintext key value finds no match), and no key value appears anywhere the agent could see
it. The route refuses the import (401 `EP_WRONG_PASS`) when an encrypted store already exists and the
new passphrase doesn't open it — the D1 lockout protection carries through.

## FALSIFIES

Any plaintext key appearing in the response body; any plaintext key appearing in `endpoints.enc`; the
route accepting the passphrase in the POST body (which would flow through the agent).

## Proof

Fake `streaming.txt` with three sentinel keys (`FAKE_YT_SENTINEL_KEY_zzz111`,
`FAKE_TWITCH_SENTINEL_KEY_zzz222`, `FAKE_YT2_SENTINEL_KEY_zzz333`), a rehearsal passphrase, and PIN
`42077`. Agent POSTs `{action:"import", path:"...streaming_fake.txt"}` — that request body carries **no
secret**. Response:

```json
{ "imported": 3, "pinSet": true, "warnings": [],
  "endpoints": [
    { "name": "YouTube #1",     "keyMask": "****z111" },
    { "name": "Twitch",         "keyMask": "****z222" },
    { "name": "YouTube backup", "keyMask": "****z333" }
  ], "source": "...streaming_fake.txt" }
```

**Sentinel leak grep on the response** — 0 hits for any of the fake keys, passphrase, or PIN.
**Ciphertext grep on `endpoints.enc` + `endpoints_pin.enc`** — 0 hits for the same sentinels. Both on
disk (448 + 90 bytes) are AES-256-GCM.

**Falsification:** a second `streaming.txt` with a DIFFERENT passphrase must NOT overwrite the store
(the D1 lockout guard carries through). Live:

```
HTTP 401
{"err":"IMPORT REFUSED: an encrypted store already exists and the passphrase in streaming.txt does not open it. Nothing was written. ..."}
```

Original ciphertext survives byte-identical. Cleanup: the store was confirmed to contain **only** the
fake sentinels before deletion; `endpoints*.enc` deleted; box left `hasStore:false, hasPin:false` for
the operator's real import.

**Verdict: PASS.** The agent triggers, the server encrypts, no plaintext ever traverses the agent.
