defmodule SP.Sim.Verifier do
  @moduledoc """
  Independent re-derivation of the Markov-blanket no-leak verdict from recorded
  observer frames. This is what makes the evidence **falsifiable**: it never
  trusts the engine-stamped `blanket` claim — it recomputes the verdict from the
  raw afferent data using the public `SP.Interface` / `SP.Interface.Audit`
  functions, and flags any disagreement.

  Works on both in-memory frames (atom keys) and JSON-decoded frames (string
  keys), so a third party can verify a `.jsonl` evidence log offline with nothing
  but this module and the run's seed.

  Per-frame checks:

    1. **Structural** — `Audit.audit_observation(obs) == :ok` (integer channels in
       range, finite numeric values only).
    2. **Token scan** — `Audit.scan(obs) == []` (no semantic tokens leaked).
    3. **Morphology provenance** — every observed channel maps (via the channel
       map) to a sensor whose organ was present at sensing time. No channel may
       exist that the recorded morphology could not have produced.
    4. **Encode-equivalence** — `encode_observation(cm, recorded_signals) == obs`
       exactly. Proves the observation is precisely the channelisation of the
       recorded signals — no hidden side-channel was injected.
  """

  alias SP.{Interface, Observability}
  alias SP.Interface.Audit
  alias SP.Sim.Observer

  # Atom data-keys the encoder consumes, derived from the catalogue at compile time
  # (so JSON string keys can be safely restored without `String.to_atom`).
  @data_key_atoms Interface.observation_catalogue()
                  |> Enum.map(fn {_s, k, _t} ->
                    case k do
                      {:bands, _} -> :bands
                      a when is_atom(a) -> a
                    end
                  end)
                  |> Enum.uniq()

  @type report :: %{ok: boolean(), frames: non_neg_integer(), violations: [map()]}

  @doc "Verify one frame against a channel map. Returns `:ok` or `{:violation, reasons}`."
  @spec check_frame(map(), Interface.ChannelMap.t()) :: :ok | {:violation, [term()]}
  def check_frame(frame, cm) do
    afferent = fetch(frame, :afferent)
    obs = restore_obs(fetch(afferent, :observation))
    organs = afferent |> fetch(:decision_organs) |> normalize_organs()
    signals = afferent |> fetch(:signals) |> Enum.map(&restore_signal/1)

    reasons =
      []
      |> check(structural(obs), {:structural, :failed})
      |> check(Audit.scan(obs) == [], {:token_scan, Audit.scan(obs)})
      |> check(provenance(cm, obs, organs), :morphology_provenance)
      |> check(Interface.encode_observation(cm, signals) == obs, :encode_equivalence)

    if reasons == [], do: :ok, else: {:violation, reasons}
  end

  @doc """
  Verify every frame held in an in-memory `SP.Sim` (uses its channel map directly).
  """
  @spec check_sim(SP.Sim.t()) :: report()
  def check_sim(%SP.Sim{} = sim) do
    frames = sim.trace.frames |> Enum.reverse()
    run(frames, sim.channel_map)
  end

  @doc """
  Verify a JSONL evidence log produced by `SP.Sim.Recorder.write/2`. Reads the
  sibling `.meta.json`, rebuilds the channel map from the recorded seed (the
  public algorithm — not the engine's tables), and checks every frame.
  """
  @spec check_log(Path.t()) :: report()
  def check_log(log_path) do
    meta = (String.replace_suffix(log_path, ".jsonl", "") <> ".meta.json") |> File.read!() |> :json.decode()
    seed = get_in(meta, ["provenance", "seed"])
    scramble = Map.get(meta, "scramble", true)
    cm = Interface.channel_map(seed, scramble: scramble)

    frames =
      log_path
      |> File.stream!()
      |> Enum.reject(&(String.trim(&1) == ""))
      |> Enum.map(&:json.decode/1)

    run(frames, cm)
  end

  defp run(frames, cm) do
    violations =
      frames
      |> Enum.with_index()
      |> Enum.reduce([], fn {frame, i}, acc ->
        case check_frame(frame, cm) do
          :ok -> acc
          {:violation, reasons} -> [%{frame: i, tick: fetch(frame, :tick), reasons: reasons} | acc]
        end
      end)
      |> Enum.reverse()

    %{ok: violations == [], frames: length(frames), violations: violations}
  end

  # --- individual checks -------------------------------------------------------

  defp structural(obs), do: Audit.audit_observation(obs) == :ok

  defp provenance(cm, obs, organs) do
    Enum.all?(Map.keys(obs), fn ch ->
      case Interface.reveal_channel(cm, ch) do
        {source, _key} ->
          case Observer.source_organ(source) do
            nil -> false
            organ -> Atom.to_string(organ) in organs
          end

        _ ->
          false
      end
    end)
  end

  defp check(reasons, true, _reason), do: reasons
  defp check(reasons, false, reason), do: [reason | reasons]

  # --- normalisation (atom keys in-memory, string keys from JSON) --------------

  defp fetch(map, key) when is_atom(key) do
    case Map.fetch(map, key) do
      {:ok, v} -> v
      :error -> Map.get(map, Atom.to_string(key))
    end
  end

  defp restore_obs(obs) when is_map(obs) do
    Map.new(obs, fn {k, v} -> {to_int(k), v * 1.0} end)
  end

  defp to_int(k) when is_integer(k), do: k

  defp to_int(k) when is_binary(k) do
    case Integer.parse(k) do
      {n, ""} -> n
      # Keep a non-integer string key intact so the structural audit flags it
      # (rather than crashing here) — this is what makes the leak falsifiable.
      _ -> k
    end
  end

  # Any other key shape (e.g. an atom) is preserved so `audit_observation/1`
  # reports it as a leak instead of the verifier crashing.
  defp to_int(k), do: k

  defp normalize_organs(list) when is_list(list) do
    Enum.map(list, fn
      a when is_atom(a) -> Atom.to_string(a)
      s when is_binary(s) -> s
    end)
  end

  defp restore_signal(sigmap) do
    SP.Core.Signal.new!(%{
      id: "verify",
      type: fetch(sigmap, :type),
      source: fetch(sigmap, :source),
      time: fetch(sigmap, :time) || 0,
      data: restore_data(fetch(sigmap, :data))
    })
  end

  defp restore_data(data) when is_map(data) do
    Enum.reduce(data, %{}, fn {k, v}, acc ->
      case atom_key(k) do
        nil -> acc
        atom -> Map.put(acc, atom, v)
      end
    end)
  end

  defp restore_data(_), do: %{}

  defp atom_key(k) when is_atom(k), do: if(k in @data_key_atoms, do: k, else: nil)
  defp atom_key(k) when is_binary(k), do: Enum.find(@data_key_atoms, &(Atom.to_string(&1) == k))

  @doc "Pretty one-line report for CLI/UI."
  @spec describe(report()) :: String.t()
  def describe(%{ok: true, frames: n}), do: "VERIFIED: #{n} frames, 0 blanket violations."

  def describe(%{ok: false, frames: n, violations: vs}) do
    "VIOLATION: #{length(vs)}/#{n} frames leaked. First: " <>
      (vs |> List.first() |> Observability.json())
  end
end
