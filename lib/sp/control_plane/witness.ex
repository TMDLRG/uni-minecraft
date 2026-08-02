defmodule SP.ControlPlane.Witness do
  @moduledoc """
  Corroborates the local anchor against custodians in other failure domains.

  ## What Phase 4 left open

  Phase 4 proved that a local anchor cannot outrank a local writer: truncate
  `ledger.ndjson`, rewrite `anchor.json` to match, and the store attests clean.
  A test performs that attack and asserts it succeeds.

  A witness is a **second custodian somewhere else**. The attack now has to
  succeed everywhere at once, and each surviving copy convicts the others.

  ## Two properties, not one — a distinction the fleet forced

  Item 5.1 was planned around *"an anchor the writer cannot reach"*. Measuring the
  fleet showed that collapses two different things:

  * **unforgeable** — the writer cannot write there at all.
  * **tamper-evident** — the writer *can* write, but a rewrite is **visible** and
    prior history survives elsewhere.

  `git` is the second: a force-push is possible, and loud. `uni-lab-79740c`
  ("L2") is the first — measured 2026-07-26, with a negative control:

      L2   / uni-lab-79740c  ->  Permission denied (publickey,password)   port 22 OPEN
      chip / colony host     ->  OK                                       <-- writer CAN write

  Reachable to read, refused to write. The chip is recorded as the control on
  purpose: without a host that *accepts* the key, a refusal elsewhere could just
  mean a broken probe.

  So corroboration requires **two distinct domains AND at least one unforgeable
  custodian.** `git + L2` corroborates. `git + chip` does not — two domains, but
  nothing the writer cannot rewrite silently.

  ## The claim is `tamper_evident`, and there is deliberately nothing stronger

  L2's refusal is a **current configuration fact, not a structural law.** Add a
  THINKER key to its `authorized_keys` and the property ends silently, so
  `witness_probe.cjs` re-measures the refusal on every capture rather than
  trusting it once. `claim_level/0` returns `:tamper_evident`, and no function
  here returns anything stronger, because nothing on this fleet can deliver it.

  A test scans this file for the stronger word and fails if it appears — and it
  caught this very moduledoc on the first run, which is the second time in two
  phases a source-scan guard has convicted the documentation of the module it
  guards.

  ## A disagreement is never a bare boolean

  The Phase 1 lesson, for the third time: `equal = false` tells a reader nothing.
  Every finding carries **both sides**, the kind of disagreement, and a locator
  for going to look.

  **`:behind` and `:ahead` are candidate readings, not certainties.** From an
  anchor alone — a head and a count — a custodian at a different length could be
  lagging *or* forked at that length. Confirming which needs the chain itself.
  `:forked` at equal length is the one certainty, because two different heads at
  the same length cannot both be the same history.
  """

  alias SP.ControlPlane.Anchor

  @domains [:git, :offbox, :operator]

  @type custodian :: %{
          id: String.t(),
          domain: :git | :offbox | :operator,
          anchor: Anchor.t(),
          writer_reachable: boolean(),
          locator: String.t() | nil
        }

  @doc "What this module is allowed to claim. Deliberately not the stronger word."
  @spec claim_level() :: :tamper_evident
  def claim_level, do: :tamper_evident

  @doc "The failure domains a custodian may sit in."
  @spec domains() :: [atom()]
  def domains, do: @domains

  @doc """
  Build one custodian attestation.

  `:writer_reachable` is **required** and never defaulted — whether the ledger's
  writer can put bytes here unattended is the entire question, and a default
  would answer it by accident.
  """
  @spec custodian(String.t(), atom(), Anchor.t(), keyword()) :: {:ok, custodian()} | {:error, term()}
  def custodian(id, domain, %Anchor{} = anchor, opts) when is_binary(id) and is_list(opts) do
    cond do
      domain not in @domains ->
        {:error, {:unknown_domain, domain}}

      not is_boolean(Keyword.get(opts, :writer_reachable)) ->
        {:error, {:missing, :writer_reachable, "independence must be stated, never defaulted"}}

      true ->
        {:ok,
         %{
           id: id,
           domain: domain,
           anchor: anchor,
           writer_reachable: Keyword.fetch!(opts, :writer_reachable),
           locator: Keyword.get(opts, :locator, default_locator(id))
         }}
    end
  end

  def custodian(_id, _domain, other, _opts), do: {:error, {:not_an_anchor, other}}

  # ── item 7.10: reading a CAPTURE, which is a measurement with an expiry ─────

  # Only :corroborated is a pass. The other four are outcomes to report, not
  # absences to skip past.
  @readings [:corroborated, :blocked_unreachable, :compromised, :stale, :absent]

  # An hour. The bound is declared rather than buried in an inequality so it can be
  # argued with. It comes from the capture's own claim_note: the off-box refusal is
  # "a CURRENT CONFIGURATION FACT, not a structural law ... which is why it is
  # re-measured on every capture". If it is re-measured on every capture, the age of
  # the capture is exactly what decides whether it is evidence about now.
  @freshness_seconds 3600

  @doc "The five readings a capture can have. Four of them are not a pass."
  @spec readings() :: [atom()]
  def readings, do: @readings

  @doc """
  The readings that count as corroboration. Exactly one.

  Named as a list so a caller cannot quietly widen it with an `or` — widening it is
  the whole failure this item exists to prevent.
  """
  @spec corroborating() :: [atom()]
  def corroborating, do: [:corroborated]

  @doc "How old a capture may be and still be a measurement rather than a memory."
  @spec freshness_seconds() :: pos_integer()
  def freshness_seconds, do: @freshness_seconds

  @doc """
  Classify a witness capture **as of a given moment**.

  ## Why the moment is an argument

  This reads no clock and no disk. A capture is a *measurement*, and a measurement
  has an expiry; the caller supplies the instant it is being read at, so a fixture
  can tell you exactly what was concluded and why.

  ## The five readings

  | reading | meaning |
  |-|-|
  | `:corroborated` | reachable, refused the writer, and fresh — **the only pass** |
  | `:blocked_unreachable` | nobody could read it. Not a witness, **and not a code defect** |
  | `:compromised` | reachable, and the writer **can** write there |
  | `:stale` | older than `freshness_seconds/0`; a memory, not a measurement |
  | `:absent` | no off-box custodian in the capture at all |

  **`:blocked_unreachable` and `:compromised` never collapse.** *"I could not look"*
  and *"I looked and the writer can get in"* are opposite findings — the first says
  nothing, the second says the witness has stopped being one.

  Staleness is checked **first**, because a capture that is out of date cannot
  support any claim about the present, however good it looked when it was taken.

  A record's own `qualifies_as_witness` flag is **ignored**. A capture that can talk
  its way into corroboration is not evidence.
  """
  @spec reading(map(), DateTime.t()) :: atom()
  def reading(capture, %DateTime{} = now) when is_map(capture) do
    cond do
      not fresh?(capture, now) -> :stale
      true -> classify(offbox_custodian(capture))
    end
  end

  @doc """
  `{:ok, claim_level}` only when the off-box reading supports it.

  The two-domain claim is what the whole witness exists to produce, so it is the one
  place a stale or unreachable reading must not be able to buy anything. Refuses with
  the reading as the reason.
  """
  @spec two_domain_claim(map(), DateTime.t()) :: {:ok, atom()} | {:error, term()}
  def two_domain_claim(capture, %DateTime{} = now) when is_map(capture) do
    case reading(capture, now) do
      :corroborated -> {:ok, claim_level()}
      other -> {:error, {other, "the off-box reading does not support a two-domain claim"}}
    end
  end

  defp offbox_custodian(capture) do
    capture
    |> Map.get("custodians", [])
    |> Enum.find(&(is_map(&1) and Map.get(&1, "domain") == "offbox"))
  end

  # Absent is not unreachable: nobody DECLARED a custodian, and nobody could REACH
  # one, are different findings. The same distinction the node contract makes.
  defp classify(nil), do: :absent
  defp classify(%{"port_open" => true, "writer_reachable" => true}), do: :compromised
  defp classify(%{"port_open" => true, "writer_reachable" => false}), do: :corroborated
  defp classify(_could_not_read), do: :blocked_unreachable

  # A capture timestamped after the moment it is read is not maximally fresh — it is
  # unusable, because it cannot be a measurement of a past that had not happened.
  defp fresh?(capture, now) do
    case capture |> Map.get("captured_at", "") |> DateTime.from_iso8601() do
      {:ok, at, _} ->
        age = DateTime.diff(now, at, :second)
        age >= 0 and age <= @freshness_seconds

      _ ->
        false
    end
  end

  @doc """
  Corroborate `local` against its custodians.

  Refuses on too few domains, on no unforgeable custodian, and on any
  disagreement — each with the detail needed to act.
  """
  @spec corroborate(Anchor.t(), [custodian()]) :: {:ok, map()} | {:error, term()}
  def corroborate(%Anchor{} = local, custodians) when is_list(custodians) do
    with :ok <- enough_domains(custodians),
         :ok <- some_unforgeable(custodians),
         :ok <- all_agree(local, custodians) do
      {:ok,
       %{
         level: :corroborated,
         head: local.head,
         length: local.length,
         domains: custodians |> Enum.map(& &1.domain) |> Enum.uniq() |> Enum.sort(),
         custodians: length(custodians),
         claim_level: claim_level()
       }}
    end
  end

  # -- internals --------------------------------------------------------------

  defp enough_domains(custodians) do
    domains = custodians |> Enum.map(& &1.domain) |> Enum.uniq() |> Enum.sort()

    if length(domains) >= 2,
      do: :ok,
      else: {:error, {:insufficient_domains, domains}}
  end

  # Two domains the writer owns are two copies, not two custodians.
  defp some_unforgeable(custodians) do
    if Enum.any?(custodians, &(&1.writer_reachable == false)),
      do: :ok,
      else: {:error, {:no_unforgeable_custodian, custodians |> Enum.map(& &1.id) |> Enum.sort()}}
  end

  defp all_agree(local, custodians) do
    case Enum.flat_map(custodians, &finding(local, &1)) do
      [] -> :ok
      findings -> {:error, {:disagreement, findings}}
    end
  end

  defp finding(local, c) do
    theirs = c.anchor

    if theirs.head == local.head and theirs.length == local.length do
      []
    else
      [
        %{
          custodian: c.id,
          domain: c.domain,
          expected: %{head: local.head, length: local.length},
          found: %{head: theirs.head, length: theirs.length},
          kind: kind(local, theirs),
          locator: c.locator
        }
      ]
    end
  end

  # Length first, because at equal length two different heads cannot be the same
  # history — that one is certain. A difference in length is a CANDIDATE reading;
  # telling lag from a fork at that length needs the chain, not the anchor.
  defp kind(local, theirs) do
    cond do
      theirs.length < local.length -> :behind
      theirs.length > local.length -> :ahead
      true -> :forked
    end
  end

  defp default_locator("git"), do: "git rev-parse HEAD"
  defp default_locator("offbox:" <> host), do: "read the anchor on #{host} via the approval-gated MCP"
  defp default_locator(id), do: id
end
