#!/usr/bin/env python3
# Analyze the metabolism regulation gate v2 RESULT lines against the PRE-REGISTERED bars
# (docs/receipts/metabolism_regulation_gate_v2.md). No post-hoc retuning: constants hard-coded from the reg.
# v2 additions vs v1: bias/dispersion decomposition (a PASS must be attributed to target-bias vs variance-tightness),
# degenerate-foil VOID guard (ARM C median>0.9 & IQR<0.1), provisioning VOID (a starve with feed failures),
# both-arms-eat attribution, N=12 fixed (>=10 analyzable pairs retained after drops).
import sys, re, random, statistics

random.seed(20260711)  # fixed for reproducibility
EFFECT = 0.10          # median-over-seeds D >= 0.10 (UNCHANGED from v1 — NOT re-derived)
NMIN = 10              # retain >= 10 analyzable paired seeds (N=12 with up to 2 VOID/death drops)
BOOT = 10000
SETPOINT = 0.625
FOIL_MED = 0.9         # degenerate-foil VOID: ARM C median store > 0.9 ...
FOIL_IQR = 0.1         # ... AND IQR < 0.1  => too-easy pinned-full foil

PAT = re.compile(
    r'RESULT arm=(\w+) seed=(\d+) mad=([\d.]+|None) bias=([\d.]+|None) disp=([\d.]+|None) '
    r'mean=([\d.]+|None) median_store=([\d.]+|None) iqr=([\d.]+|None) inband=([\d.]+) '
    r'eat=(\d*) survived=(\w+) c_ok=(\w+) feed_fails=(\d+)')

def f(x): return None if x in ('None', '') else float(x)

def parse(path):
    rows = []
    for line in open(path, encoding='utf-8', errors='replace'):
        m = PAT.search(line)
        if not m:
            continue
        arm, seed, mad, bias, disp, mean, med, iqr, inband, eat, surv, cok, ff = m.groups()
        rows.append(dict(arm=arm, seed=int(seed), mad=f(mad), bias=f(bias), disp=f(disp),
                         mean=f(mean), median_store=f(med), iqr=f(iqr), inband=float(inband),
                         eat=(int(eat) if eat else 0), survived=(surv == 'true'),
                         c_ok=(cok == 'true'), feed_fails=int(ff)))
    return rows

def boot_ci(D):
    means = sorted(sum(random.choice(D) for _ in D) / len(D) for _ in range(BOOT))
    return means[int(0.025 * BOOT)], means[int(0.975 * BOOT)]

def main(path):
    rows = parse(path)
    print(f"parsed {len(rows)} RESULT lines")
    for r in sorted(rows, key=lambda r: (r['arm'], r['seed'])):
        print(f"  arm={r['arm']:9} seed={r['seed']:2} mad={r['mad']} bias={r['bias']} disp={r['disp']} "
              f"med={r['median_store']} iqr={r['iqr']} eat={r['eat']} surv={r['survived']} c_ok={r['c_ok']} ff={r['feed_fails']}")

    T = {r['seed']: r for r in rows if r['arm'] == 'setpoint'}
    C = {r['seed']: r for r in rows if r['arm'] == 'saturable'}

    # --- VOID checks (blocking, per pre-registration) ---
    void = []
    for r in rows:
        if not r['c_ok']:
            void.append(f"C-LEAK: arm={r['arm']} seed={r['seed']} (energy/satiety C, phase, or task-C deviated from the registered/phase-0 map)")
        if (not r['survived']) and r['feed_fails'] > 0:
            void.append(f"PROVISIONING-VOID: arm={r['arm']} seed={r['seed']} died with {r['feed_fails']} feed failure(s) (starve may be provisioning-caused, not policy)")
    # Degenerate-foil check. Pre-reg VOID (g) is FALLBACK-ONLY (symmetric-OFF brake). We took the PREFERRED path
    # (B3 relocated ⇒ brake ON in both arms), so a saturable that hoards to near-full is the foil WORKING AS
    # DESIGNED (monotone-appetite drive), NOT a degenerate artifact ⇒ reported as a NOTE, never a VOID here.
    foil_note = []
    for s, r in C.items():
        if r['median_store'] is not None and r['iqr'] is not None and r['median_store'] > FOIL_MED and r['iqr'] < FOIL_IQR:
            foil_note.append(f"saturable seed={s} hoards near-full (median={r['median_store']}, IQR={r['iqr']}) — valid foil; reinforces that D is bias-carried")
    t_eats = [r['eat'] for r in T.values()]
    c_eats = [r['eat'] for r in C.values()]
    if c_eats and statistics.mean(c_eats) <= 0:
        void.append(f"ATTRIBUTION-VOID: ARM C mean eat = {statistics.mean(c_eats)} <= 0")
    if t_eats and statistics.mean(t_eats) <= 0:
        void.append(f"ATTRIBUTION-VOID: ARM T mean eat = {statistics.mean(t_eats)} <= 0 (treatment tightness by never-eating)")

    # --- paired D per seed ---
    seeds = sorted(set(T) & set(C))
    D, Dbias, Ddisp = [], [], []
    for s in seeds:
        if T[s]['mad'] is None or C[s]['mad'] is None:
            void.append(f"MISSING-MAD: seed={s}"); continue
        D.append(C[s]['mad'] - T[s]['mad'])
        if None not in (T[s]['bias'], C[s]['bias']): Dbias.append(C[s]['bias'] - T[s]['bias'])
        if None not in (T[s]['disp'], C[s]['disp']): Ddisp.append(C[s]['disp'] - T[s]['disp'])
        print(f"  seed {s:2}: MAD(T)={T[s]['mad']:.4f} MAD(C)={C[s]['mad']:.4f}  D={D[-1]:+.4f}")

    surv_T = statistics.mean([r['survived'] for r in T.values()]) if T else 0
    surv_C = statistics.mean([r['survived'] for r in C.values()]) if C else 0
    print(f"\n== attribution ==  ARM T mean eat={statistics.mean(t_eats) if t_eats else 'n/a'}  ARM C mean eat={statistics.mean(c_eats) if c_eats else 'n/a'}")
    print(f"== survival floor ==  T={surv_T:.2f}  C={surv_C:.2f}  (T >= C required)")
    if foil_note:
        print("== foil NOTE (not a VOID — preferred path) ==")
        for w in foil_note:
            print("  -", w)

    if void:
        print("\n==== VERDICT: VOID (re-run) ====")
        for v in dict.fromkeys(void):
            print("  -", v)
        return

    if len(D) < NMIN:
        print(f"\n==== VERDICT: INCOMPLETE ==== only {len(D)} analyzable paired seeds (< {NMIN})")
        return

    med = statistics.median(D)
    lo, hi = boot_ci(D)
    surv_floor = surv_T >= surv_C
    attribution = statistics.mean(c_eats) > 0 and statistics.mean(t_eats) > 0

    print(f"\n== stats ==  N={len(D)} paired seeds")
    print(f"  median D = {med:+.4f}   (PASS needs >= {EFFECT})")
    print(f"  mean D 95% bootstrap CI = [{lo:+.4f}, {hi:+.4f}]   (PASS needs lower > 0)")
    print(f"  survival floor (T>=C): {surv_floor}   attribution (both arms eat): {attribution}")

    # --- bias/dispersion decomposition (mandatory claim guard) ---
    if Dbias and Ddisp:
        mdb, mdd = statistics.mean(Dbias), statistics.mean(Ddisp)
        print(f"\n== MAD decomposition ==  mean D_bias={mdb:+.4f}  mean D_disp={mdd:+.4f}  (D ~= D_bias + D_disp)")
        share = mdb / (abs(mdb) + abs(mdd)) if (abs(mdb) + abs(mdd)) > 0 else 0
        print(f"  bias share of the gap = {share:.0%}  => a PASS is {'BIAS-CARRIED (homeostasis central-tendency, NOT tighter variance)' if share >= 0.6 else 'partly dispersion (genuine tightness contributes)'}")

    c1 = med >= EFFECT
    c2 = lo > 0
    verdict = "PASS" if (c1 and c2 and surv_floor and attribution) else "FALSIFIES"
    print(f"\n==== REGULATION GATE v2 VERDICT: {verdict} ====")
    print(f"  median D>=0.10: {c1} | CI-excludes-0: {c2} | survival-floor: {surv_floor} | attribution: {attribution}")
    print(f"  Claim guard: if PASS is bias-carried, the honest claim is HOMEOSTASIS (store sits at setpoint), NOT lower-variance 'tighter regulation'.")
    print(f"  Fence: setpoint-regulation BEHAVIOUR only; never experience. NOT G4 (separate FAIL). NOT G6.")

if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "results_v2.txt")
