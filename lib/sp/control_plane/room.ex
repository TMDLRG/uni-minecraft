defmodule SP.ControlPlane.Room do
  @moduledoc """
  A gated space: `green → clean → sterile`, and back out again through the same
  gate you came in by.

  ## The shape is borrowed, deliberately

  `viewer/door_journey.cjs` already models a gated progression on this platform —
  every step is `{id, label, check}` whose `check` returns `{done, detail}`, and
  `detail` says *why not yet* in words a reader can act on:

      "not yet green — run BROADCAST TEST from the command center"

  A room mirrors that rather than inventing a second vocabulary for one idea. It
  remains a **different body** (ADR-0001): the Door's checks probe **live state**
  for a broadcast threshold; a room's conditions are **receipts** for a lab one.

  ## An unmet condition is not a failure

  `conditions/2` is a **pure read** that always answers. A room at `green` with no
  scan receipt has not failed anything — nobody has scanned it yet. A surface that
  paints that red teaches an operator to ignore red, which is how a real alarm
  gets missed. This is the same honesty as `drift.control_plane_anchor_offbox`
  reading `absent` because the anchor is not yet placed.

  Only `enter/4` — an actual attempt — returns an error, and even then it carries
  **the same condition list** you could have read beforehand.

  ## A receipt must exist here, unlike in a verdict

  `SP.ControlPlane.Verdict` deliberately does *not* check that a named receipt is
  on disk: authorship must not depend on the file already being written. A room is
  the opposite. **You may not stand in a sterile room on the strength of a receipt
  that is not there.** Every receipt is also hashed into the transition, so
  editing it afterwards is detectable.

  ## There is no override

  Not "an override is refused" — there is nothing to call. A refused control still
  teaches that the door exists, and a control that exists gets used on the night
  it matters. The same reasoning as the render contract's *refusals are absent,
  not greyed*.
  """

  alias SP.ControlPlane.{Command, Key, Ledger}

  @states [:green, :clean, :sterile]

  # PURPOSE IS NOT A STATE, AND THIS IS THE WHOLE POINT (ADR-0010).
  #
  # `green -> clean -> sterile` is a CONTAMINATION axis: what has been PROVED about a space, in a
  # strict order, each step gated by keys and receipts. "Operating room" and "laboratory" are
  # FUNCTION labels: what HAPPENS in a space. They are orthogonal, and putting them on one enum
  # makes an illegal state expressible — "a sterile operating room" would need two values at once,
  # or the enum silently loses the contamination fact, which is the only thing it exists to carry.
  #
  # The seed prompt asked for an operating room and a laboratory. It gets the vocabulary, as a FIELD
  # that GATES NOTHING. `conditions/4` and `enter/4` never read it, and
  # test/sp/control_plane/room_purpose_never_gates_test.exs is a source scan that fails if they ever
  # start. A label that can change a refusal is a second, undeclared authorization axis.
  @purposes [:floor, :laboratory, :operating_room, :airlock]
  @kebab ~r/^[a-z0-9]+(-[a-z0-9]+)*$/
  @repo Path.expand("../../..", __DIR__)

  @enforce_keys [:id, :state, :ledger]
  defstruct [:id, :state, :ledger, purpose: :floor]

  @type t :: %__MODULE__{
          id: String.t(),
          state: atom(),
          ledger: Ledger.t(),
          purpose: atom()
        }

  @doc "The three states. There is no fourth, and none of them is a number."
  @spec states() :: [atom()]
  def states, do: @states

  @doc """
  The declared purposes. A room's purpose says what it is FOR; its state says what has been proved
  about it. Recorded in every crossing, and read by no condition.
  """
  @spec purposes() :: [atom()]
  def purposes, do: @purposes

  @doc "What this room is for. A read, and it gates nothing."
  @spec purpose(t()) :: atom()
  def purpose(%__MODULE__{purpose: p}), do: p

  @doc "Open a room. It starts `green` — nothing is assumed about it."
  @spec new(String.t()) :: {:ok, t()} | {:error, term()}
  def new(id), do: new(id, :floor)

  @doc """
  Open a room with a declared purpose. It still starts `green`: a purpose is not a claim about
  cleanliness, and naming a room "operating_room" proves nothing about it.
  """
  @spec new(String.t(), atom()) :: {:ok, t()} | {:error, term()}
  def new(id, purpose) when is_binary(id) and is_atom(purpose) do
    cond do
      not Regex.match?(@kebab, id) -> {:error, {:room_id_not_kebab_case, id}}
      purpose not in @purposes -> {:error, {:unknown_purpose, purpose, @purposes}}
      true -> {:ok, %__MODULE__{id: id, state: :green, ledger: Ledger.new(), purpose: purpose}}
    end
  end

  def new(id, _purpose) when not is_binary(id), do: {:error, {:wrong_type, :id, id}}
  def new(_id, purpose), do: {:error, {:wrong_type, :purpose, purpose}}

  @doc "This room's identifier. A read."
  @spec id(t()) :: String.t()
  def id(%__MODULE__{id: id}), do: id

  @doc "Where the room is now. A read."
  @spec state(t()) :: atom()
  def state(%__MODULE__{state: s}), do: s

  @doc "Every crossing this room has made, oldest first. A read."
  @spec history(t()) :: [Ledger.entry()]
  def history(%__MODULE__{ledger: l}), do: Ledger.entries(l)

  @doc "The room's crossings as a verifiable chain. A read."
  @spec ledger(t()) :: Ledger.t()
  def ledger(%__MODULE__{ledger: l}), do: l

  @doc """
  What stands between this room and `target`, and what would meet each condition.

  A **pure read**. It never raises and never changes the room. Every entry is
  `%{id:, met:, detail:}` — and `detail` says what to do, not merely that
  something is wrong.
  """
  @spec conditions(t(), atom(), map(), [Key.t()]) :: [map()]
  def conditions(room, target, receipts \\ %{}, keys \\ [])

  def conditions(%__MODULE__{} = room, target, receipts, keys) when is_map(receipts) and is_list(keys) do
    [order_condition(room, target)] ++
      if target in @states, do: [keys_condition(keys)] ++ receipt_conditions(target, receipts), else: []
  end

  @doc """
  Cross into `target`.

  `{:ok, room}` only when every condition is met. Otherwise `{:error, {:not_met,
  conditions}}` carrying the same list `conditions/4` would have given you — and
  the room is returned **unchanged**, with no history written.
  """
  @spec enter(t(), atom(), map(), [Key.t()]) :: {:ok, t()} | {:error, term()}
  def enter(%__MODULE__{} = room, target, receipts, keys) when is_map(receipts) and is_list(keys) do
    with :ok <- known_state(target),
         :ok <- not_already(room, target),
         :ok <- in_order(room, target),
         :ok <- all_met(room, target, receipts, keys) do
      record(room, target, "room.entered", evidence_for(target, receipts), keys)
    end
  end

  @doc """
  Leave a sterile room, back to `clean`.

  Leaving is gated too, and that is the point: a sterile room is sterile because
  **what leaves it is accounted for**. Needs a contamination check and a manifest
  recompute, both of which must exist on disk.
  """
  @spec exit(t(), map()) :: {:ok, t()} | {:error, term()}
  def exit(%__MODULE__{state: :sterile} = room, receipts) when is_map(receipts) do
    conditions = exit_conditions(receipts)

    if Enum.all?(conditions, & &1.met) do
      record(room, :clean, "room.exited", exit_evidence(receipts), [])
    else
      {:error, {:not_met, conditions}}
    end
  end

  def exit(%__MODULE__{state: s}, _receipts), do: {:error, {:not_sterile, s}}

  @doc "What stands between a sterile room and leaving it. A read."
  @spec exit_conditions(map()) :: [map()]
  def exit_conditions(receipts) when is_map(receipts) do
    [
      receipt_condition(:contamination_check, receipts[:contamination], "a contamination check"),
      receipt_condition(:manifest_recompute, receipts[:manifest], "a manifest recompute")
    ]
  end

  # -- conditions -------------------------------------------------------------

  defp order_condition(room, target) do
    ok = target in @states and next_of(room.state) == target

    detail =
      cond do
        target not in @states -> "#{inspect(target)} is not a room state"
        room.state == target -> "the room is already #{room.state}"
        true -> "from #{room.state} the only step is #{inspect(next_of(room.state))} — reach clean first"
      end

    %{id: :in_order, met: ok, detail: if(ok, do: "#{room.state} -> #{target}", else: detail)}
  end

  defp keys_condition(keys) do
    parties = Key.parties(keys)
    operator? = Key.any_operator?(keys)

    cond do
      length(parties) >= 2 and operator? ->
        %{
          id: :two_keys,
          met: true,
          detail: "2 distinct parties, operator present: #{Enum.join(parties, ", ")}"
        }

      length(parties) < 2 ->
        %{
          id: :two_keys,
          met: false,
          detail:
            "needs 2 keys from distinct parties, got #{length(parties)}" <>
              if(parties == [], do: "", else: " (#{Enum.join(parties, ", ")} — one party cannot be two)")
        }

      true ->
        %{
          id: :two_keys,
          met: false,
          detail:
            "2 distinct parties present (#{Enum.join(parties, ", ")}) but no operator key — " <>
              "two agents are two parties and no authority"
        }
    end
  end

  defp receipt_conditions(:clean, receipts),
    do: [receipt_condition(:scan_receipt, receipts[:scan], "a scan receipt")]

  defp receipt_conditions(:sterile, receipts),
    do: [receipt_condition(:execution_receipt, receipts[:execution], "an execution receipt")]

  defp receipt_conditions(_target, _receipts), do: []

  defp receipt_condition(id, nil, what),
    do: %{id: id, met: false, detail: "needs #{what} — none was named"}

  defp receipt_condition(id, path, what) when is_binary(path) do
    if File.exists?(Path.join(@repo, path)),
      do: %{id: id, met: true, detail: "#{what}: #{path}"},
      else: %{id: id, met: false, detail: "needs #{what}; #{path} is named but is not on disk"}
  end

  defp receipt_condition(id, other, what),
    do: %{id: id, met: false, detail: "needs #{what}, got #{inspect(other)}"}

  # -- transition -------------------------------------------------------------

  defp known_state(t) when t in @states, do: :ok
  defp known_state(t), do: {:error, {:unknown_state, t}}

  defp not_already(%{state: s}, s), do: {:error, {:already, s}}
  defp not_already(_room, _target), do: :ok

  defp in_order(%{state: from}, target) do
    if next_of(from) == target, do: :ok, else: {:error, {:out_of_order, from, target}}
  end

  defp next_of(:green), do: :clean
  defp next_of(:clean), do: :sterile
  defp next_of(:sterile), do: nil

  defp all_met(room, target, receipts, keys) do
    conditions = conditions(room, target, receipts, keys)
    if Enum.all?(conditions, & &1.met), do: :ok, else: {:error, {:not_met, conditions}}
  end

  defp evidence_for(:clean, receipts), do: hashed([receipts[:scan]])
  defp evidence_for(:sterile, receipts), do: hashed([receipts[:execution]])
  defp evidence_for(_t, _r), do: []

  defp exit_evidence(receipts), do: hashed([receipts[:contamination], receipts[:manifest]])

  defp hashed(paths) do
    paths
    |> Enum.reject(&is_nil/1)
    |> Enum.map(fn rel ->
      %{
        "path" => rel,
        "sha256" =>
          Path.join(@repo, rel)
          |> File.read!()
          |> then(&:crypto.hash(:sha256, &1))
          |> Base.encode16(case: :lower)
      }
    end)
  end

  # The crossing itself. Every key is recorded, not merely checked and discarded —
  # a transition whose authority is not on the record cannot be audited later.
  defp record(room, target, transition, evidence, keys) do
    operator = Enum.find(keys, &(&1.kind == :operator))
    actor = Enum.find(keys, &(&1.kind != :operator))

    base = %{
      "kind" => "airlock",
      "granted_by" => if(operator, do: operator.holder, else: "michael"),
      "ref" => if(operator, do: operator.ref, else: "room:#{room.id}")
    }

    authorization =
      if keys == [],
        do: base,
        else: Map.put(base, "co_signers", Enum.map(keys, &Key.to_record/1))

    attrs = %{
      command: :cross_threshold,
      actor: if(actor, do: actor.holder, else: "claude"),
      role: "agent",
      transition: transition,
      prior: %{"room" => room.id, "state" => to_string(room.state), "purpose" => to_string(room.purpose)},
      resulting: %{"room" => room.id, "state" => to_string(target), "purpose" => to_string(room.purpose)},
      authorization: authorization,
      evidence: evidence
    }

    case Command.submit(room.ledger, attrs) do
      {:ok, ledger} -> {:ok, %{room | state: target, ledger: ledger}}
      {:error, reason} -> {:error, reason}
    end
  end
end
