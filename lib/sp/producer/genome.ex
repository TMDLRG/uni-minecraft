defmodule SP.Producer.Genome do
  @moduledoc """
  The Producer UNI's heritable spec — a **master producer's wisdom, set firmly**. Unlike a
  Minecraft agent (uninformative A, learned online), the Producer is built like the
  `SP.Brain.Strategist`: informative **fixed** likelihood A (`near_identity`), **shaped**
  per-action transitions B (each production action has a characteristic, designed effect on
  the show state), and designed preferences C (the showrunning priors). Only its beliefs
  (`qs`) update online; its judgment is the designed A/B/C. No learning, no reward — the
  producer acts to minimise expected free energy under C, exactly like every UNI.

  11 production-state factors (≤12 cap) and one shared production action set. The brain is a
  plain `SP.Brain.Factors` model, so all the engine machinery (EFE, precision, Awareness,
  structure growth) works unchanged. The last three (cohesion, economy, momentum) are the
  "fully-enabled" senses: the colony's social + economic life, and the show's LONG-arc memory.
  """

  alias SP.Brain.Factors

  # Production actions (the producer's motor repertoire). :noop pinned (no idle habit).
  @actions [
    :hold,
    :cut_to_drama,
    :cut_to_subject,
    :b_roll,
    :widen,
    :beat_crisis,
    :beat_social,
    :beat_mind,
    :beat_recap,
    :spawn_agent,
    :cull_agent,
    :health_tps,
    :health_restart_cam,
    :noop
  ]

  # Each modality: a production-state factor with `n` outcomes (= states; the producer reads
  # its telemetry as an interoceptive self-state, so A is a sharp near-identity), a designed
  # preference `c`, and `fixers` — the actions whose B RESOLVES a dispreferred state toward a
  # preferred one (`%{action => %{source_state => target_state}}`). Everything else is sticky.
  # System survival outweighs aesthetics (server_health "down" = −8 dominates).
  @modalities [
    %{name: :drama, n: 5, c: [-1.0, 0.5, 2.5, 1.0, -0.5], fixers: %{}},
    %{name: :spotlight, n: 6, c: [-2.0, 1.0, 1.5, 1.5, 1.0, 0.5], fixers: %{}},
    %{
      name: :coverage,
      n: 4,
      c: [1.0, 1.5, -2.0, -3.0],
      fixers: %{
        cut_to_drama: %{2 => 0, 3 => 0},
        cut_to_subject: %{2 => 0, 3 => 0},
        b_roll: %{2 => 0, 3 => 0},
        widen: %{3 => 0}
      }
    },
    %{name: :pacing, n: 4, c: [-0.5, 1.5, 1.0, -0.5], fixers: %{}},
    %{
      name: :population,
      n: 5,
      c: [-4.0, -1.0, 3.0, 0.5, -3.0],
      fixers: %{spawn_agent: %{0 => 2, 1 => 2}, cull_agent: %{3 => 2, 4 => 2}}
    },
    %{
      name: :server_health,
      n: 4,
      c: [-8.0, -4.0, 1.0, 2.0],
      fixers: %{health_tps: %{0 => 3, 1 => 3}}
    },
    %{
      name: :error_rate,
      n: 3,
      c: [2.0, -1.0, -5.0],
      fixers: %{health_tps: %{2 => 0, 1 => 0}, health_restart_cam: %{2 => 0}}
    },
    %{
      name: :diversity,
      n: 4,
      # variety of WHO is on camera — resolved by cutting to a DIFFERENT subject (b_roll /
      # cut_to_subject), NOT by narrating (a beat doesn't change the on-camera agent).
      c: [1.5, 0.5, -2.0, -4.0],
      fixers: %{cut_to_subject: %{2 => 0, 3 => 0}, b_roll: %{2 => 0, 3 => 0}}
    },
    # --- fully-enabled sensing: the colony's social + economic life (SENSED world-state the
    # producer also TELLS as story) ---
    %{
      name: :cohesion,
      # how together the colony is (social density). A connected ensemble is the better story;
      # only a genuinely FRACTURED colony (state 0) narrates the kinship — "loose" (state 1) is
      # the neutral everyday baseline, so independent foraging doesn't trigger narration spam.
      n: 4,
      c: [-2.0, 0.0, 2.0, 1.0],
      fixers: %{beat_social: %{0 => 2}}
    },
    %{
      name: :economy,
      # build/resource progress. Only a genuinely IDLE colony (state 0) gets a RECAP of how far
      # they've come; "gathering" (state 1) is the neutral everyday baseline (no narration spam).
      n: 4,
      c: [-2.0, 0.0, 2.0, 1.0],
      fixers: %{beat_recap: %{0 => 2}}
    },
    # --- DEEPER LONGER MEMORY: the show's drama arc over a slow EWMA window. The producer
    # REMEMBERS whether the show has been building or flagging and acts to sustain engagement. ---
    %{
      name: :momentum,
      # 0 flagging · 1 flat · 2 building · 3 peak. Only a genuinely DEAD arc (state 0) makes the
      # producer inject variety (b_roll / widen) to re-engage; "flat" (state 1) is the neutral
      # everyday baseline, so a calm-but-fine show is HELD, not frantically re-energised.
      n: 4,
      c: [-1.5, 0.0, 1.5, 1.0],
      fixers: %{b_roll: %{0 => 2}, widen: %{0 => 2}}
    }
  ]

  def actions, do: @actions
  def modalities, do: @modalities

  @doc """
  Build a factor spec for a NEW sensor the producer asks for (P7 evolvability) — same
  designed-prior shape as the base factors, with `nu` matching the action set so it can be
  grafted on via `SP.Brain.Factors.add_factor/2`.
  """
  def factor_spec(n, c, fixers \\ %{}) do
    %{
      a: [near_identity(n, 0.85)],
      b: Enum.map(@actions, fn act -> option_b(n, Map.get(fixers, act, %{}), stay_for(act)) end),
      c: [c],
      d: List.duplicate(1.0, n),
      gamma_m: [1.0],
      learn_a: false,
      learn_b: false
    }
  end

  @doc "The fixed-prior Factors model — the producer's designed show-running brain."
  def model do
    specs =
      Enum.map(@modalities, fn m ->
        %{
          a: [near_identity(m.n, 0.85)],
          b: Enum.map(@actions, fn act -> option_b(m.n, Map.get(m.fixers, act, %{}), stay_for(act)) end),
          c: [m.c],
          d: List.duplicate(1.0, m.n),
          gamma_m: [1.0],
          learn_a: false,
          learn_b: false
        }
      end)

    Factors.new(specs, gamma: 12.0, horizon: 1, learn_e: false)
  end

  # --- designed-prior constructors (column-major; ≥0.05 floor so ln is finite) ----

  # Likelihood A: peaked when outcome == state (sharp readout — the producer perceives its
  # telemetry clearly because the discretisation is designed, not learned).
  defp near_identity(n, p) do
    off = (1.0 - p) / (n - 1)
    for s <- 0..(n - 1), do: for(o <- 0..(n - 1), do: if(o == s, do: p, else: off))
  end

  # A master producer HOLDS a good shot: :hold's transition is a SHARPER stay (0.9) than the
  # default sticky (0.8), so in an already-good show-state holding best PRESERVES it (least
  # leakage to dispreferred outcomes) and wins the EFE — "let the shot breathe" instead of
  # twitching maintenance. Tuned to 0.9 (not 0.95): high enough to beat a no-op health twitch
  # in nominal, low enough that a genuinely dispreferred mid-tier factor (cohesion / economy /
  # momentum) still pulls its corrective beat. :noop stays neutral (0.8).
  defp stay_for(:hold), do: 0.9
  defp stay_for(_act), do: 0.8

  # One action's transition for an n-state factor (column-major: outer = source state).
  # Resolved sources drift toward their target (0.6 stay · 0.25 target · 0.05 each other);
  # everything else stays sticky (`stay` stay · spread). EVERY entry > 0 (ln-safe).
  defp option_b(n, resolve, stay) do
    for cur <- 0..(n - 1) do
      case Map.get(resolve, cur) do
        t when is_integer(t) and t != cur ->
          # 0.6 stay · 0.25 toward target · the remaining 0.15 shared by the other states,
          # so the column sums to 1 for ANY factor size (not just n=5 like the Strategist).
          rest = if n > 2, do: 0.15 / (n - 2), else: 0.0

          for next <- 0..(n - 1) do
            cond do
              next == cur -> 0.6
              next == t -> 0.25
              true -> rest
            end
          end

        _ ->
          off = (1.0 - stay) / (n - 1)
          for next <- 0..(n - 1), do: if(next == cur, do: stay, else: off)
      end
    end
  end
end
