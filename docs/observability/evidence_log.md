# Blanket Evidence Log & Independent Verification

The evidence log is the **falsifiable** record of everything that crossed (and
did not cross) the Markov blanket each tick. It is produced by the simulator and
can be re-verified by any third party with nothing but this repo and the run's
seed — the verdict is *re-derived*, never trusted from an engine-stamped flag.

## Producing a log

```bash
mix run scripts/record_run.exs 314 morphology_seeking 250
# -> runs/seed314-morphology_seeking.jsonl   (one JSON object per recorded tick)
# -> runs/seed314-morphology_seeking.meta.json (provenance + channel reveal tables)
```

In code: `SP.Sim.new(..., record_blanket?: true)` then `SP.Sim.Recorder.write(sim, base)`.
Use `record_every: N` and `max_frames: M` to bound long runs. Recording is OFF by
default and is a pure read of already-computed state, so it never affects agent
behaviour or determinism (proven by `SP.Sim.BlanketTest`).

## Re-verifying (headless, falsifiable)

```bash
mix sp.verify runs/seed314-morphology_seeking.jsonl
# VERIFIED: 46 frames, 0 blanket violations.   (exit 0)
```

Tamper with any observation value or signal and it fails, naming the frame:

```
VIOLATION: 1/46 frames leaked. First: {"frame":20,"reasons":["encode_equivalence"],"tick":21}
(exit 1)
```

`SP.Sim.Verifier.check_log/1` rebuilds the channel map from the recorded seed (the
public algorithm in `SP.Interface.channel_map/2`), then runs four checks per frame:

1. **Structural** — `Audit.audit_observation(obs) == :ok` (integer channels in
   range, finite numbers only).
2. **Token scan** — `Audit.scan(obs) == []` (no semantic tokens).
3. **Morphology provenance** — every observed channel maps to a sensor whose organ
   was present at sensing time (`afferent.decision_organs`). No channel may exist
   that the recorded morphology could not have produced.
4. **Encode-equivalence** — `encode_observation(cm, recorded_signals) == obs`
   exactly. The observation is *precisely* the channelisation of the recorded
   signals — no hidden side-channel.

## Frame schema (one JSON object per tick)

```jsonc
{
  "tick": 21,
  "world":  { "seed", "tick", "region_count", "seam_threshold",
              "adjacency", "seams",
              "regions": [ { "id","w","h","law",
                "seam_readiness","seam_ready",
                "layers": { "nutrient":{w,h,cells[]}, "temperature":{…},
                            "solvent":{…}, "toxin":{…},        // L0
                            "cavity":{…}, "strain":{…},        // L2
                            "bands":[{…},{…},{…}] },           // L3
                "materials": { "<cell>": { "<material>": amt } },  // L1
                "conduits": [[i,j]],                            // L2 transport
                "infrastructure": { "<cell>": [{kind,integrity}] },
                "ecology": [{cell,kind,energy}] } ] },          // L4 via seams
  "body":   { "location","energy","hydration","temperature","integrity",
              "growth_budget","stage","alive","inventory","organs","parts" },
  "genome": { "lineage","growth_plan","maturation_rate","thrift",… },

  "afferent": {                         // world -> agent (the blanket, inbound)
    "signals":[ {"type","source","time","data"} ],
    "observation": { "<channel>": float },   // the ONLY world->agent datum
    "derivation": [ {channel,source,key,organ,affine,encoded} ],
    "decision_organs": ["interoception","chemotactile",…]
  },
  "efferent": {                         // agent -> world (the blanket, outbound)
    "directives":[ {kind,channel,params} ],
    "decoded":[ {channel,action,params,decoded,gated,applied} ]
  },
  "blanket": {                          // engine CLAIM — re-derived, never trusted
    "audit":"ok", "scan_leaks":[],
    "channels_explained":true,
    "context_redacted":false            // true under faithful mode
  }
}
```

The `derivation` table and the meta sidecar's reveal maps expose channel↔semantic
meaning. That is correct for the **observer/verifier** side and is produced only
after `decide/3` has already run; it is never placed on the agent path. Faithful
mode (`faithful?: true`) additionally removes the channel map from the agent's
decision context, so the opaque observation is provably the sole world-derived
input.

## What the log proves (and how it could be falsified)

- **No hidden state reaches the agent** — checks 1–2 reject any non-opaque value;
  check 4 proves the observation is exactly the recorded signals channelised.
- **No impossible perception** — check 3 rejects any channel the morphology could
  not have produced.
- **The agent is outside the world** — under faithful mode, `context_redacted`
  asserts the observation was the only world-derived input.

If any of these were false, the corresponding check fails and `mix sp.verify`
exits non-zero. The negative tests in `SP.Sim.BlanketTest` inject each leak class
and confirm the checks bite.
