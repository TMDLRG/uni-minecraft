# UNI.Minecraft — public source snapshot

The colony, the Producer, the scientific control plane, the operator plane and the broadcast suite.

This repository is a **snapshot of working source**, published in full and on purpose. It is not a
curated highlight reel and it is not a marketing artifact. It is the tree the work actually happens
in, as it stood at one commit.

## What this is a snapshot of

| | |
|---|---|
| source repository | `UNI.Minecraft` (private) |
| branch | `gen2-runtime` |
| commit | `e0585c5` |
| files published | 1630 text files scanned, 30 top-level entries |

The private repository keeps its history. This one carries a single commit, because a rewritten
history is a claim about the past that nobody can check, and one honest snapshot is not.

## What was removed, and why that is the only thing removed

**12 occurrence(s) of third-party client identifiers were replaced with
`[redacted: client-identifier]`.** That is the complete list of removals. Those strings name a
client's organisation, personnel and internal ticket numbers. They are not the author's information
to publish, so they are not published — not because they are embarrassing, but because consent to
publish them was never given by the people they belong to.

**Nothing else was removed.** Not the infrastructure topology, not the internal hostnames, not the
private network addresses, not the operator's own machine paths, not the failure reports, not the
adverse results, not the limitations documents. Those are all here.

That is a deliberate decision by the author, taken with the exposure measured and understood:
1050 structural matches (private addresses, internal DNS names, local filesystem
paths) remain in this tree and are published as-is. Private network addresses are unroutable from the
public internet. Internal DNS names resolve only inside the author's own network. They are published
because a system you can only partially see is a system you cannot check, and the entire point of
this work is that it can be checked.

**No credentials, keys, tokens or certificates are present.** That was verified by scan before
publication, not assumed.

## The honest limits of that verification

A scanner recognises shapes. It does not recognise meaning. It cannot tell you whether a sentence in
a design document is something that should have stayed private, and no scanner anywhere closes that
gap. What protects this tree is that its author decided, deliberately, that it should all be
readable — not that a program certified it harmless.

If you find something in here that should not be in here, that is a real finding and it is welcome.
Open an issue.

## What you are looking at

Read `CLAUDE.md` at the root first if there is one — it is the operating contract the work is held
to, and it is written for whoever picks the work up next.

Adverse results, failing gates, blocked work and known limitations are recorded in this tree rather
than removed from it. If a document here says something does not work, that is the document doing
its job.

## Licence

MIT. See `LICENSE`.
