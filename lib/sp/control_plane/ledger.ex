defmodule SP.ControlPlane.Ledger do
  @moduledoc """
  The append-only, hash-chained record of every canonical mutation.

  An entry is **never edited**. A correction is a new entry that says what
  changed and under whose authority. Twelve fields, all required, specified in
  `docs/control-plane/DATA-SPEC.md` §1 (UNI-FLAGELLUM):

      seq · utc · unix_ns · actor · role · transition
      prior · resulting · authorization · evidence · prev_hash · hash

  `hash` is the sha256 of the canonical serialization of the other eleven.
  `prev_hash` is the previous entry's `hash`, and is `nil` only at `seq = 1`.

  `prior` may be `nil` at **any** `seq` — a creation event has no prior state
  wherever it lands in the chain. See `check_prior/2`.

  ## What `verify/1` proves, and what it cannot

  It proves that no entry's content has changed, that no entry has been removed
  from the middle or reordered, and that `seq` runs contiguously from 1.

  It **cannot** detect truncation from the tail. A prefix of a valid chain is
  itself a valid chain: every `prev_hash` still resolves and `seq` is still
  contiguous. This is a property of hash chains, not a defect here, and no
  amount of internal hashing fixes it — detection requires an anchor held
  *outside* the chain. That is what `verify/2` takes:

      verify(ledger, head: expected_tip_hash, length: expected_count)

  Both halves are asserted in `test/sp/control_plane/ledger_chain_tamper_test.exs`.
  Until a Phase 3 anchor exists to hold the expected head, tail truncation is
  undetected. That is stated rather than implied.

  ## Writing

  There is exactly one writer, and it is not this module's public surface: the
  arity-3 appender demands a `SP.ControlPlane.Command.Writ` and refuses anything
  else. Everything else here is a read, and a read never actuates.
  """

  # @limitation cp.ledger.tail-truncation
  #   what: `verify/1` cannot detect truncation from the TAIL of the chain
  #   why: a prefix of a valid hash chain is itself a valid chain -- every prev_hash still resolves and seq is still contiguous. This is a property of hash chains, not a defect here, and no amount of internal hashing fixes it.
  #   claim: internally sound, NOT complete. Detection requires an anchor held OUTSIDE the chain, which is what verify/2 takes.
  #   proof: test/sp/control_plane/ledger_chain_tamper_test.exs
  alias SP.ControlPlane.Command.Writ

  defstruct reversed: []

  @typedoc "One ledger entry. String keys throughout, so it round-trips through `JSON` unchanged."
  @type entry :: %{optional(String.t()) => term()}
  @type t :: %__MODULE__{reversed: [entry()]}

  @doc "An empty ledger. Verifies trivially; has no head."
  @spec new() :: t()
  def new, do: %__MODULE__{}

  @doc "Every entry, in `seq` order. A read."
  @spec entries(t()) :: [entry()]
  def entries(%__MODULE__{reversed: reversed}), do: Enum.reverse(reversed)

  @doc """
  Append one entry. **The only write path.**

  Requires a `%SP.ControlPlane.Command.Writ{}` as its second argument; anything
  else is `{:error, :unauthorized_writer}`. `seq`, `prev_hash` and `hash` are
  computed here and may not be supplied by the caller.
  """
  @spec append(t(), Writ.t() | term(), map()) :: {:ok, t()} | {:error, term()}
  def append(%__MODULE__{reversed: reversed} = ledger, %Writ{} = writ, attrs) when is_map(attrs) do
    seq = length(reversed) + 1

    prev_hash =
      case reversed do
        [] -> nil
        [head | _] -> head["hash"]
      end

    with :ok <- check_prior(seq, Map.get(attrs, :prior)),
         {:ok, body} <- body(seq, prev_hash, writ, attrs) do
      {:ok, %{ledger | reversed: [Map.put(body, "hash", hash_of(body)) | reversed]}}
    end
  end

  def append(%__MODULE__{}, _not_a_writ, _attrs), do: {:error, :unauthorized_writer}

  @doc """
  Rebuild a ledger from entries read back from bytes. Refuses a chain that does
  not verify.

  **This is a trust boundary, and it is not pretended otherwise.** It does not go
  through `SP.ControlPlane.Command`, because nothing read from disk did. Verifying
  stops corruption, truncation-in-the-middle and accident; it cannot stop a forger
  who recomputes valid hashes. `SP.ControlPlane.Anchor` is what makes that
  checkable, and only from outside the chain.
  """
  @spec from_entries([entry()]) :: {:ok, t()} | {:error, term()}
  def from_entries(entries) when is_list(entries) do
    case verify_entries(entries) do
      :ok -> {:ok, %__MODULE__{reversed: Enum.reverse(entries)}}
      {:error, reason} -> {:error, reason}
    end
  end

  @doc """
  Verify the chain. `opts` may carry an out-of-chain anchor:
  `head:` the expected tip hash, `length:` the expected entry count.
  A read.
  """
  @spec verify(t(), keyword()) :: :ok | {:error, term()}
  def verify(ledger, opts \\ [])
  def verify(%__MODULE__{} = ledger, opts), do: verify_entries(entries(ledger), opts)

  @doc "Verify a raw list of entries. Used to verify a chain that has been taken apart. A read."
  @spec verify_entries([entry()], keyword()) :: :ok | {:error, term()}
  def verify_entries(entries, opts \\ [])

  def verify_entries(entries, opts) when is_list(entries) do
    with :ok <- check_seq(entries),
         :ok <- check_hashes(entries),
         :ok <- check_chain(entries) do
      check_anchor(entries, opts)
    end
  end

  @typedoc "One evidence reference, placed in time against the chain."
  @type evidence_ref :: %{
          path: String.t(),
          sha256: String.t(),
          seq: integer(),
          state: :current | :superseded
        }

  @doc """
  Every evidence reference in `entries`, each marked `:current` or `:superseded`.

  A path may legitimately be referenced more than once — evidence is regenerated,
  an account is re-ingested, a receipt gains a second run. The reference at the
  **highest `seq`** for a path is `:current`; every earlier reference to that same
  path is `:superseded`.

  ## Why this exists (Phase 9 step 2.7)

  `control_plane_ledger_is_real_test.exs` used to require that every referenced
  path hold its recorded bytes *now*. That silently assumed **no path is ever
  referenced twice** — never guaranteed, true for ten entries only by accident,
  and false the moment step 2.6 re-ingested a bootstrap account over the same
  path. The assumption is now explicit and correct instead of implicit and wrong.

  Supersession is read from the **chain and nothing else**. There is no allowlist,
  no exception file, and no inspection of disk: a reference is superseded only
  because a later authorised entry names the same path. A read.
  """
  @spec evidence_timeline([entry()]) :: [evidence_ref()]
  def evidence_timeline(entries) when is_list(entries) do
    refs =
      Enum.flat_map(entries, fn e ->
        e
        |> Map.get("evidence")
        |> List.wrap()
        |> Enum.map(&%{path: &1["path"], sha256: &1["sha256"], seq: e["seq"]})
      end)

    latest = Enum.reduce(refs, %{}, &Map.update(&2, &1.path, &1.seq, fn s -> max(s, &1.seq) end))

    Enum.map(refs, &Map.put(&1, :state, if(&1.seq == latest[&1.path], do: :current, else: :superseded)))
  end

  @doc """
  The sha256 of an entry's canonical serialization, lower-case hex.

  Any `hash` key present is dropped first, so `hash_of(entry) == entry["hash"]`
  holds for a sound entry. A read.
  """
  @spec hash_of(map()) :: String.t()
  def hash_of(entry) when is_map(entry) do
    entry
    |> Map.delete("hash")
    |> Map.delete(:hash)
    |> canonical()
    |> then(&:crypto.hash(:sha256, &1))
    |> Base.encode16(case: :lower)
  end

  @doc """
  Canonical serialization: JSON with object keys sorted, so the bytes depend on
  content alone and never on map iteration order. A read.
  """
  @spec canonical(term()) :: binary()
  def canonical(term), do: IO.iodata_to_binary(cano(term))

  # -- canonical serialization ------------------------------------------------

  defp cano(nil), do: "null"
  defp cano(true), do: "true"
  defp cano(false), do: "false"
  defp cano(i) when is_integer(i), do: Integer.to_string(i)
  defp cano(f) when is_float(f), do: :erlang.float_to_binary(f, [:short])
  defp cano(b) when is_binary(b), do: JSON.encode!(b)
  defp cano(a) when is_atom(a), do: JSON.encode!(Atom.to_string(a))
  defp cano(l) when is_list(l), do: ["[", Enum.map_intersperse(l, ",", &cano/1), "]"]

  defp cano(m) when is_map(m) do
    pairs =
      m
      |> Enum.map(fn {k, v} -> {key(k), v} end)
      |> Enum.sort_by(&elem(&1, 0))

    ["{", Enum.map_intersperse(pairs, ",", fn {k, v} -> [JSON.encode!(k), ":", cano(v)] end), "}"]
  end

  defp key(k) when is_binary(k), do: k
  defp key(k) when is_atom(k), do: Atom.to_string(k)

  # -- construction -----------------------------------------------------------

  # CORRECTED 2026-07-25, Phase 3. `DATA-SPEC.md` §1 said `prior` may be null
  # "only for seq = 1", and this function enforced it. Both were wrong: it
  # confused THE LEDGER'S first entry with THIS SUBJECT'S first entry. Registering
  # a new gate as the fifth entry genuinely has no prior state.
  #
  # Supplying the right prior is the authoring module's job. The ledger's job is
  # chain integrity, and a null prior does not threaten it. The old rule was never
  # covered by a test, which is why it survived Phase 2.
  defp check_prior(_seq, nil), do: :ok
  defp check_prior(_seq, prior) when is_map(prior), do: :ok
  defp check_prior(seq, _), do: {:error, {:prior_must_be_a_map_or_nil_at_seq, seq}}

  defp body(seq, prev_hash, %Writ{} = writ, attrs) do
    with {:ok, utc} <- need(attrs, :utc, &is_binary/1),
         {:ok, unix_ns} <- need(attrs, :unix_ns, &is_integer/1),
         {:ok, transition} <- need(attrs, :transition, &is_binary/1),
         {:ok, resulting} <- need(attrs, :resulting, &is_map/1),
         {:ok, authorization} <- need(attrs, :authorization, &is_map/1),
         {:ok, evidence} <- need(attrs, :evidence, &is_list/1) do
      {:ok,
       %{
         "seq" => seq,
         "utc" => utc,
         "unix_ns" => unix_ns,
         "actor" => writ.actor,
         "role" => writ.role,
         "transition" => transition,
         "prior" => Map.get(attrs, :prior),
         "resulting" => resulting,
         "authorization" => authorization,
         "evidence" => evidence,
         "prev_hash" => prev_hash
       }}
    end
  end

  defp need(attrs, key, ok?) do
    case Map.fetch(attrs, key) do
      {:ok, v} -> if ok?.(v), do: {:ok, v}, else: {:error, {:wrong_type, key}}
      :error -> {:error, {:missing, key}}
    end
  end

  # -- verification -----------------------------------------------------------

  defp check_seq([]), do: :ok

  defp check_seq(entries) do
    observed = Enum.map(entries, & &1["seq"])

    if observed == Enum.to_list(1..length(entries)),
      do: :ok,
      else: {:error, {:seq_not_contiguous, observed}}
  end

  defp check_hashes(entries) do
    Enum.reduce_while(entries, :ok, fn e, _acc ->
      if hash_of(e) == e["hash"],
        do: {:cont, :ok},
        else: {:halt, {:error, {:hash_mismatch, e["seq"]}}}
    end)
  end

  defp check_chain([]), do: :ok

  defp check_chain([first | rest] = entries) do
    if first["prev_hash"] != nil do
      {:error, {:prev_hash_must_be_nil_at_seq, first["seq"]}}
    else
      rest
      |> Enum.zip(entries)
      |> Enum.reduce_while(:ok, fn {entry, predecessor}, _acc ->
        if entry["prev_hash"] == predecessor["hash"],
          do: {:cont, :ok},
          else: {:halt, {:error, {:prev_hash_mismatch, entry["seq"]}}}
      end)
    end
  end

  defp check_anchor(entries, opts) do
    expected_length = Keyword.get(opts, :length)
    expected_head = Keyword.get(opts, :head)
    actual_length = length(entries)

    actual_head =
      case List.last(entries) do
        nil -> nil
        entry -> entry["hash"]
      end

    cond do
      expected_length != nil and expected_length != actual_length ->
        {:error, {:length_mismatch, expected_length, actual_length}}

      expected_head != nil and expected_head != actual_head ->
        {:error, {:head_mismatch, expected_head, actual_head}}

      true ->
        :ok
    end
  end
end
