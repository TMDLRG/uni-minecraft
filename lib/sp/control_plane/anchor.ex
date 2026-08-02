defmodule SP.ControlPlane.Anchor do
  @moduledoc """
  The value a hash chain cannot hold about itself: its expected head and length.

  Phase 2's adverse finding, given a mechanism. `Ledger.verify/1` cannot detect
  truncation from the tail, because **a prefix of a valid chain is a valid
  chain** — every `prev_hash` still resolves and `seq` is still contiguous from
  1. No amount of hashing inside the chain fixes that. Detection requires a value
  taken at one time and checked at another, held outside.

  An anchor derived from a chain and immediately checked against that same chain
  proves nothing. Its whole value is the gap between the two moments.

  ## THE HONEST LIMIT — this is a mechanism, not yet a practice

  Phase 3 item 3.6's pre-registered outcome was *"tail truncation is detected
  **in practice**, rather than only in a test"*. **That is not achieved.**
  `SP.ControlPlane.Ledger` has no persistence, so nothing holds an anchor across
  a process boundary and nothing can compare today's chain against yesterday's
  head. The mechanism exists and is proven; the practice needs a store, which is
  a Phase 4 item.

  This is stated here rather than left to be inferred from a green test suite.

  ## No `attest/1`

  There is deliberately no single-argument form. A chain cannot be reported sound
  without something held outside it, and an API that let you ask would eventually
  be asked.
  """

  alias SP.ControlPlane.Ledger

  @schema "uni.control_plane.anchor.v1"

  @enforce_keys [:head, :length]
  defstruct [:head, :length]

  @type t :: %__MODULE__{head: String.t(), length: non_neg_integer()}

  @doc "Take an anchor from a ledger. A read."
  @spec of(Ledger.t()) :: {:ok, t()} | {:error, :empty_ledger}
  def of(%Ledger{} = ledger), do: ledger |> Ledger.entries() |> of_entries()

  @doc "Take an anchor from a raw entry list. A read."
  @spec of_entries([Ledger.entry()]) :: {:ok, t()} | {:error, :empty_ledger}
  def of_entries([]), do: {:error, :empty_ledger}

  def of_entries(entries) when is_list(entries) do
    {:ok, %__MODULE__{head: entries |> List.last() |> Map.fetch!("hash"), length: length(entries)}}
  end

  @doc """
  Attest a ledger against an anchor taken earlier.

  `{:ok, :anchored}` only when the chain is internally sound **and** it ends
  where the anchor says it ends, at the length the anchor says it has.
  """
  @spec attest(Ledger.t(), t()) :: {:ok, :anchored} | {:error, term()}
  def attest(%Ledger{} = ledger, %__MODULE__{} = anchor) do
    attest_entries(Ledger.entries(ledger), anchor)
  end

  @doc "Attest a raw entry list against an anchor. A read."
  @spec attest_entries([Ledger.entry()], t()) :: {:ok, :anchored} | {:error, term()}
  def attest_entries(entries, %__MODULE__{head: head, length: len}) when is_list(entries) do
    case Ledger.verify_entries(entries, head: head, length: len) do
      :ok -> {:ok, :anchored}
      {:error, reason} -> {:error, reason}
    end
  end

  @doc "Canonical bytes for an anchor. The same anchor always encodes identically. A read."
  @spec encode(t()) :: binary()
  def encode(%__MODULE__{head: head, length: len}) do
    Ledger.canonical(%{"schema" => @schema, "head" => head, "length" => len})
  end

  @doc """
  Read an anchor back from bytes. Corrupt, partial or malformed input is refused
  rather than silently treated as "no anchor" — an absent anchor and a broken one
  are different situations and only one of them is safe.
  """
  @spec decode(binary()) :: {:ok, t()} | {:error, term()}
  def decode(bytes) when is_binary(bytes) do
    with {:ok, map} <- json(bytes),
         {:ok, head} <- head(map),
         {:ok, len} <- len(map) do
      {:ok, %__MODULE__{head: head, length: len}}
    end
  end

  def decode(other), do: {:error, {:not_binary, other}}

  defp json(bytes) do
    case JSON.decode(bytes) do
      {:ok, map} when is_map(map) -> {:ok, map}
      {:ok, other} -> {:error, {:not_an_object, other}}
      {:error, reason} -> {:error, {:malformed_json, reason}}
    end
  end

  defp head(%{"head" => h}) when is_binary(h) do
    if Regex.match?(~r/^[0-9a-f]{64}$/, h), do: {:ok, h}, else: {:error, {:head_not_a_digest, h}}
  end

  defp head(_), do: {:error, {:missing, :head}}

  defp len(%{"length" => n}) when is_integer(n) and n >= 0, do: {:ok, n}
  defp len(%{"length" => n}), do: {:error, {:length_not_a_count, n}}
  defp len(_), do: {:error, {:missing, :length}}
end
