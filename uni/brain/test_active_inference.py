"""
Self-test proving the active-inference engine implements the correct math.

Run:  python uni/brain/test_active_inference.py

It checks the four properties that define an active-inference agent:
  1. PERCEPTION  — observing concentrates the posterior on the true state and lowers
                   variational free energy.
  2. PRAGMATIC   — with informative senses, it chooses the action leading to its
                   PREFERRED observation.
  3. EPISTEMIC   — with NO preference difference, it still chooses the action with the
                   greater expected INFORMATION GAIN (curiosity, formalised).
  4. LEARNING    — its generative model (A) converges to the true contingencies via
                   Dirichlet counts, with no reward anywhere.
"""

import os
import sys
import tempfile

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
from active_inference import ActiveInference  # noqa: E402


def test_perception():
    A = [np.array([[0.9, 0.1], [0.1, 0.9]])]      # state 0 -> obs 0, state 1 -> obs 1
    B = np.stack([np.eye(2)], axis=2)             # one action: stay
    agent = ActiveInference(A=A, B=B, C=[np.zeros(2)], D=np.array([0.5, 0.5]))

    f_before = agent.variational_free_energy([0])
    qs = agent.infer_states([0])
    f_after = agent.variational_free_energy([0])

    assert qs[0] > 0.85, f"expected belief in state 0, got {qs}"
    assert f_after <= f_before + 1e-9, "observing should not increase free energy"
    return f"posterior after obs=0 -> {qs.round(3)}, F {f_before:.3f} -> {f_after:.3f}"


def test_pragmatic():
    A = [np.array([[0.95, 0.05], [0.05, 0.95]])]
    B = np.zeros((2, 2, 2))
    B[:, :, 0] = np.eye(2)                        # action 0: stay
    B[:, :, 1] = np.array([[0.0, 0.0], [1.0, 1.0]])  # action 1: move to state 1
    C = [np.array([0.0, 4.0])]                    # PREFER observation 1
    agent = ActiveInference(A=A, B=B, C=C, D=np.array([0.5, 0.5]), horizon=1, gamma=8.0)

    agent.infer_states([0])                       # currently in state 0 (obs 0)
    ev = agent.evaluate_policies()
    action = agent.act(mode="argmax")

    assert action == 1, f"should move toward preferred obs, chose {action}"
    assert ev["pragmatic"][1] > ev["pragmatic"][0], "policy 1 must have higher utility"
    return (f"pragmatic value stay={ev['pragmatic'][0]:.2f} move={ev['pragmatic'][1]:.2f}"
            f" -> chose action {action}")


def test_epistemic():
    # 3 states: s0 (start), s1, s2. Senses are precise for s1/s2, ambiguous for s0.
    A = [np.array([[0.5, 1.0, 0.0],
                   [0.5, 0.0, 1.0]])]
    B = np.zeros((3, 3, 2))
    # action 0 from s0 -> uncertain {s1,s2}  (the agent ANTICIPATES learning a lot)
    B[:, 0, 0] = [0.0, 0.5, 0.5]
    B[:, 1, 0] = [0.0, 1.0, 0.0]
    B[:, 2, 0] = [0.0, 0.0, 1.0]
    # action 1 from s0 -> confidently s1     (nothing new to learn)
    B[:, 0, 1] = [0.0, 1.0, 0.0]
    B[:, 1, 1] = [0.0, 1.0, 0.0]
    B[:, 2, 1] = [0.0, 0.0, 1.0]
    C = [np.zeros(2)]                             # NO preference -> pragmatic is equal
    agent = ActiveInference(A=A, B=B, C=C, D=np.array([1.0, 0.0, 0.0]), horizon=1, gamma=8.0)
    agent.qs = np.array([1.0, 0.0, 0.0])          # start certainly in s0

    ev = agent.evaluate_policies()
    action = agent.act(mode="argmax")

    assert abs(ev["pragmatic"][0] - ev["pragmatic"][1]) < 1e-9, "pragmatic must be equal"
    assert ev["epistemic"][0] > ev["epistemic"][1], "action 0 must promise more info"
    assert action == 0, f"curiosity should pick the informative action, chose {action}"
    return (f"epistemic value a0={ev['epistemic'][0]:.3f} a1={ev['epistemic'][1]:.3f}"
            f" (pragmatic equal) -> chose action {action}")


def test_learning():
    A = [np.array([[0.5, 0.5], [0.5, 0.5]])]      # starts knowing NOTHING about senses
    B = np.stack([np.eye(2)], axis=2)
    agent = ActiveInference(A=A, B=B, C=[np.zeros(2)], D=np.array([0.5, 0.5]),
                            learn_A=True, lr=1.0)
    for _ in range(60):
        agent.qs = np.array([1.0, 0.0]); agent.learn([0])   # state 0 emits obs 0
        agent.qs = np.array([0.0, 1.0]); agent.learn([1])   # state 1 emits obs 1

    learned = agent.A[0]
    assert learned[0, 0] > 0.9 and learned[1, 1] > 0.9, f"A failed to converge:\n{learned}"
    return f"learned likelihood A=\n{learned.round(3)}"


def test_memory_roundtrip():
    A = [np.array([[0.8, 0.2], [0.2, 0.8]])]
    B = np.stack([np.eye(2)], axis=2)
    agent = ActiveInference(A=A, B=B, C=[np.zeros(2)], D=np.array([0.5, 0.5]))
    for _ in range(10):
        agent.qs = np.array([1.0, 0.0]); agent.learn([0])
    before = agent.A[0].copy()
    with tempfile.TemporaryDirectory() as d:
        path = os.path.join(d, "memory.npz")
        agent.save(path)
        revived = ActiveInference(A=[np.eye(2)], B=B, C=[np.zeros(2)], D=np.array([0.5, 0.5]))
        revived.load(path)
    assert np.allclose(revived.A[0], before), "memory did not survive save/load"
    return "model reloaded identically after save/load (survives death)"


def main():
    tests = [
        ("1 PERCEPTION (free-energy min)", test_perception),
        ("2 PRAGMATIC  (reach preference)", test_pragmatic),
        ("3 EPISTEMIC  (curiosity/info gain)", test_epistemic),
        ("4 LEARNING   (Dirichlet, no reward)", test_learning),
        ("5 MEMORY     (survive death)", test_memory_roundtrip),
    ]
    ok = 0
    for name, fn in tests:
        try:
            detail = fn()
            print(f"  PASS  {name}\n        {detail}")
            ok += 1
        except AssertionError as e:
            print(f"  FAIL  {name}\n        {e}")
    print(f"\n{ok}/{len(tests)} active-inference properties verified.")
    return 0 if ok == len(tests) else 1


if __name__ == "__main__":
    raise SystemExit(main())
