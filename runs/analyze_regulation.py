#!/usr/bin/env python3
# Analyze the metabolism regulation gate RESULT lines against the PRE-REGISTERED bars
# (docs/receipts/metabolism_regulation_gate.md). No post-hoc retuning: constants are hard-coded from the reg.
import sys, re, random, statistics

random.seed(20260711)  # fixed for reproducibility

# --- pinned constants (from the pre-registration; do NOT retune) ---
EFFECT = 0.10        # median-over-seeds D >= 0.10
NMIN = 6             # >= 6 paired seeds
BOOT = 10000         # bootstrap resamples
SETPOINT = 0.625

def parse(path):
    rows = []
    for line in open(path, encoding="utf-8", errors="replace"):
        # eat may be empty (\d*) when the agent died before a non-nil sample; the fixed launcher reports peak eat,
        # but round-T lines already collected before the fix can carry an empty eat — tolerate + treat as 0.
        m = re.search(r'RESULT arm=(\w+) seed=(\d+) mad=([\d.]+|None) inband=([\d.]+) eat=(\d*) survived=(\w+) c_ok=(\w+)', line)
        if m:
            arm, seed, mad, inband, eat, surv, cok = m.groups()
            rows.append(dict(arm=arm, seed=int(seed),
                             mad=(None if mad=="None" else float(mad)),
                             inband=float(inband), eat=(int(eat) if eat else 0),
                             survived=(surv=="true"), c_ok=(cok=="true")))
    return rows

def main(path):
    rows = parse(path)
    print(f"parsed {len(rows)} RESULT lines")
    for r in sorted(rows, key=lambda r:(r['arm'],r['seed'])):
        print(f"  arm={r['arm']:9} seed={r['seed']} mad={r['mad']} eat={r['eat']} survived={r['survived']} c_ok={r['c_ok']}")

    T = {r['seed']: r for r in rows if r['arm']=='setpoint'}
    C = {r['seed']: r for r in rows if r['arm']=='saturable'}

    # --- VOID checks (blocking) ---
    void = []
    for r in rows:
        if not r['c_ok']:
            void.append(f"C-LEAK: arm={r['arm']} seed={r['seed']} live C deviated from registered map (phase-advance leak fired)")
    c_eats = [r['eat'] for r in C.values()]
    if c_eats and statistics.mean(c_eats) <= 0:
        void.append(f"ATTRIBUTION-VOID: ARM C mean eat = {statistics.mean(c_eats)} <= 0 (degenerated to vacuous drive-severed)")

    # --- paired D per seed ---
    seeds = sorted(set(T) & set(C))
    D = []
    for s in seeds:
        if T[s]['mad'] is None or C[s]['mad'] is None:
            void.append(f"MISSING-MAD: seed={s} (agent never scored)"); continue
        d = C[s]['mad'] - T[s]['mad']   # D = MAD(control) - MAD(treatment); D>0 => treatment tighter
        D.append(d)
        print(f"  seed {s}: MAD(T setpoint)={T[s]['mad']:.4f}  MAD(C saturable)={C[s]['mad']:.4f}  D={d:+.4f}")

    print(f"\n== attribution ==  ARM C mean eat = {statistics.mean(c_eats) if c_eats else 'n/a'}  (must be > 0)")
    print(f"== survival floor ==  T={statistics.mean([r['survived'] for r in T.values()]):.2f}  C={statistics.mean([r['survived'] for r in C.values()]):.2f}  (T >= C required)")

    if void:
        print("\n==== VERDICT: VOID (re-run) ====")
        for v in void: print("  -", v)
        return

    if len(D) < NMIN:
        print(f"\n==== VERDICT: INCOMPLETE ==== only {len(D)} paired seeds (< {NMIN})"); return

    med = statistics.median(D)
    # paired bootstrap CI on mean D, seed as the resampled unit
    means = []
    for _ in range(BOOT):
        samp = [random.choice(D) for _ in D]
        means.append(sum(samp)/len(samp))
    means.sort()
    lo = means[int(0.025*BOOT)]; hi = means[int(0.975*BOOT)]
    surv_floor = statistics.mean([r['survived'] for r in T.values()]) >= statistics.mean([r['survived'] for r in C.values()])
    attribution = statistics.mean(c_eats) > 0

    print(f"\n== stats ==  N={len(D)} paired seeds")
    print(f"  median D = {med:+.4f}   (PASS needs >= {EFFECT})")
    print(f"  mean D 95% bootstrap CI = [{lo:+.4f}, {hi:+.4f}]   (PASS needs lower > 0)")
    print(f"  survival floor (T>=C): {surv_floor}   attribution (C eats): {attribution}")

    c1 = med >= EFFECT
    c2 = lo > 0
    verdict = "PASS" if (c1 and c2 and surv_floor and attribution) else "FALSIFIES"
    if not (c2) or (not c1):
        verdict = "FALSIFIES"  # CI includes 0 OR median < 0.10
    print(f"\n==== REGULATION GATE VERDICT: {verdict} ====")
    print(f"  median D>=0.10: {c1} | CI-excludes-0: {c2} | survival-floor: {surv_floor} | attribution: {attribution}")
    print(f"  Fence: setpoint-regulation BEHAVIOUR only; never experience. NOT G4 (separate FAIL). NOT G6.")

if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "results.txt")
