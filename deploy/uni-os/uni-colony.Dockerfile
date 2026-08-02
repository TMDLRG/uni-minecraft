# uni-colony (v1, headless core) — the Stratified Palimpsest colony for UNI.OS: the pure-Elixir AIF brain +
# Producer + HUD :4000, spawning mineflayer bodies as Erlang Ports. ONE container (the bodies are Ports of the
# BEAM ⇒ same machine). Connects to mc-server BY NAME via MC_HOST on uni-colony-net.
#
# v1 is HEADLESS — NO native gl/canvas build, so the image is light + reliable:
#   • UNI_CAM=0 makes the Director skip the stream camera (director.js → prismarine-viewer).
#   • no UNI_POV_PORT ⇒ the bodies never require prismarine-viewer (the POV view, body.js:91).
#   ⇒ the bodies need only mineflayer; the cam + POV pixels are v2 (add gl then).
# The brain is pure Elixir (NO Nx/Rust/NIF — standing invariant).
#
# Build:  podman build -t 10.190.245.122:5000/uni-colony:v1 -f deploy/uni-os/uni-colony.Dockerfile .
# Push:   podman push  --tls-verify=false 10.190.245.122:5000/uni-colony:v1
# Run (on the lab, mc-server already up on uni-colony-net):
#   podman run -d --name uni-colony --network uni-colony-net -e MC_HOST=mc-server -e MC_PORT=25565 \
#     -e UNI_CAM=0 -p 127.0.0.1:4000:4000 127.0.0.1:5000/uni-colony:v1
FROM docker.io/library/elixir:1.18-otp-27

# node is all the bodies (mineflayer) need in v1 — no gl/canvas toolchain.
RUN apt-get update && apt-get install -y --no-install-recommends nodejs npm \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY mix.exs .formatter.exs ./
COPY config ./config
COPY lib ./lib
COPY scripts ./scripts
COPY ui ./ui
COPY viewer ./viewer
# runs/ carries operational launchers (runs/motor_lineage.exs = the :motor_cortex RED lineage) + probes,
# so a motor container can `mix run runs/motor_lineage.exs` against mc-server.
COPY runs ./runs

# Elixir: fetch + compile the Phoenix umbrella (ui path-deps the root SP app) so runtime start is fast and any
# compile error surfaces at build time, not on the lab.
RUN mix local.hex --force && mix local.rebar --force \
 && (cd ui && mix deps.get && mix compile)

# Bodies: install ONLY mineflayer (it brings vec3) — strip prismarine-viewer from the dep set so there is no
# native gl/canvas build. The POV viewer (body.js:91) is gated off in v1, so it is never required at runtime.
RUN cd viewer \
 && node -e "const fs=require('fs'),p=require('./package.json');p.dependencies={mineflayer:p.dependencies.mineflayer};p.devDependencies={};fs.writeFileSync('package.json',JSON.stringify(p))" \
 && npm install --omit=dev --no-audit --no-fund

# @repo_root = Path.expand("../../..", __DIR__) ⇒ /app, so body.js = /app/viewer/body.js, runs/colony fresh.
ENV MC_HOST=mc-server MC_PORT=25565 MIX_ENV=dev UNI_CAM=0 UNI_AUTOSTART=1
EXPOSE 4000
WORKDIR /app/ui
CMD ["elixir", "--sname", "uni", "--cookie", "sp", "-S", "mix", "phx.server"]
