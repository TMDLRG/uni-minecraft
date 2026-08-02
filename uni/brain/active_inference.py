"""
Active inference (the Free Energy Principle) — discrete, exact, NO reinforcement learning.

A from-first-principles implementation of discrete active inference for a partially
observable setting: one hidden-state factor, one or more observation modalities, and a
set of controllable transitions. There is NO reward signal and NO value function.

The agent:
  * PERCEIVES by minimising variational free energy (exact Bayesian state estimation),
  * ACTS by minimising EXPECTED free energy over policies, which decomposes into
        - pragmatic value : expected log-preference   (reach preferred observations)
        - epistemic value : expected information gain  (resolve uncertainty == curiosity)
  * LEARNS its own generative model (the A and B tensors) online via Dirichlet counts,
  * REMEMBERS by saving/loading that model, so it survives "death" and keeps learning.

Notation (after Da Costa et al. 2020; Friston et al.):
  s   : hidden state    (Ns values)
  o   : observation     (No_m values for modality m)
  u   : control/action  (Nu values)
  A_m : No_m x Ns       likelihood   P(o_m | s)   (columns sum to 1)
  B   : Ns x Ns x Nu    transitions  P(s' | s, u) (columns sum to 1)
  C_m : No_m            log-preferences over observations (utility; unnormalised ok)
  D   : Ns              prior over the initial hidden state
  gamma : policy precision (inverse temperature on expected free energy)

Everything here is pure NumPy and runs on a CPU. This is the *engine*; a separate body
(a mineflayer client) supplies real Minecraft observations and executes its actions.
"""

from __future__ import annotations

import itertools
from dataclasses import dataclass, field

import numpy as np

EPS = 1e-16

# --- dynamic precision (attention) — mirror of lib/sp/brain/precision.ex --------
# Sensory precision gamma_m tracks per-modality reliability (inverse surprise);
# policy precision gamma tracks confidence (q0-weighted variance of -G). Bounded,
# deterministic. Defaults leave the validated Model path byte-identical (gamma_m=1).
RHO = 0.5            # damping on the sensory precision tracker
KAPPA = 2.0          # sensory precision scale (target = KAPPA / (surprise + EPS0))
EPS0 = 1.0           # softens the inverse so surprise=0 ⇒ target=KAPPA
G_MIN, G_MAX = 0.1, 4.0          # sensory precision bounds
GAMMA_MIN_POL, GAMMA_MAX_POL = 1.0, 16.0  # policy precision bounds
SALIENCE_SIGN = "inverse"        # "inverse" (trust predictable) | "direct" (chase surprise)


# --- information-theory / simplex helpers -----------------------------------------

def _norm_cols(x: np.ndarray) -> np.ndarray:
    """Normalise a matrix so each column is a probability distribution."""
    x = np.asarray(x, dtype=float)
    return x / np.clip(x.sum(axis=0, keepdims=True), EPS, None)


def _log(x: np.ndarray) -> np.ndarray:
    return np.log(np.asarray(x, dtype=float) + EPS)


def _softmax(x: np.ndarray) -> np.ndarray:
    x = np.asarray(x, dtype=float)
    z = x - x.max()
    e = np.exp(z)
    return e / np.clip(e.sum(), EPS, None)


def _entropy(p: np.ndarray) -> float:
    """Shannon entropy H(p) = -sum p log p (nats)."""
    p = np.asarray(p, dtype=float)
    return float(-(p * _log(p)).sum())


def _column_entropies(A: np.ndarray) -> np.ndarray:
    """Per-state ambiguity H(o|s) for each column of a likelihood A_m (No x Ns)."""
    return -(A * _log(A)).sum(axis=0)


# --- the agent --------------------------------------------------------------------

@dataclass
class ActiveInference:
    """An exact discrete active-inference agent (single hidden-state factor)."""

    A: list[np.ndarray]                 # likelihoods, one (No_m x Ns) per modality
    B: np.ndarray                       # transitions (Ns x Ns x Nu)
    C: list[np.ndarray]                 # log-preferences, one (No_m,) per modality
    D: np.ndarray                       # prior over initial state (Ns,)
    horizon: int = 1                    # planning depth (policy length)
    gamma: float = 8.0                  # policy precision (baseline)
    lr: float = 1.0                     # Dirichlet learning rate
    learn_A: bool = True                # learn the likelihood from experience
    learn_B: bool = False               # learn transitions from experience
    gamma_m: list[float] | None = None  # per-modality sensory precision (None ⇒ ones)

    # Internal state (set in __post_init__).
    qs: np.ndarray = field(init=False)          # current posterior over states
    qs_prev: np.ndarray = field(init=False)     # previous posterior (for B-learning)
    last_action: int | None = field(init=False, default=None)
    pA: list[np.ndarray] = field(init=False)    # Dirichlet concentrations for A
    pB: np.ndarray = field(init=False)          # Dirichlet concentrations for B
    policies: np.ndarray = field(init=False)    # (Npolicies x horizon) action sequences

    def __post_init__(self) -> None:
        self.A = [_norm_cols(a) for a in self.A]
        self.B = np.stack([_norm_cols(self.B[:, :, u]) for u in range(self.B.shape[2])], axis=2)
        self.C = [np.asarray(c, dtype=float) for c in self.C]
        self.D = np.asarray(self.D, dtype=float)
        self.D = self.D / np.clip(self.D.sum(), EPS, None)

        self.Ns = self.B.shape[0]
        self.Nu = self.B.shape[2]
        # Per-modality sensory precision (attention). None ⇒ ones ⇒ identical to the
        # untempered likelihood, so the validated anchors are unchanged.
        self.gamma_m = [1.0] * len(self.A) if self.gamma_m is None else [float(g) for g in self.gamma_m]
        # Dirichlet priors seeded from the supplied tensors (mildly concentrated).
        self.pA = [a * 1.0 + 1.0 for a in self.A]
        self.pB = self.B * 1.0 + 1.0
        # Enumerate every action sequence of length `horizon` as a candidate policy.
        self.policies = np.array(list(itertools.product(range(self.Nu), repeat=self.horizon)))
        self.reset()

    # -- perception: minimise variational free energy ------------------------------

    def reset(self) -> None:
        self.qs = self.D.copy()
        self.qs_prev = self.D.copy()
        self.last_action = None

    def infer_states(self, obs: list[int]) -> np.ndarray:
        """Exact posterior q(s) given observations, minimising variational free energy.

        For this mean-field single-factor model the VFE-minimising posterior is
        categorical:   q(s) = softmax( ln prior(s) + sum_m ln A_m[o_m, s] ).
        """
        if self.last_action is None:
            prior = self.D
        else:
            prior = self.B[:, :, self.last_action] @ self.qs

        ln_post = _log(prior)
        for m, o in enumerate(obs):
            ln_post = ln_post + self.gamma_m[m] * _log(self.A[m][o, :])

        self.qs_prev = self.qs
        self.qs = _softmax(ln_post)
        return self.qs

    def variational_free_energy(self, obs: list[int]) -> float:
        """F = E_q[ln q(s) - ln P(o,s)] — reported for diagnostics (lower is better)."""
        if self.last_action is None:
            prior = self.D
        else:
            prior = self.B[:, :, self.last_action] @ self.qs_prev
        ln_lik = np.zeros(self.Ns)
        for m, o in enumerate(obs):
            ln_lik = ln_lik + self.gamma_m[m] * _log(self.A[m][o, :])
        return float((self.qs * (_log(self.qs) - _log(prior) - ln_lik)).sum())

    # -- action: minimise EXPECTED free energy -------------------------------------

    def evaluate_policies(self, dynamic_gamma: bool = False) -> dict:
        """Score every policy by expected free energy G, decomposed honestly.

        Returns the per-policy epistemic value, pragmatic value, the negative expected
        free energy (higher == more attractive), and the resulting policy posterior
        q(pi) = softmax(gamma * (-G)). With ``dynamic_gamma=False`` (default) gamma is
        the static baseline — byte-identical to the validated anchors; with ``True`` it
        is set per-call by :meth:`update_policy` (the live Factors/MC path).
        """
        nP = len(self.policies)
        epistemic = np.zeros(nP)
        pragmatic = np.zeros(nP)

        # Precompute per-modality, per-state ambiguity H(o|s).
        ambiguity = [_column_entropies(a) for a in self.A]  # list of (Ns,)

        for i, policy in enumerate(self.policies):
            qs = self.qs.copy()
            for u in policy:
                qs = self.B[:, :, u] @ qs            # predicted next state distribution
                for m, A_m in enumerate(self.A):
                    qo = A_m @ qs                    # predicted observation distribution
                    # Epistemic value = expected info gain about states = mutual info I(s;o)
                    #   = H(qo) - E_{q(s)}[ H(o|s) ]
                    epistemic[i] += _entropy(qo) - float(qs @ ambiguity[m])
                    # Pragmatic value = expected log-preference (utility of predicted obs).
                    pragmatic[i] += float(qo @ self.C[m])

        neg_efe = epistemic + pragmatic          # = -G ; higher is better
        gamma = self.update_policy(neg_efe) if dynamic_gamma else self.gamma
        q_pi = _softmax(gamma * neg_efe)
        return {
            "q_pi": q_pi,
            "neg_efe": neg_efe,
            "epistemic": epistemic,
            "pragmatic": pragmatic,
        }

    # -- dynamic precision (attention) — mirror of SP.Brain.Precision -------------

    def update_sensory(self, obs: list[int]) -> list[float]:
        """Retune per-modality sensory precision from the surprise of the observed
        outcomes under the current posterior. Pure; each gamma_m bounded to [G_MIN, G_MAX]."""
        for m, o in enumerate(obs):
            qo = self.A[m] @ self.qs
            s = -float(np.log(qo[o] + EPS))
            target = KAPPA / (s + EPS0) if SALIENCE_SIGN == "inverse" else KAPPA * (s + EPS0)
            g = (1.0 - RHO) * self.gamma_m[m] + RHO * target
            self.gamma_m[m] = float(np.clip(g, G_MIN, G_MAX))
        return self.gamma_m

    def update_policy(self, neg_efe: np.ndarray) -> float:
        """Policy precision from the q0-weighted variance of -G. Single-step, bounded."""
        neg_efe = np.asarray(neg_efe, dtype=float)
        q0 = _softmax(self.gamma * neg_efe)
        gbar = float(q0 @ neg_efe)
        var = float(q0 @ (neg_efe * neg_efe)) - gbar * gbar
        return float(np.clip(self.gamma / (1.0 + abs(var)), GAMMA_MIN_POL, GAMMA_MAX_POL))

    def act(self, mode: str = "sample", rng: np.random.Generator | None = None) -> int:
        """Choose an action by marginalising the policy posterior to the first step."""
        ev = self.evaluate_policies()
        q_pi = ev["q_pi"]
        p_u = np.zeros(self.Nu)
        for i, policy in enumerate(self.policies):
            p_u[policy[0]] += q_pi[i]
        if mode == "argmax":
            action = int(np.argmax(p_u))
        else:
            rng = rng or np.random.default_rng()
            action = int(rng.choice(self.Nu, p=p_u / p_u.sum()))
        self.last_action = action
        return action

    # -- learning: Dirichlet update of the generative model ------------------------

    def learn(self, obs: list[int]) -> None:
        """Update the generative model from experience (no reward — pure model learning)."""
        if self.learn_A:
            for m, o in enumerate(obs):
                self.pA[m][o, :] += self.lr * self.qs
                self.A[m] = _norm_cols(self.pA[m])
        if self.learn_B and self.last_action is not None:
            self.pB[:, :, self.last_action] += self.lr * np.outer(self.qs, self.qs_prev)
            self.B[:, :, self.last_action] = _norm_cols(self.pB[:, :, self.last_action])

    # -- a full perception-action-learning step ------------------------------------

    def step(self, obs: list[int], mode: str = "sample",
             rng: np.random.Generator | None = None) -> int:
        self.infer_states(obs)
        self.learn(obs)
        return self.act(mode=mode, rng=rng)

    # -- memory: survive death, keep what was learned ------------------------------

    def save(self, path: str) -> None:
        np.savez(
            path,
            A=np.array(self.A, dtype=object),
            B=self.B,
            pA=np.array(self.pA, dtype=object),
            pB=self.pB,
            D=self.D,
            qs=self.qs,
        )

    def load(self, path: str) -> None:
        data = np.load(path, allow_pickle=True)
        self.A = [np.asarray(a, dtype=float) for a in data["A"]]
        self.B = np.asarray(data["B"], dtype=float)
        self.pA = [np.asarray(a, dtype=float) for a in data["pA"]]
        self.pB = np.asarray(data["pB"], dtype=float)
        self.D = np.asarray(data["D"], dtype=float)
        self.qs = np.asarray(data["qs"], dtype=float)
        self.qs_prev = self.qs.copy()
        self.last_action = None
