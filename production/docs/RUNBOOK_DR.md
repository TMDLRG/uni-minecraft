# RUNBOOK: Disaster Recovery -- redeploy-from-scratch, rollback, and the honest failover posture

**Status:** design/reference, `pending` (authored, NOT yet rehearsed end-to-end on real hardware --
`--dry-run` at best tonight). Closes GAP G-DR alongside `production/scripts/backup.sh` +
`production/systemd/uni-backup.{service,timer}` + `production/verify_p1.sh`. A rehearsal on a
scratch box (`production/docs/receipts/dr_rebuild_<date>.md`) is required before G-DR is fully
closed -- see `docs/RELEASE_READINESS.md` Phase XII / week-2 hardening.

Companion docs: `production/docs/DEPLOYED_STATE.md` (the current lock table), `production/verify_p1.sh`
(the proof gate every recovery ends with), `production/docs/RUNBOOK_PANIC.md` (the fast-path stop,
not a recovery procedure).

---

## 1. Redeploy-from-scratch (fresh node has nothing on it)

Use when the broadcast node itself is gone/unrecoverable (hardware loss, corrupted install) and a
fresh UNI.OS node must stand the platform back up.

1. **Fresh UNI.OS node.** Provision it per the platform's UNI.OS baseline (out of scope here --
   see the fleet provisioning docs); confirm it is NOT the ERP appliance (`uni-lab`), per
   ADR-PROD-003 placement rule.
2. **Clone the repo and checkout the target tag** (never the working tree -- ships go via
   `git archive` of an immutable, pushed ref):
   ```sh
   git clone <repo-url> /var/lib/uni/broadcast-src-clone
   git -C /var/lib/uni/broadcast-src-clone checkout <target-tag>
   ```
3. **Archive that tag and ship it to the new node** (index bytes, not the working tree):
   ```sh
   git -C /var/lib/uni/broadcast-src-clone archive <target-tag> | gzip > /tmp/<target-tag>.tar.gz
   sha256sum /tmp/<target-tag>.tar.gz            # record this alongside the tag
   # ship the tarball to the new node by whatever transport is available (scp, uni-lab MCP
   # os_file_write, etc.)
   ```
4. **sha256-verify on the new node before trusting anything in the tarball**:
   ```sh
   sha256sum -c <<< "<recorded-sha256>  <target-tag>.tar.gz"
   ```
   Do not unpack an unverified tarball -- this is the same "repo == node, byte-proven" discipline
   `DEPLOYED_STATE.md` records for the current deploy.
5. **Unpack under `/var/lib/uni/broadcast-src`**:
   ```sh
   mkdir -p /var/lib/uni/broadcast-src
   tar -xzf /tmp/<target-tag>.tar.gz -C /var/lib/uni/broadcast-src
   ```
6. **Restore the latest backup snapshot** from `UNI_BACKUP_DEST`, verifying its manifest BEFORE
   trusting any restored file:
   ```sh
   SNAP="<UNI_BACKUP_DEST>/<latest-YYYYMMDD>"
   cd "$SNAP" && sha256sum -c manifest.sha256      # every restored file must check clean
   # only after a clean check, copy each mirrored subtree back to its absolute path, e.g.:
   cp -a "$SNAP/var/lib/uni/broadcast/." /var/lib/uni/broadcast/
   cp -a "$SNAP/etc/uni/." /etc/uni/
   cp -a "$SNAP/etc/containers/systemd/." /etc/containers/systemd/
   cp -a "$SNAP/etc/systemd/system/." /etc/systemd/system/
   ```
   If `manifest.sha256` does not check clean, STOP -- do not trust that snapshot; fall back to an
   older daily snapshot and re-check, or treat the restore as partial/unverified in the receipt.
7. **Bring the units up:**
   ```sh
   systemctl daemon-reload
   systemctl enable --now uni-bcast-mixer uni-bcast-relay uni-bcast-overlays \
     uni-production-mcp uni-heartbeat.timer uni-backup.timer
   ```
8. **Run the proof gate. `ALL PASS` = restored, not before:**
   ```sh
   podman run --rm --network host -v /var/lib/uni:/w:ro -v /etc/containers/systemd:/q:ro \
     --entrypoint sh docker.io/alpine/git /w/broadcast-src/production/verify_p1.sh
   ```

**Receipt:** commit the gate output + the tag/sha + the manifest check result to
`production/docs/receipts/dr_rebuild_<date>.md`.

---

## 2. Ship-to-previous-tag rollback (existing node, roll back a bad release)

Use when the CURRENT node is up but the currently-deployed release is bad and must roll back to a
known-good previous tag.

1. **Check out the previous tag's source** on the existing node:
   ```sh
   git -C /var/lib/uni/broadcast-src checkout <previous-tag>
   ```
2. **Redeploy that tag's quadlet/config bytes** to `/etc/containers/systemd/` (the exact files
   that tag's own `DEPLOYED_STATE.md`-equivalent lock table names -- see the note below).
3. **Reload + re-verify:**
   ```sh
   systemctl daemon-reload
   # restart the affected units if their config changed:
   systemctl restart uni-bcast-mixer uni-bcast-relay uni-bcast-overlays uni-production-mcp
   podman run --rm --network host -v /var/lib/uni:/w:ro -v /etc/containers/systemd:/q:ro \
     --entrypoint sh docker.io/alpine/git /w/broadcast-src/production/verify_p1.sh
   ```
4. **Confirm the sha-compare now matches the OLDER tag's lock table**, not the newer one --
   `verify_p1.sh`'s deployed-file integrity checks (`check_sha`) are hardcoded to whatever shas
   were pinned when the gate script itself was last edited for that tag. This means:

   > **Every future release needs its own receipt.** Per the plan's Phase XV release process,
   > each tag that changes a sha-pinned file (`mediamtx.yml`, the `.container` quadlets,
   > `Caddyfile`) must ship its own `DEPLOYED_STATE.md`-style lock table (or an equivalent
   > `verify_p1.sh` revision) recording the correct shas FOR THAT TAG. Without that, this
   > rollback step has no correct target to sha-compare against, and step 4 cannot be verified
   > mechanically -- it degrades to "the files match what I just copied," which is not the same
   > claim as "the gate independently confirms the older tag's bytes."

**Receipt:** commit the gate output (post-rollback) + the tag rolled back to +
`production/docs/receipts/dr_rollback_<date>.md`.

---

## 3. Honest failover posture (read this literally before promising redundancy to anyone)

- **No hot standby exists.** The broadcast platform is a SINGLE node (`uni-lab-79740c`). There is
  no warm or hot peer that can take over the program automatically or on command.
- **Recovery Time Objective (RTO) is approximately 30 minutes** under normal conditions: fresh
  boot + `git clone` + archive-unpack + rsync-restore + `verify_p1.sh`. This number has **no
  guarantee under worse conditions** (network issues reaching the backup target, a corrupted
  snapshot requiring fallback to an older one, hardware procurement delay if the node itself
  needs replacing, etc.) -- 30 minutes is the best-case estimate for a clean rebuild, not an SLA.
- **During the recovery window the feed is dark.** There is no fallback program, slate, or
  secondary source while the rebuild runs. This is a single point of failure for a public,
  worldwide, 7-day broadcast run, and is recorded honestly as `pending` in
  `production/docs/GAPS_REGISTER.md` (G-DR).
- **This posture closes only when:**
  1. A warm-standby peer node is provisioned (a second box that can take the program feed with a
     short, rehearsed cutover -- not "another box exists somewhere").
  2. A promotion script is written AND rehearsed end-to-end (not just designed).
- **Both of those are explicitly OUT OF SCOPE for tonight** and are targeted at week-2+
  hardening, per the remediation plan. Do not represent the platform as having redundancy,
  failover, or a hot standby until both close with a captured, linked rehearsal receipt --
  the same "no row closes by assertion" discipline `GAPS_REGISTER.md` applies everywhere else
  applies here too.

**If asked "what happens if the node dies mid-broadcast":** the honest answer, until the two items
above close, is: the feed goes dark, and a human executes section 1 of this runbook, and the
program is back in roughly 30 minutes under normal conditions with no guarantee under worse ones.
