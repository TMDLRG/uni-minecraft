#!/bin/sh
# Exact Arm-A rollback (pre-registered in the RED): remove the producer node + its forwarder,
# restart the original camera pair. NEVER touches uni-colony / mc-server / the world / minds.
set -ex

podman stop uni-producer uni-viewer-cam-fwd2 || true
podman rm uni-producer uni-viewer-cam-fwd2 || true

podman start uni-viewer-cam-fwd uni-cam

podman ps --format '{{.Names}} | {{.Status}}'
