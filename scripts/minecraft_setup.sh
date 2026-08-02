#!/usr/bin/env bash
# Sets up a local Paper (Minecraft 1.16.5) server with RCON enabled, for the
# `mix sp.minecraft` bridge. Targets 1.16.5 because this machine has Java 11.
#
# Usage: bash scripts/minecraft_setup.sh [dir]   (default dir: mcserver)
#
# NOTE: this DOWNLOADS the Paper server jar (~40MB from papermc.io) and you must
# accept Mojang's EULA yourself (it is your legal agreement) before the server
# will run. This script does NOT accept the EULA for you.
set -euo pipefail

DIR="${1:-mcserver}"
BUILD="${PAPER_BUILD:-794}" # last 1.16.5 build; bump if it 404s
JAR_URL="https://api.papermc.io/v2/projects/paper/versions/1.16.5/builds/${BUILD}/downloads/paper-1.16.5-${BUILD}.jar"

mkdir -p "$DIR"
echo "Downloading Paper 1.16.5 (build ${BUILD}) -> ${DIR}/paper.jar"
curl -fSL -o "${DIR}/paper.jar" "$JAR_URL"

cat > "${DIR}/server.properties" <<'EOF'
enable-rcon=true
rcon.port=25575
rcon.password=sp
online-mode=true
gamemode=spectator
force-gamemode=true
level-type=flat
generate-structures=false
spawn-protection=0
allow-flight=true
max-players=5
view-distance=12
motd=Stratified Palimpsest
EOF

echo
echo "Done. Two manual steps remain (Mojang requires you to do these):"
echo "  1) Accept the EULA:  echo 'eula=true' > ${DIR}/eula.txt"
echo "  2) Start the server: (cd ${DIR} && java -jar paper.jar nogui)"
echo
echo "Then, from the repo root:  mix sp.minecraft --password sp"
echo "And join 'localhost' in the Minecraft Java 1.16.5 client to watch."
