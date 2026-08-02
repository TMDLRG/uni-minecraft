#!/usr/bin/env bash
# NURSERY -> PURE-WORLD FORAGE GATE — the full harness pipeline, one command. Runs ON the lab box (rootless `uni`,
# /app) or via `ssh uni@10.190.245.122 'cd /app && runs/nursery_forage_gate.sh'`. Mirrors the world-session
# discipline of the rung-1 RED: one node per world-session, RCON probes, one RESULT line per arm, a paired verdict.
#
# STAGES:
#   0. OFFLINE PRECHECK   — runs/verify_forage_dynamics.exs: the earn-to-eat food economy is survivable + non-trivial.
#   1. NURSERY TRAINING   — runs/nursery_train.exs on the PROTECTED nursery world -> a trained .bin (GRAD_BIN).
#   2. QA (trained)       — runs/pureworld_qa.exs ARM=trained on the PURE world (zero gives) -> RESULT line.
#   3. QA (control)       — runs/pureworld_qa.exs ARM=control (fresh mind) on the SAME pure world -> RESULT line.
#   4. PAIRED GATE        — runs/analyze_forage_qa.py: trained PASSES + BEATS the untrained twin => safe to deploy.
#
# LIVE-STREAM GUARD (CLAUDE.md / LAB_PROTOCOL): nursery and pure worlds are SEPARATE containers with DISTINCT kin
# (nursery=70, QA=71) + distinct memory dirs; never run a 2nd --sname uni node against the streamed colony; owner
# go-ahead required before any of this touches the public colony. This script assumes dedicated mc-nursery /
# mc-pure servers (NOT the live uni-colony).
set -euo pipefail
cd "${UNI_REPO:-/app}"

COOKIE="${COOKIE:-sp}"
MC_NURSERY="${MC_NURSERY:-mc-nursery}"     # protected training server (peaceful/day/stocked)
MC_PURE="${MC_PURE:-mc-pure}"              # pure QA server (natural spawns, ZERO gives; ideally a clone of the live world)
TRAIN_SEC="${TRAIN_SEC:-3600}"
SOAK_SEC="${SOAK_SEC:-1800}"
SEEDS="${SEEDS:-1 2 3}"                    # paired seeds; deploy decision is the seed-majority (analyzer needs >=1 pair)
OUT="${OUT:-runs/forage_qa_$(date +%Y%m%d-%H%M%S)}"
mkdir -p "$OUT" runs/brains
RESULTS="$OUT/results.txt"; : > "$RESULTS"

echo "== STAGE 0: offline earn-to-eat precheck =="
elixir -S mix run runs/verify_forage_dynamics.exs | tee "$OUT/precheck.log"

for S in $SEEDS; do
  GRAD_BIN="$(pwd)/runs/brains/forager_kin70_s${S}.bin"

  echo "== STAGE 1: nursery training (seed=$S) -> $GRAD_BIN =="
  env UNI_AUTOSTART=0 SEED="$S" KIN=70 TRAIN_SEC="$TRAIN_SEC" GRAD_BIN="$GRAD_BIN" \
      MC_HOST="$MC_NURSERY" RCON_HOST="$MC_NURSERY" \
      elixir --sname "unursery_s${S}" --cookie "$COOKIE" -S mix run --no-halt runs/nursery_train.exs \
      | tee "$OUT/train_s${S}.log"

  echo "== STAGE 2: pure-world QA ARM=trained (seed=$S) =="
  env UNI_AUTOSTART=0 ARM=trained SEED="$S" KIN=71 SOAK_SEC="$SOAK_SEC" MEMORY_BIN="$GRAD_BIN" \
      MC_HOST="$MC_PURE" RCON_HOST="$MC_PURE" \
      elixir --sname "uqa_t_s${S}" --cookie "$COOKIE" -S mix run --no-halt runs/pureworld_qa.exs \
      | tee "$OUT/qa_trained_s${S}.log"
  grep -h '^RESULT ' "$OUT/qa_trained_s${S}.log" >> "$RESULTS" || true

  echo "== STAGE 3: pure-world QA ARM=control (seed=$S, untrained twin) =="
  env UNI_AUTOSTART=0 ARM=control SEED="$S" KIN=71 SOAK_SEC="$SOAK_SEC" \
      MC_HOST="$MC_PURE" RCON_HOST="$MC_PURE" \
      elixir --sname "uqa_c_s${S}" --cookie "$COOKIE" -S mix run --no-halt runs/pureworld_qa.exs \
      | tee "$OUT/qa_control_s${S}.log"
  grep -h '^RESULT ' "$OUT/qa_control_s${S}.log" >> "$RESULTS" || true
done

echo "== STAGE 4: paired gate =="
python3 runs/analyze_forage_qa.py "$RESULTS" | tee "$OUT/VERDICT.txt"
echo "artifacts: $OUT"
