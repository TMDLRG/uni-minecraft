defmodule SP.Brain.MCCodec do
  @moduledoc """
  The Minecraft sense/act discretiser — the brain-internal half of the live
  Markov blanket (the Node `mineflayer` body is the external half).

  It converts the body's raw symbolic senses into the genome's discrete modality
  outcomes (matching `SP.Brain.Curriculum`'s outcome semantics) and maps a chosen
  action index back to a primitive the body executes. The agent is NOT told what
  any sense means — these are just bins; the engine LEARNS their meaning in `A`
  and each action's effect in `B`.

  Sense object (JSON from the body), all keys optional with safe defaults:

      %{"health" => 0..20, "food" => 0..20,
        "inv" => %{"wood" => n, "tools" => n, "food" => n},
        "look" => block_name, "ground" => block_name,
        "hostile_dist" => number | nil, "hurt" => bool}
  """

  alias SP.Brain.Genome

  @doc "Encode raw senses into `obs_by_factor` for the genome's active modalities (in order)."
  def encode(senses, %Genome{} = dna) do
    Enum.map(Genome.active_modalities(dna), fn mod -> [outcome(mod.name, senses)] end)
  end

  @doc "Map a chosen action index to its primitive action atom."
  def action(index), do: Enum.at(Genome.actions(), index, :noop)

  # --- per-modality discretisation (public for testing) ----------------------

  def outcome(:status, s), do: status_index(get(s, "health", 20), get(s, "food", 20))
  def outcome(:inventory, s), do: inventory_index(get(s, "inv", %{}))
  def outcome(:vision, s), do: vision_index(get(s, "look", nil) || get(s, "ground", nil))
  def outcome(:threat, s), do: threat_index(get(s, "hostile_dist", nil), get(s, "hurt", false))
  # social: 0 alone · 1 kin near · 2 non-kin near — the body already applied the
  # agent's visibility mode (see_all / blind / see_kin) and kin recognition.
  def outcome(:social, s), do: clamp_idx(get(s, "social", 0))
  # self: an interoceptive self-state summary from the body's own signals.
  def outcome(:self, s),
    do:
      self_index(get(s, "health", 20), get(s, "food", 20), get(s, "hurt", false), get(s, "hostile_dist", nil))

  # strategy: the strategic SITUATION (for the L2 strategist) — 0 calm · 1 threatened · 2 depleted · 3 social.
  def outcome(:strategy, s), do: situation_index(s)
  # RICH SIGHT (Gen-2.5): the body sends these already-discretised; the codec just bounds them.
  # light 0 dark·1 dim·2 day · sky 0 enclosed·1 partial·2 open · sight 0 none·1 ahead·2 left·3 right.
  def outcome(:light, s), do: idx(get(s, "light", 2), 2)
  def outcome(:sky, s), do: idx(get(s, "sky", 2), 2)
  def outcome(:sight, s), do: idx(get(s, "tree_dir", 0), 3)
  # build readiness (Gen-2.6): 0 nothing · 1 can-place · 2 can-craft.
  def outcome(:build, s), do: idx(get(s, "build", 0), 2)
  # prey bearing (Gen-2.7): 0 none · 1 ahead · 2 left · 3 right (nearest animal relative to facing).
  def outcome(:prey, s), do: idx(get(s, "prey", 0), 3)
  # PIXEL SIGHT (vision-primary): the learned scene-state (0..scene_states-1) from the UNI's visual
  # cortex, already discretised by UNI.OS — the codec just bounds it. The body sends it as "scene".
  def outcome(:scene, s), do: idx(get(s, "scene", 0), Genome.scene_states() - 1)
  # MOTOR CORTEX (Gen-3, opt-in): the body sends its own proprioceptive configuration already discretised;
  # the codec just bounds each to its modality cardinality. Reached ONLY for a :motor_cortex genome (these
  # modalities are absent from active_modalities otherwise), so the default/vision path never hits them.
  # aim 0 off·1 near·2 on_target · reach 0 out·1 in · contact 0 air·1 leaf·2 log·3 other ·
  # dig 0 idle·1 started·2 progressing·3 broke · motion 0 still·1 moving·2 blocked.
  def outcome(:aim_state, s), do: idx(get(s, "aim", 0), 2)
  def outcome(:reach_state, s), do: idx(get(s, "reach", 0), 1)
  def outcome(:contact_state, s), do: idx(get(s, "contact", 0), 3)
  def outcome(:dig_state, s), do: idx(get(s, "dig", 0), 3)
  def outcome(:motion_state, s), do: idx(get(s, "motion", 0), 2)
  # METABOLISM (Phase 2): the bridge injects an already-discretised interoceptive level (the internal energy/
  # satiety store the body cannot externally sense), default 'ok'/'sated' (bin 2). Reached ONLY for a
  # :metabolism genome (these modalities are absent from active_modalities otherwise).
  def outcome(:energy, s), do: idx(get(s, "energy", 2), 3)
  def outcome(:satiety, s), do: idx(get(s, "satiety", 2), 3)
  # HOMEOSTAT (Rung-1): graded 6-bin interoceptive viability the SP.Brain.Homeostat body injects (the mind
  # cannot externally sense its ATP). 0 critical..5 surplus; default 'nominal' (bin 3). Reached ONLY for a
  # :homeostat genome (these modalities are absent from active_modalities otherwise).
  def outcome(:energy_reserve, s), do: idx(get(s, "energy_reserve", 3), 5)
  def outcome(:gut_satiety, s), do: idx(get(s, "gut_satiety", 3), 5)
  def outcome(:soma_integrity, s), do: idx(get(s, "soma_integrity", 5), 5)
  def outcome(:muscle_fatigue, s), do: idx(get(s, "muscle_fatigue", 5), 5)
  def outcome(_other, _s), do: 0

  # 0 calm · 1 threatened · 2 depleted · 3 social · 4 idle (reuses the threat/status/social bins).
  def situation_index(s) do
    cond do
      threat_index(get(s, "hostile_dist", nil), get(s, "hurt", false)) == 2 -> 1
      # INTEROCEPTIVE HUNGER (homeostat, Rung-1): the organism's TRUE depletion is a low energy_reserve —
      # the interoceptive prediction error the strategist must resolve by FORAGING. Without this, hunger is
      # invisible to L2 (it read only the MC food gauge), so a UNI whose homeostat energy is empty but whose
      # inventory/food gauge is full never selects :forage. Gated: only a :homeostat body injects
      # "energy_reserve"; absent (default + every other genome) ⇒ this clause never fires ⇒ byte-identical.
      interoceptive_depleted?(s) -> 2
      status_index(get(s, "health", 20), get(s, "food", 20)) in [0, 2] -> 2
      clamp_idx(get(s, "social", 0)) > 0 -> 3
      # safe + alone + empty-handed ⇒ idle (nothing pressing, nothing gathered): the L2
      # drive is to forage out of idleness toward calm. `calm` (0) is safe WITH resources.
      inventory_index(get(s, "inv", %{})) == 0 -> 4
      true -> 0
    end
  end

  # Genuine interoceptive hunger: a low energy_reserve bin (0 critical · 1 depleted). Absent ⇒ false (default
  # genomes have no homeostat body, so "energy_reserve" is never in senses ⇒ the situation digest is unchanged).
  defp interoceptive_depleted?(s) do
    case get(s, "energy_reserve", nil) do
      b when is_integer(b) -> b <= 1
      _ -> false
    end
  end

  # status: 0 dying · 1 injured · 2 hungry · 3 safe
  def status_index(health, food) do
    cond do
      health < 6 -> 0
      health < 14 -> 1
      food < 8 -> 2
      true -> 3
    end
  end

  # inventory: 0 empty · 1 has_wood · 2 has_tools · 3 has_food (priority tools>food>wood)
  def inventory_index(inv) do
    cond do
      get(inv, "tools", 0) > 0 -> 2
      get(inv, "food", 0) > 0 -> 3
      get(inv, "wood", 0) > 0 -> 1
      true -> 0
    end
  end

  # vision/localmap: 0 void · 1 open · 2 tree · 3 water · 4 hazard · 5 enclosed
  def vision_index(block) do
    name = block |> to_string() |> String.downcase()

    cond do
      name in ["", "null"] -> 0
      name == "air" -> 1
      String.contains?(name, ["log", "leaves", "wood", "sapling"]) -> 2
      String.contains?(name, ["water", "kelp", "seagrass"]) -> 3
      String.contains?(name, ["lava", "fire", "cactus", "magma"]) -> 4
      true -> 5
    end
  end

  # self: 0 capable · 1 strained · 2 overloaded · 3 seeking_help
  # Priority: near-death dominates; then acute distress (hurt / something on top of
  # me); then chronic strain (wounded or hungry); else capable.
  def self_index(health, _food, _hurt, _dist) when health < 5, do: 3

  def self_index(_health, _food, hurt, dist) when hurt == true or (is_number(dist) and dist < 4.0), do: 2

  def self_index(health, food, _hurt, _dist) when health < 10 or food < 8, do: 1

  def self_index(_health, _food, _hurt, _dist), do: 0

  # threat/danger: 0 none · 1 near · 2 attacking
  def threat_index(_dist, true), do: 2

  def threat_index(dist, _hurt) when is_number(dist) do
    if dist < 8.0, do: 1, else: 0
  end

  def threat_index(_dist, _hurt), do: 0

  defp clamp_idx(v) when is_integer(v), do: v |> max(0) |> min(2)
  defp clamp_idx(v) when is_float(v), do: clamp_idx(trunc(v))
  defp clamp_idx(_), do: 0

  # bound an already-discrete index to [0, hi].
  defp idx(v, hi) when is_integer(v), do: v |> max(0) |> min(hi)
  defp idx(v, hi) when is_float(v), do: idx(trunc(v), hi)
  defp idx(_v, _hi), do: 0

  # tolerant getter for string- or atom-keyed maps from JSON
  defp get(map, key, default) when is_map(map) do
    Map.get(map, key, Map.get(map, String.to_atom(key), default))
  end

  defp get(_non_map, _key, default), do: default
end
