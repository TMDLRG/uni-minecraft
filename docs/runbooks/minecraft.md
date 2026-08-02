# Watching the World in Minecraft

Bridge the live simulation into a real Minecraft (Java) world: the terrain is
built from blocks and the agent is a **glowing blaze** teleported through it each
tick (its glow outline is visible through walls, so you can always follow it),
with a small **morphology crown** above it that grows as the agent develops
sense/appendage organs. When the agent dies, the next life is **bred from the
longest-lived genome so far** (a (1+1) evolution strategy), so the morphology
evolves across generations and the world plays continuously — indefinitely.

## Why 1.16.5

This machine has **Java 11**, which runs **Minecraft / Paper 1.16.5** (modern
versions need Java 17/21). So the server and your client both use **1.16.5**.

## Prerequisites (yours to provide)

1. **Minecraft Java Edition** (you must own it) with the **1.16.5** profile in the
   launcher. _(No `.minecraft` was detected on this machine — install/launch the
   client at least once.)_
2. Java 11 (already present: Temurin 11).

## One-time setup

```bash
bash scripts/minecraft_setup.sh          # downloads Paper 1.16.5 + writes server.properties
echo "eula=true" > mcserver/eula.txt      # YOU accept Mojang's EULA (required)
(cd mcserver && java -jar paper.jar nogui)  # start the server (first run generates the world)
```

`server.properties` is preconfigured with `enable-rcon=true`, `rcon.port=25575`,
`rcon.password=sp`, a flat world, and spectator mode.

## Run the bridge

From the repo root, with the server running:

```bash
mix sp.minecraft --password sp
# options: --host --port --seed --agent --ms --terrain_every
```

It connects via RCON, builds the world, spawns the agent, and streams the
simulation continuously.

## Watch

1. In the Minecraft **1.16.5** client, **Multiplayer → Direct Connect → `localhost`**.
2. You'll spawn in spectator mode near the build. Fly around; the agent is the
   glowing cube. `/gamemode spectator` if needed; `/tp @s <x y z>` to jump around.

## Block legend

| terrain | block |
|---|---|
| lush (food) | lime_concrete (taller = more nutrient) |
| water | light_blue_concrete |
| toxic | red_concrete |
| barren | sand |
| void (hidden cavity) | black_concrete |
| agent | glowing blaze (`tag=spagent`) + morphology crown (cyan=sense · magenta=appendage · sea-lantern=stage) |

## How it maps to the engine

`SP.Minecraft.Builder` turns `SP.World` into block commands; `SP.Minecraft.Rcon`
(OTP `:gen_tcp`, no deps) sends them; `SP.Minecraft.Runner` steps `SP.Sim` and
moves the agent. This is an **observer** bridge only — it reads world state to
render it; it does not change what the agent perceives (the Markov blanket and
the falsifiable evidence in [evidence_log.md](../observability/evidence_log.md)
are unaffected).

## Troubleshooting

- **`Could not reach Minecraft RCON`** — the server isn't running, or RCON isn't
  enabled/!matching. Check `mcserver/server.properties` and that you accepted the
  EULA.
- **Jar 404 in setup** — bump the build: `PAPER_BUILD=795 bash scripts/minecraft_setup.sh`.
- **Client can't connect** — ensure the client is 1.16.5 and you used `localhost`.
- **Server won't start (Java error)** — confirm `java -version` is 11+, and that
  you're using the 1.16.5 jar (not a newer one needing Java 17/21).
```
