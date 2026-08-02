# uni-cam — the broadcast CAMERA for the UNI.OS colony (UNI_OS_COLONY_MIGRATION.md Path A, service #4).
# node:20 + headless GL (xvfb + mesa + headless-gl + node-canvas) + viewer/director.js (prismarine cam :3020).
# This is the "one genuinely new piece vs. Thinker" the migration doc flags: the headless WebGL context.
#
# It connects to mc-server BY NAME (internal, on uni-colony-net) as the "Director" spectator bot, renders the
# world through prismarine-viewer in a headless GL context, and serves the camera page on :3020. Thinker's OBS
# captures http://<chip>:3020 over the LAN (the :3020 forwarder already exposes it). It needs NO :25565 exposed
# to Thinker — the camera reaches the world INSIDE the chip's podman network.
#
# BUILD ON A DEV BOX, NOT THE CHIP (charter: never stress the ERP appliance with a heavy native compile):
#   podman build -t 10.190.245.122:5000/uni-cam:v1 -f deploy/uni-os/uni-cam.Dockerfile .
#   podman push  --tls-verify=false 10.190.245.122:5000/uni-cam:v1
# RUN on the chip (mc-server already up on uni-colony-net):
#   podman run -d --name uni-cam --network uni-colony-net \
#     -e MC_HOST=mc-server -e MC_PORT=25565 -e RCON_PORT=25575 -e RCON_PASS=sp -e VIEWER_PORT=3020 \
#     -p 3020:3020 10.190.245.122:5000/uni-cam:v1
# Then Thinker OBS "Colony Cam" -> http://<chip>:3020 (already forwarded), cut COLONY to program.
FROM docker.io/library/node:20-bookworm

# headless-gl + node-canvas native build deps + a software-GL virtual display (xvfb + mesa-dri).
# (Exact set from docs/RESUME_2026-06-22.md:225-226.)
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ pkg-config \
      libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev \
      libgl1-mesa-dev libxi-dev libxext6 libx11-6 \
      xvfb libgl1-mesa-dri \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app/viewer
# director.js + the camera's package.json. Keep ONLY the deps the camera needs (mineflayer + prismarine-viewer);
# prismarine-viewer pulls headless-gl + node-canvas, which compile natively against the deps installed above.
COPY viewer/package.json ./package.json
COPY viewer/director.js ./director.js
RUN node -e "const fs=require('fs'),p=require('./package.json'); p.dependencies={mineflayer:p.dependencies.mineflayer,'prismarine-viewer':p.dependencies['prismarine-viewer']}; p.devDependencies={}; delete p.scripts; fs.writeFileSync('package.json',JSON.stringify(p,null,2))" \
 && npm install --omit=dev --no-audit --no-fund

# Camera env: reaches mc-server by name, RCON for the camera teleports, serves :3020.
ENV MC_HOST=mc-server MC_PORT=25565 RCON_PORT=25575 RCON_PASS=sp VIEWER_PORT=3020 \
    MC_VERSION=1.16.5 DISPLAY=:99
EXPOSE 3020

# Start a software-GL virtual display, then director.js. xvfb-run wraps Xvfb + DISPLAY + the child; the mesa
# libgl1-mesa-dri driver gives headless-gl a real (software) GL context so prismarine-viewer renders pixels.
ENTRYPOINT ["xvfb-run", "-a", "-s", "-screen 0 1280x720x24", "node", "director.js"]
