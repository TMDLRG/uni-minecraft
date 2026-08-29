# uni-minecraft — public mirror

This repository is a **live mirror** of a private working repository. It is not a curated highlight
reel, and it is no longer a frozen snapshot.

| | |
|---|---|
| source branch | `gen2-runtime` |
| source commit | `3b7a8711552d` |
| files published | 1781 |
| client identifiers removed | 16 occurrence(s) across 6 file(s) |

## How this repository is updated

Work happens in the private repository, including work that is not ready to be seen. Nothing here
moves until someone promotes it, and a promotion arrives as a **pull request** that a human merges.
Nothing pushes to `main` directly.

## Why the history here is not the private history

This mirror's history begins at the mirror and grows one commit per promotion, each recording the
private commit it came from. The private repository keeps its own history and keeps it private.

That is a measured decision rather than a convenience. A full-history mirror was tested and refused:
a credential scan across the private history came back clean, but the private history contains
references to third-party client engagements that were never the author's to publish. Publishing the
history would publish those. So the history stays where it is, and every promotion here still names
the exact private commit it reflects, which is the part a reader can actually use.

## What was removed, and what deliberately was not

**Removed:** third-party client identifiers, replaced in place with `[redacted: client-identifier]`
so the surrounding document still reads and the removal is visible rather than silent. Those strings
name a client's organisation and people. Consent to publish them was never given, so they are not
published.

**Not removed:** infrastructure topology, internal hostnames, private network addresses, operator
filesystem paths, failure reports, adverse results and limitations. 477 private-address, 31 tailscale-address, 293 internal-hostname, 200 operator-path remain in this tree and are published as-is. Private network addresses are unroutable from the public internet and internal DNS names resolve
only inside the author's own network. They are published because a system you can only partially see
is a system you cannot check.

**No credentials, keys or tokens are present.** Verified by scan of these bytes before publication,
not assumed.

## The honest limit of that verification

A scanner recognises shapes, not meaning. It cannot tell you whether a sentence in a design document
should have stayed private, and no scanner anywhere closes that gap. What protects this tree is a
deliberate decision that it should be readable — not a program certifying it harmless.

If you find something here that should not be here, that is a real finding and it is welcome. Open an
issue.
