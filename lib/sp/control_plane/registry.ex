defmodule SP.ControlPlane.Registry do
  @moduledoc """
  Registers a gate **before** anything about it is observed.

  A registration carries the claim in full — `pass_condition`,
  `falsifies_condition`, and where the pre-registration document lives — and it
  carries it first. A gate registered after its result is known is not a
  prediction; it is a description wearing a prediction's vocabulary.

  ## Prospectivity is decided by `seq`, not by wording

  `CLAUDE.md` says prospectivity is decided by the commit graph, not by prose.
  Inside the ledger the equivalent is position: **a registration must be the
  first entry that mentions its gate.** Any earlier entry naming it — in
  `resulting` or in `prior`, under any transition — refuses the registration and
  names the `seq` that got there first, so it can be looked at.

  The guard deliberately does not know what a run is. `SP.ControlPlane.Run` is
  Phase 4, and when it lands this needs no change, because "an entry mentioning
  the gate" already covers it.

  ## What it does not do

  It does not adjudicate. A registered gate reads `PENDING` until
  `SP.ControlPlane.Verdict` says otherwise, and `PENDING` is the honest word for
  *registered but not run*.
  """

  alias SP.ControlPlane.{Command, Ledger}

  @kebab ~r/^[a-z0-9]+(-[a-z0-9]+)*$/
  @transition "gate.registered"

  @doc """
  Register a gate. Refuses a gate already registered, a gate any earlier entry
  has mentioned, and a claim missing either of its two conditions.
  """
  @spec register(Ledger.t(), map()) :: {:ok, Ledger.t()} | {:error, term()}
  def register(%Ledger{} = ledger, attrs) when is_map(attrs) do
    with {:ok, gate} <- gate(attrs),
         {:ok, pass} <- text(attrs, :pass_condition),
         {:ok, falsifies} <- text(attrs, :falsifies_condition),
         :ok <- not_already_registered(ledger, gate),
         :ok <- prospective(ledger, gate) do
      Command.submit(ledger, %{
        command: :register_gate,
        actor: Map.get(attrs, :actor),
        role: Map.get(attrs, :role),
        transition: @transition,
        prior: nil,
        resulting: %{
          "gate" => gate,
          "pass_condition" => pass,
          "falsifies_condition" => falsifies,
          "pre_registration_path" => Map.get(attrs, :pre_registration_path, ""),
          "verdict" => "PENDING"
        },
        authorization: Map.get(attrs, :authorization),
        evidence: Map.get(attrs, :evidence, []),
        at: Map.get(attrs, :at)
      })
    end
  end

  @doc "Is this gate registered in this ledger? A read."
  @spec registered?(Ledger.t(), String.t()) :: boolean()
  def registered?(%Ledger{} = ledger, gate), do: registration(ledger, gate) != nil

  @doc "The registration entry for a gate, or `nil`. A read."
  @spec registration(Ledger.t(), String.t()) :: Ledger.entry() | nil
  def registration(%Ledger{} = ledger, gate) do
    ledger
    |> Ledger.entries()
    |> Enum.find(&(&1["transition"] == @transition and &1["resulting"]["gate"] == gate))
  end

  @doc "Every gate registered in this ledger, in registration order. A read."
  @spec gates(Ledger.t()) :: [String.t()]
  def gates(%Ledger{} = ledger) do
    ledger
    |> Ledger.entries()
    |> Enum.filter(&(&1["transition"] == @transition))
    |> Enum.map(& &1["resulting"]["gate"])
  end

  @doc "The `seq` of the first entry mentioning this gate, or `nil`. A read."
  @spec first_mention(Ledger.t(), String.t()) :: pos_integer() | nil
  def first_mention(%Ledger{} = ledger, gate) do
    ledger
    |> Ledger.entries()
    |> Enum.find_value(fn entry ->
      if mentions?(entry, gate), do: entry["seq"]
    end)
  end

  # -- internals --------------------------------------------------------------

  defp mentions?(entry, gate) do
    get_gate(entry["resulting"]) == gate or get_gate(entry["prior"]) == gate
  end

  defp get_gate(state) when is_map(state), do: state["gate"]
  defp get_gate(_), do: nil

  defp gate(attrs) do
    case Map.fetch(attrs, :gate) do
      {:ok, g} when is_binary(g) ->
        if Regex.match?(@kebab, g), do: {:ok, g}, else: {:error, {:gate_not_kebab_case, g}}

      {:ok, g} ->
        {:error, {:wrong_type, :gate, g}}

      :error ->
        {:error, {:missing, :gate}}
    end
  end

  defp text(attrs, key) do
    case Map.fetch(attrs, key) do
      {:ok, v} when is_binary(v) ->
        if String.trim(v) == "", do: {:error, {:blank, key}}, else: {:ok, v}

      {:ok, v} ->
        {:error, {:wrong_type, key, v}}

      :error ->
        {:error, {:missing, key}}
    end
  end

  defp not_already_registered(ledger, gate) do
    if registered?(ledger, gate), do: {:error, {:already_registered, gate}}, else: :ok
  end

  defp prospective(ledger, gate) do
    case first_mention(ledger, gate) do
      nil -> :ok
      seq -> {:error, {:not_prospective, gate, seq}}
    end
  end
end
