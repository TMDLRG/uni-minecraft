#!/usr/bin/env python3
# PAIRED FORAGE-QA GATE — scores runs/pureworld_qa.exs RESULT lines against the PRE-REGISTERED bars below. No
# post-hoc retuning: constants are fixed here, before the run. The gate answers ONE question: is this trained brain
# "trained + safe to enter the world"? A "trained" claim is only meaningful if the TRAINED arm passes AND beats the
# untrained CONTROL twin in the same pure world (else the world's free food, not training, carried it => VOID).
#
# PRE-REGISTERED GATE (per SEED; the deploy decision is the seed-majority):
#   PASS (trained is trained + safe) iff, for the TRAINED arm:
#     P1 survives the full soak (no starvation/soma death, pid-stable, no churn)
#     P2 energy_stable: post-warmup mean_energy in the reserve band AND min_energy > 0.12 (never near the death edge)
#     P3 forages: eat>0 AND refills>=REFILL_MIN_EVENTS AND food_seen>=1  (energy replenished by hunted meat)
#     P4 zero-give invariant intact: gives==0 AND summons==0 (food was world-earned, not fed)
#     P5 integrity: churn==False AND colony_ok==True AND c_ok==True (single continuous login; live C == registered)
#   AND the DISCRIMINATOR:
#     P6 trained BEATS control: control FALSIFIES on the same seed (control starves or shows zero refills)
#   VOID (re-run, world not discriminating) iff:
#     V1 any arm has gives>0 or summons>0 (a give leaked into a "pure" world => the whole gate is invalid)
#     V2 CONTROL also passes P1..P4 (natural food too easy => "trained" is unfalsifiable in this world) — unless
#        that is exactly the reported outcome we want to flag; reported as VOID so the world is made scarcer/cloned
#        from the real deployment world and re-run.
#   FALSIFIES otherwise (trained is NOT safe to deploy).
#
# CLAIM FENCE: PASS demonstrates survival-by-foraging BEHAVIOUR only. ZERO weight for awareness / hunger / life.
import sys, re, statistics

REFILL_MIN_EVENTS = 2      # >= this many post-warmup energy-refill jumps (each an eat-with-hunted-food)
BAND_LO = 0.5              # mean_energy reserve floor (matches pureworld_qa BAND_LO / reserve C argmax ~bin4)
MIN_FLOOR = 0.12           # min_energy must stay above this death margin
FOOD_MIN = 1              # >= this many probes with inv_food>0 (meat in hand from a kill)

PAT = re.compile(
    r'RESULT arm=(\w+) seed=(\d+) survived=(\w+) mean_energy=([\d.]+|None) min_energy=([\d.]+|None) '
    r'inband=([\d.]+) refills=(\d+) food_seen=(\d+) eat=(\d+) gives=(\d+) summons=(\d+) '
    r'churn=(\w+) colony_ok=(\w+) c_ok=(\w+) n_scored=(\d+)')

def f(x): return None if x in ('None', '') else float(x)
def b(x): return x == 'true' or x == 'True'

def parse(path):
    rows = []
    for line in open(path, encoding='utf-8', errors='replace'):
        m = PAT.search(line)
        if not m:
            continue
        (arm, seed, surv, me, mn, inb, rf, fs, eat, gv, sm, ch, col, cok, n) = m.groups()
        rows.append(dict(arm=arm, seed=int(seed), survived=b(surv), mean_energy=f(me), min_energy=f(mn),
                         inband=float(inb), refills=int(rf), food_seen=int(fs), eat=int(eat),
                         gives=int(gv), summons=int(sm), churn=b(ch), colony_ok=b(col), c_ok=b(cok),
                         n_scored=int(n)))
    return rows

def core_pass(r):
    # P1..P5 (a single arm's own competence — the same 5 checks pureworld_qa.exs prints)
    p1 = r['survived'] and not r['churn']
    p2 = r['mean_energy'] is not None and r['mean_energy'] >= BAND_LO and (r['min_energy'] or 0.0) > MIN_FLOOR
    p3 = r['eat'] > 0 and r['refills'] >= REFILL_MIN_EVENTS and r['food_seen'] >= FOOD_MIN
    p4 = r['gives'] == 0 and r['summons'] == 0
    p5 = (not r['churn']) and r['colony_ok'] and r['c_ok']
    return dict(p1=p1, p2=p2, p3=p3, p4=p4, p5=p5, ok=(p1 and p2 and p3 and p4 and p5))

def main(path):
    rows = parse(path)
    print(f"parsed {len(rows)} RESULT lines")
    for r in sorted(rows, key=lambda r: (r['arm'], r['seed'])):
        c = core_pass(r)
        print(f"  arm={r['arm']:8} seed={r['seed']:2} surv={r['survived']} mean_e={r['mean_energy']} min_e={r['min_energy']} "
              f"refills={r['refills']} food={r['food_seen']} eat={r['eat']} gives={r['gives']} summons={r['summons']} "
              f"churn={r['churn']} colony_ok={r['colony_ok']} c_ok={r['c_ok']}  core={c['ok']}")

    T = {r['seed']: r for r in rows if r['arm'] == 'trained'}
    C = {r['seed']: r for r in rows if r['arm'] == 'control'}

    # --- VOID checks (blocking, per pre-registration) ---
    void = []
    for r in rows:
        if r['gives'] > 0 or r['summons'] > 0:
            void.append(f"GIVE-LEAK V1: arm={r['arm']} seed={r['seed']} gives={r['gives']} summons={r['summons']} "
                        f"(a mutating RCON reached a 'pure' world — gate invalid)")

    seeds = sorted(set(T) & set(C))
    if not seeds:
        print("\n==== VERDICT: INCOMPLETE ==== need paired trained+control RESULT lines on matching seeds")
        return

    per_seed = []
    for s in seeds:
        t, c = core_pass(T[s]), core_pass(C[s])
        beats = t['ok'] and not c['ok']           # P6: trained passes, control fails (the discriminator)
        if t['ok'] and c['ok']:
            void.append(f"WORLD-TOO-EASY V2: seed={s} CONTROL (untrained) also passes — natural food is trivial; "
                        f"clone the real deployment world / make prey scarcer and re-run")
        per_seed.append(dict(seed=s, trained=t, control=c, beats=beats))
        print(f"\n  seed {s}: TRAINED core={t['ok']} (P1={t['p1']} P2={t['p2']} P3={t['p3']} P4={t['p4']} P5={t['p5']})  "
              f"CONTROL core={c['ok']}  trained-beats-control={beats}")

    if void:
        print("\n==== VERDICT: VOID (re-run) ====")
        for v in dict.fromkeys(void):
            print("  -", v)
        return

    trained_pass = statistics.mean([1 if p['trained']['ok'] else 0 for p in per_seed])
    beats_frac = statistics.mean([1 if p['beats'] else 0 for p in per_seed])
    control_pass = statistics.mean([1 if p['control']['ok'] else 0 for p in per_seed])

    print(f"\n== summary ==  N={len(per_seed)} paired seeds")
    print(f"  trained core-PASS fraction   = {trained_pass:.2f}  (need 1.00 - every seed)")
    print(f"  trained-beats-control (P6)   = {beats_frac:.2f}  (need 1.00 - every seed discriminates)")
    print(f"  control core-PASS fraction   = {control_pass:.2f}  (expect 0.00 - the untrained twin starves)")

    passed = trained_pass >= 1.0 and beats_frac >= 1.0
    verdict = "PASS - TRAINED + SAFE TO ENTER THE WORLD" if passed else "FALSIFIES - NOT SAFE TO DEPLOY"
    print(f"\n==== PURE-WORLD FORAGE-QA VERDICT: {verdict} ====")
    print(f"  Deploy iff PASS: trained survives by hunted-meat foraging on EVERY seed AND the untrained twin does not.")
    print(f"  Fence: this certifies survival-by-foraging BEHAVIOUR only - necessary-not-sufficient, ZERO weight for "
          f"awareness / hunger-as-experience / life.")

if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "forage_qa_results.txt")
