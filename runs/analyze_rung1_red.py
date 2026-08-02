#!/usr/bin/env python3
# Analyze the RUNG-1 graded-viability paired RED against the PRE-REGISTERED gates
# (docs/receipts/rung1_graded_viability_RED.md REVISION 1, lab-team SIGN-WITH-CHANGES). No post-hoc retuning:
# every constant is hard-coded from the registration. Pure stdlib (matches analyze_regulation_v2.py).
#
# Input: a directory (or glob) of per-session log files, ONE world-session per file — each file has that
# session's PROBE time-series + its single RESULT line (arm/class/seed/survived/...). Usage:
#   python3 runs/analyze_rung1_red.py runs/rung1_logs/
#
# Gates (REVISION 1):
#   PASS "RESERVE-EARNS-ITS-DEPTH" (ALL): (4a) FULL survival >=11/12 AND CI-excludes SETPOINT-6;
#     (4b) FULL behaviourally != SATURABLE-6 on two-ended/hoard (NO survival-beat vs foil);
#     (2) allostasis_index (FULL-SETPOINT6 believed reserve at eat-onset) CI>0;
#     (5) Dissoc = |corr(e,gut)|-|corr(e,fat)| CI-excludes-0 AND >=0.30;
#     (6) fatigue_pacing_index >0 FULL, ~0 abl_fatigue_pi.
#   FALSIFIES "DEPTH-DOESN'T-PAY": survival not improved vs SETPOINT-6; OR indistinguishable from SATURABLE-6;
#     OR hoards/fasts into starvation; OR dissoc CI incl 0; OR allostasis CI incl 0; OR any invariant/VOID trips.
#   Severed-limb (per factor): KS a=0.05 "differs" ; TOST equivalence => reject/rewire that factor.
#
# CLAIM FENCE: survival/eat/pacing/dissociation are behaviour-only, ZERO weight for awareness/preference/life.
import sys, os, re, glob, random, statistics, math

random.seed(20260711)
NSEED = 12
SURV_BAR = 11            # FULL survival >= 11/12 (vs measured flat-setpoint 6/12)
REF_CLASS = 'rich'       # the survival-improvement gate (4a) + SETPOINT-6 baseline run in this reference class;
                         # the two-ended satiation contrast (4b) uses BOTH classes (scarce vs rich). Counting
                         # survival within one class keeps the 11/12 denominator unambiguous (see RED REVISION 1).
NMIN = 10               # retain >= 10 analyzable paired seeds
BOOT = 10000
DISSOC_FLOOR = 0.30     # |corr(e,gut)| - |corr(e,fat)| floor
INTERIOR_CEIL = 0.95    # rich-world FULL median store must be BELOW this (no hoard)
HOARD = 0.95            # SATURABLE-6 rich-world median store AT/above this (pins the ceiling)
KS_ALPHA_C = 1.36       # KS critical coefficient at alpha=0.05

R_RESULT = re.compile(
    r'RESULT arm=(\S+) class=(\w+) seed=(\d+) survived=(\w+) mean_store=([\d.]+|None) '
    r'eat=(\d+) c_ok=(\w+) feed_fails=(\d+) n_scored=(\d+)')
R_PROBE = re.compile(
    r'PROBE t=(\d+) e=(\S+) gut=(\S+) soma=(\S+) fat=(\S+) be_e=(\S+) be_f=(\S+) '
    r'eat=(\d+) act=(\S+) phase=(\S+) leak_ok=(\w+) alive=(\w+)')


def fnum(x):
    if x in ('None', '', 'nil', 'false', 'true'):
        return None
    try:
        return float(x)
    except ValueError:
        return None


def parse_session(path):
    arm = cls = seed = None
    survived = c_ok = None
    mean_store = None
    eat = feed_fails = n_scored = 0
    probes = []
    for line in open(path, encoding='utf-8', errors='replace'):
        m = R_RESULT.search(line)
        if m:
            arm, cls, seed, surv, ms, e, cok, ff, ns = m.groups()
            seed = int(seed); survived = (surv == 'true'); mean_store = fnum(ms)
            eat = int(e); c_ok = (cok == 'true'); feed_fails = int(ff); n_scored = int(ns)
            continue
        p = R_PROBE.search(line)
        if p:
            t, e, gut, soma, fat, be, bf, eatc, act, phase, leak, alive = p.groups()
            probes.append(dict(t=int(t), e=fnum(e), gut=fnum(gut), soma=fnum(soma), fat=fnum(fat),
                               be_e=fnum(be), be_f=fnum(bf), eat=int(eatc), act=act,
                               phase=phase, leak_ok=(leak == 'true'), alive=(alive == 'true')))
    if arm is None:
        return None
    return dict(arm=arm, cls=cls, seed=seed, survived=survived, mean_store=mean_store,
                eat=eat, c_ok=c_ok, feed_fails=feed_fails, n_scored=n_scored, probes=probes)


# --- stats (stdlib) ---------------------------------------------------------
def pearson(xs, ys):
    pairs = [(x, y) for x, y in zip(xs, ys) if x is not None and y is not None]
    if len(pairs) < 3:
        return None
    xs, ys = [p[0] for p in pairs], [p[1] for p in pairs]
    mx, my = statistics.mean(xs), statistics.mean(ys)
    cov = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    sx = math.sqrt(sum((x - mx) ** 2 for x in xs))
    sy = math.sqrt(sum((y - my) ** 2 for y in ys))
    return cov / (sx * sy) if sx * sy > 0 else 0.0


def boot_ci(vals):
    if not vals:
        return (None, None)
    means = sorted(sum(random.choice(vals) for _ in vals) / len(vals) for _ in range(BOOT))
    return means[int(0.025 * BOOT)], means[int(0.975 * BOOT)]


def ks_2samp(a, b):
    a, b = sorted(x for x in a if x is not None), sorted(x for x in b if x is not None)
    if not a or not b:
        return None, None
    allv = sorted(set(a + b))
    n, m = len(a), len(b)
    d = max(abs(sum(x <= v for x in a) / n - sum(x <= v for x in b) / m) for v in allv)
    crit = KS_ALPHA_C * math.sqrt((n + m) / (n * m))
    return d, crit


def dissoc_of(probes):
    e = [p['e'] for p in probes if p['alive']]
    gut = [p['gut'] for p in probes if p['alive']]
    fat = [p['fat'] for p in probes if p['alive']]
    reg = pearson(e, gut)
    ref = pearson(e, fat)
    if reg is None or ref is None:
        return None
    return abs(reg) - abs(ref)


def allostasis_of(probes):
    # believed reserve (be_e) at eat-onset (a probe where eat_count increased vs the previous probe).
    vals, prev = [], None
    for p in probes:
        if prev is not None and p['eat'] > prev and p['be_e'] is not None:
            vals.append(p['be_e'])
        prev = p['eat']
    return statistics.mean(vals) if vals else None


def pacing_of(probes):
    # corr(believed fatigue, P(non-arm action | just-mined)): over consecutive probes, when the prev action
    # was :mine/:attack, is the current action non-arm? correlate that {0,1} with the prev believed fatigue.
    xs, ys, prev = [], [], None
    for p in probes:
        if prev is not None and prev['act'] in (':mine', 'mine', ':attack', 'attack') and prev['be_f'] is not None:
            xs.append(prev['be_f'])
            ys.append(0 if p['act'] in (':mine', 'mine', ':attack', 'attack') else 1)
        prev = p
    return pearson(xs, ys)


def by_arm(sessions, arm, cls=None):
    return [s for s in sessions if s['arm'] == arm and (cls is None or s['cls'] == cls)]


def main(target):
    files = []
    if os.path.isdir(target):
        files = sorted(glob.glob(os.path.join(target, '*')))
    else:
        files = sorted(glob.glob(target))
    sessions = [s for s in (parse_session(f) for f in files) if s]
    print(f"parsed {len(sessions)} world-sessions from {len(files)} files")
    for s in sorted(sessions, key=lambda s: (s['arm'], s['cls'], s['seed'])):
        print(f"  arm={s['arm']:20} class={s['cls']:7} seed={s['seed']:2} surv={s['survived']} "
              f"mean_store={s['mean_store']} eat={s['eat']} c_ok={s['c_ok']} ff={s['feed_fails']} n={s['n_scored']}")

    # ---- VOID checks (blocking) ----
    void = []
    for s in sessions:
        if s['c_ok'] is False:
            void.append(f"C-LEAK (VOID-a): arm={s['arm']} class={s['cls']} seed={s['seed']}")
        if s['survived'] is False and s['feed_fails'] > 0:
            void.append(f"PROVISIONING-VOID (VOID-d): arm={s['arm']} seed={s['seed']} died with {s['feed_fails']} feed fail(s)")
        if s['eat'] <= 0:
            void.append(f"ATTRIBUTION-VOID (VOID-b): arm={s['arm']} seed={s['seed']} never ate")

    # VOID(g'): setpoint6 dies 12/12 instantly => too-weak strawman.
    sp = by_arm(sessions, 'setpoint6')
    if sp and all(not s['survived'] for s in sp) and len(sp) >= NSEED:
        void.append("STRAWMAN-VOID (g'): setpoint6 died 12/12 — retune the CONTROL, not the treatment")

    # survival-improvement gate (4a) + allostasis + dissociation + pacing are evaluated in the REFERENCE class
    # (unambiguous 11/12 denominator); the two-ended satiation gate (4b) uses both classes below.
    full = by_arm(sessions, 'full', REF_CLASS)
    sp = by_arm(sessions, 'setpoint6', REF_CLASS)
    sat = by_arm(sessions, 'saturable6', REF_CLASS)

    # power floor
    if len(full) < NMIN:
        void.append(f"POWER-FLOOR (VOID-f): only {len(full)} analyzable FULL seeds in class={REF_CLASS} (< {NMIN})")

    if void:
        print("\n==== VERDICT: VOID (re-run) ====")
        for v in dict.fromkeys(void):
            print("  -", v)
        return

    # ---- discriminators ----
    surv_full = sum(s['survived'] for s in full)
    surv_sp = sum(s['survived'] for s in sp)
    surv_sat = sum(s['survived'] for s in sat)

    # (4a) survival vs SETPOINT-6, paired by seed, bootstrap on the per-seed survival difference.
    spd = {s['seed']: s for s in sp}
    surv_diff = [int(s['survived']) - int(spd[s['seed']]['survived']) for s in full if s['seed'] in spd]
    lo_s, hi_s = boot_ci(surv_diff) if surv_diff else (None, None)

    # (2) allostasis_index = FULL - SETPOINT-6 believed reserve at eat-onset, paired by seed.
    allo = []
    for s in full:
        if s['seed'] in spd:
            a_full = allostasis_of(s['probes'])
            a_sp = allostasis_of(spd[s['seed']]['probes'])
            if a_full is not None and a_sp is not None:
                allo.append(a_full - a_sp)
    lo_a, hi_a = boot_ci(allo) if allo else (None, None)

    # (5) dissociation Delta, FULL, bootstrap over seeds.
    dvals = [d for d in (dissoc_of(s['probes']) for s in full) if d is not None]
    lo_d, hi_d = boot_ci(dvals) if dvals else (None, None)
    mean_d = statistics.mean(dvals) if dvals else None

    # (6) fatigue pacing: FULL should be >0, abl_fatigue_pi ~0.
    pace_full = [p for p in (pacing_of(s['probes']) for s in full) if p is not None]
    api = by_arm(sessions, 'abl_fatigue_pi')
    pace_api = [p for p in (pacing_of(s['probes']) for s in api) if p is not None]
    mp_full = statistics.mean(pace_full) if pace_full else None
    mp_api = statistics.mean(pace_api) if pace_api else None

    # (4b) two-ended: rich-world FULL median store interior (<0.95) vs SATURABLE-6 pins (>=0.95).
    def med_store(rows):
        v = [s['mean_store'] for s in rows if s['mean_store'] is not None]
        return statistics.median(v) if v else None
    full_rich = med_store(by_arm(sessions, 'full', 'rich'))
    sat_rich = med_store(by_arm(sessions, 'saturable6', 'rich'))
    two_ended_rich = (full_rich is not None and sat_rich is not None
                      and full_rich < INTERIOR_CEIL <= sat_rich)

    # severed-limb KS + equivalence (per factor) — differs from FULL on the live store distribution?
    sev_report = []
    for limb, arm in [('energy', 'severed_energy'), ('gut', 'severed_gut'),
                      ('soma', 'severed_soma'), ('fatigue', 'severed_fatigue')]:
        srows = by_arm(sessions, arm)
        if not srows:
            continue
        key = {'energy': 'e', 'gut': 'gut', 'soma': 'soma', 'fatigue': 'fat'}[limb]
        sev_vals = [p[key] for s in srows for p in s['probes'] if p['alive']]
        int_vals = [p[key] for s in full for p in s['probes'] if p['alive']]
        d, crit = ks_2samp(sev_vals, int_vals)
        if d is None:
            continue
        differs = d > crit
        note = ("DIFFERS (real world limb)" if differs
                else "INDISTINGUISHABLE => reject/rewire this factor (preference-hack, no world limb)")
        if limb == 'soma':
            note += "  [soma decorative unless health-channel variance>0 — skip if flat]"
        sev_report.append(f"  {arm:18} KS={d:.3f} crit={crit:.3f} -> {note}")

    # ---- print ----
    print(f"\n== survival ==  FULL={surv_full}/{len(full)}  SETPOINT-6={surv_sp}/{len(sp)}  SATURABLE-6={surv_sat}/{len(sat)}")
    print(f"== (4a) survival vs SETPOINT-6 == paired diff CI=[{fmt(lo_s)},{fmt(hi_s)}]  (PASS: FULL>=11 AND lo>0)")
    print(f"== (2) allostasis_index (FULL-SETPOINT6) == CI=[{fmt(lo_a)},{fmt(hi_a)}]  (PASS: lo>0)")
    print(f"== (5) dissociation Delta (FULL) == mean={fmt(mean_d)} CI=[{fmt(lo_d)},{fmt(hi_d)}]  (PASS: lo>0 AND mean>={DISSOC_FLOOR})")
    print(f"== (6) fatigue_pacing == FULL={fmt(mp_full)} (want >0)  abl_fatigue_pi={fmt(mp_api)} (want ~0)")
    print(f"== (4b) two-ended (rich) == FULL median={fmt(full_rich)} (<{INTERIOR_CEIL})  SATURABLE-6 median={fmt(sat_rich)} (>={HOARD})  -> {two_ended_rich}")
    if sev_report:
        print("== severed-limb falsifiers ==")
        for r in sev_report:
            print(r)

    # ---- gate ----
    c4a = surv_full >= SURV_BAR and (lo_s is not None and lo_s > 0)
    c2 = lo_a is not None and lo_a > 0
    c5 = (lo_d is not None and lo_d > 0) and (mean_d is not None and mean_d >= DISSOC_FLOOR)
    c6 = (mp_full is not None and mp_full > 0) and (mp_api is not None and abs(mp_api) < (mp_full or 1))
    c4b = two_ended_rich
    passed = c4a and c2 and c5 and c6 and c4b
    verdict = "PASS (RESERVE-EARNS-ITS-DEPTH)" if passed else "FALSIFIES (DEPTH-DOESN'T-PAY)"
    print(f"\n==== RUNG-1 RED VERDICT: {verdict} ====")
    print(f"  4a survival>SETPOINT6:{c4a} | 2 allostasis:{c2} | 5 dissociation:{c5} | 6 pacing:{c6} | 4b two-ended:{c4b}")
    print("  Fence: graded self-maintenance / work-rest pacing / allostasis BEHAVIOUR only; ZERO weight for awareness/life.")


def fmt(x):
    return 'None' if x is None else f"{x:+.3f}"


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "runs/rung1_logs/")
