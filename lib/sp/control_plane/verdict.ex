defmodule SP.ControlPlane.Verdict do
  @moduledoc """
  Authors one of five controlled words about a **registered** gate, with a
  pointer to the thing that establishes it.

      PASS · PARTIAL · FAIL · WITHHELD · PENDING

  and nothing else. `ARCHITECTURE.md` §7.1 and `CLAUDE.md`'s truth contract:
  **never percent-scored.** A number looks more precise than a word and carries
  less — it invites an average, a trend line and a threshold, none of which the
  evidence supports. Case is not normalised either: `"pass"` is a refusal, not a
  guess, because a near-miss is a sign that something upstream is confused.

  ## The structural refusals, and why each one

  * **No registration, no verdict.** Adjudicating an unregistered gate means the
    claim was written after the result was known.
  * **`PARTIAL` must name what holds.** A bare `PARTIAL` reads as "mostly passed"
    and means nothing checkable. Naming what holds also names, by omission, what
    does not. The check requires something substantive — several words, not
    `"TBD"`.
  * **A verdict names its receipt.** Except `PENDING`, which asserts nothing and
    therefore has nothing to point at. `WITHHELD` *does* need one: a withdrawal
    is itself a claim about evidence.
  * **The co-signer is not the proposer.** Enforced in `SP.ControlPlane.Command`,
    because it binds every mutation and not only this one.

  ## Where this stops, deliberately

  It checks that a receipt is **named**, never that the file exists.
  `test/gate_registry_integrity_test.exs` already enforces existence over the
  canonical ledger. Hashing the receipt here would make authorship depend on the
  file already being written, which is a different and worse coupling.

  A verdict may be **lowered** on receipts. That is the gate working. The prior
  entry is kept; history is extended, never edited.
  """

  alias SP.ControlPlane.{Command, Ledger, Registry}

  @vocabulary ~w(PASS PARTIAL FAIL WITHHELD PENDING)
  @receiptless ~w(PENDING)
  @transition "gate.adjudicated"
  @allowed_keys [:gate, :verdict, :receipt_ref, :holds, :actor, :role, :authorization, :evidence, :at]

  @doc "The five words, in the same order as `gate_row.schema.json`'s enum."
  @spec vocabulary() :: [String.t()]
  def vocabulary, do: @vocabulary

  @doc "Author a verdict about a registered gate."
  @spec author(Ledger.t(), map()) :: {:ok, Ledger.t()} | {:error, term()}
  def author(%Ledger{} = ledger, attrs) when is_map(attrs) do
    with :ok <- only_known_keys(attrs),
         {:ok, gate} <- gate(attrs),
         {:ok, verdict} <- verdict(attrs),
         :ok <- registered(ledger, gate),
         {:ok, receipt_ref} <- receipt_ref(verdict, attrs),
         {:ok, holds} <- holds(verdict, attrs) do
      resulting =
        %{"gate" => gate, "verdict" => verdict}
        |> put_unless_nil("receipt_ref", receipt_ref)
        |> put_unless_nil("holds", holds)

      Command.submit(ledger, %{
        command: :author_verdict,
        actor: Map.get(attrs, :actor),
        role: Map.get(attrs, :role),
        transition: @transition,
        prior: current_state(ledger, gate),
        resulting: resulting,
        authorization: Map.get(attrs, :authorization),
        evidence: Map.get(attrs, :evidence, []),
        at: Map.get(attrs, :at)
      })
    end
  end

  @doc """
  The gate's standing verdict — the latest adjudication, or the registration's
  `PENDING` if none. `nil` if the gate is not registered. A read.
  """
  @spec of(Ledger.t(), String.t()) :: map() | nil
  def of(%Ledger{} = ledger, gate) do
    adjudication =
      ledger
      |> Ledger.entries()
      |> Enum.reverse()
      |> Enum.find(&(&1["transition"] == @transition and &1["resulting"]["gate"] == gate))

    cond do
      adjudication != nil -> summarise(adjudication)
      Registry.registered?(ledger, gate) -> summarise(Registry.registration(ledger, gate))
      true -> nil
    end
  end

  # -- internals --------------------------------------------------------------

  defp summarise(entry) do
    %{
      verdict: entry["resulting"]["verdict"],
      receipt_ref: entry["resulting"]["receipt_ref"],
      holds: entry["resulting"]["holds"],
      seq: entry["seq"]
    }
  end

  defp current_state(ledger, gate) do
    case of(ledger, gate) do
      nil -> nil
      v -> %{"gate" => gate, "verdict" => v.verdict} |> put_unless_nil("receipt_ref", v.receipt_ref)
    end
  end

  defp only_known_keys(attrs) do
    case Map.keys(attrs) -- @allowed_keys do
      [] -> :ok
      [key | _] -> {:error, {:unknown_key, key}}
    end
  end

  defp gate(attrs) do
    case Map.fetch(attrs, :gate) do
      {:ok, g} when is_binary(g) and g != "" -> {:ok, g}
      {:ok, g} -> {:error, {:wrong_type, :gate, g}}
      :error -> {:error, {:missing, :gate}}
    end
  end

  defp verdict(attrs) do
    case Map.fetch(attrs, :verdict) do
      {:ok, v} when is_binary(v) ->
        if v in @vocabulary,
          do: {:ok, v},
          else: {:error, {:not_a_verdict, v, "expected one of #{Enum.join(@vocabulary, " | ")}"}}

      {:ok, v} ->
        {:error, {:not_a_verdict, v, "a verdict is a word, never a number or a score"}}

      :error ->
        {:error, {:missing, :verdict}}
    end
  end

  defp registered(ledger, gate) do
    if Registry.registered?(ledger, gate), do: :ok, else: {:error, {:no_registration, gate}}
  end

  defp receipt_ref(verdict, attrs) do
    case {verdict in @receiptless, Map.get(attrs, :receipt_ref)} do
      {true, nil} -> {:ok, nil}
      {false, nil} -> {:error, {:missing, :receipt_ref}}
      {_, ref} when is_binary(ref) -> validate_ref(ref)
      {_, ref} -> {:error, {:wrong_type, :receipt_ref, ref}}
    end
  end

  # Repo-relative only. A URL is not evidence this repository can rehash, and an
  # absolute path is not portable to the next machine that reads the ledger.
  defp validate_ref(ref) do
    cond do
      String.trim(ref) == "" -> {:error, {:blank, :receipt_ref}}
      String.contains?(ref, "://") -> {:error, {:receipt_ref_must_be_repo_relative, ref}}
      String.starts_with?(ref, "/") -> {:error, {:receipt_ref_must_be_repo_relative, ref}}
      Regex.match?(~r|^[A-Za-z]:[\\/]|, ref) -> {:error, {:receipt_ref_must_be_repo_relative, ref}}
      String.contains?(ref, "..") -> {:error, {:receipt_ref_must_be_repo_relative, ref}}
      true -> {:ok, ref}
    end
  end

  defp holds("PARTIAL", attrs) do
    case Map.get(attrs, :holds) do
      h when is_binary(h) -> substantive(h)
      nil -> {:error, {:partial_must_name_its_holding_subclaim, "PARTIAL", :holds}}
      h -> {:error, {:wrong_type, :holds, h}}
    end
  end

  defp holds(verdict, attrs) do
    case Map.get(attrs, :holds) do
      nil -> {:ok, nil}
      _ -> {:error, {:holds_only_on_partial, verdict}}
    end
  end

  # "TBD", "n/a" and "some" are refusals dressed as answers. A holding sub-claim
  # is a sentence about which part of the claim survived, so it has words in it.
  defp substantive(h) do
    trimmed = String.trim(h)
    words = trimmed |> String.split(~r/\s+/, trim: true) |> length()

    if String.length(trimmed) >= 8 and words >= 2,
      do: {:ok, trimmed},
      else: {:error, {:partial_must_name_its_holding_subclaim, "PARTIAL", h}}
  end

  defp put_unless_nil(map, _key, nil), do: map
  defp put_unless_nil(map, key, value), do: Map.put(map, key, value)
end
