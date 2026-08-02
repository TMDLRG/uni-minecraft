defmodule SP.ControlPlane.Command do
  @moduledoc """
  The only writer.

  Every canonical mutation passes through here, is validated here, and lands as
  exactly one ledger entry recording who acted, under what authority, what the
  state was before, and what it is after. `SP.ControlPlane.Ledger.append/3`
  demands a writ this module issues and refuses anything else, and no other
  module in `lib/` may reference it — checked by reading the source, in
  `test/sp/control_plane/command_is_only_writer_test.exs`.

  ## The vocabulary grows only when a guard grows with it

  Phase 2 recorded `:register_gate` and `:note`. Phase 3 adds `:author_verdict`,
  and only because `SP.ControlPlane.Verdict` now enforces what it means: a
  registered gate, a controlled word, a named receipt, and a `PARTIAL` that says
  what holds. A command name without a guard behind it is a word nothing checks.

  Phase 6 adds `:cross_threshold`, and only because `SP.ControlPlane.Room` now
  enforces what it means: an ordered step, two keys from distinct parties with an
  operator among them, and a receipt that exists on disk.

  `:record_run` is deliberately still absent. `Run` records identity; nothing yet
  submits it as a canonical mutation.

  ## Two parties, on every mutation

  The actor who proposes a mutation may not be the party who authorises it
  (`authorization.granted_by`). This lives here rather than in `Verdict` because
  it is a property of **every** write, not only of adjudication. The comparison
  ignores case and surrounding whitespace: `"Claude"` and `"claude "` are not two
  people, and an audit trail that thinks otherwise proves nothing.

  ## A read never actuates

  The Door's law, inherited. Nothing in this namespace performs disk IO, spawns
  a process, or holds state between calls. A command takes a ledger and returns
  a new one; the caller decides what to do with it. No row is written to the
  canonical evidence file in this phase, and no module here even names it.
  """

  alias SP.ControlPlane.Command.Writ
  alias SP.ControlPlane.Ledger

  @commands [:register_gate, :author_verdict, :cross_threshold, :note]

  @doc "The commands this phase can record."
  @spec commands() :: [atom()]
  def commands, do: @commands

  @doc """
  Validate a command and append its entry.

      submit(ledger, %{
        command: :register_gate,
        actor: "claude", role: "agent",
        transition: "gate.registered",
        prior: nil, resulting: %{"gate" => "…"},
        authorization: %{"kind" => "pre_registration", "granted_by" => "michael", "ref" => "…"},
        evidence: [%{"path" => "…", "sha256" => "…"}],
        at: {"2026-07-25T14:00:00Z", 1_785_420_000_000_000_000}   # optional
      })

  `:at` pins the instant so a chain is byte-reproducible. Omitted, the wall clock
  is read.
  """
  @spec submit(Ledger.t(), map()) :: {:ok, Ledger.t()} | {:error, term()}
  def submit(%Ledger{} = ledger, attrs) when is_map(attrs) do
    with {:ok, command} <- command(attrs),
         {:ok, actor} <- string(attrs, :actor),
         {:ok, role} <- string(attrs, :role),
         :ok <- two_parties(actor, attrs),
         {:ok, transition} <- string(attrs, :transition),
         {:ok, resulting} <- map(attrs, :resulting),
         {:ok, authorization} <- authorization(attrs),
         {:ok, evidence} <- evidence(attrs),
         {utc, unix_ns} <- instant(attrs) do
      writ = %Writ{command: command, actor: actor, role: role}

      Ledger.append(ledger, writ, %{
        utc: utc,
        unix_ns: unix_ns,
        transition: transition,
        prior: Map.get(attrs, :prior),
        resulting: resulting,
        authorization: authorization,
        evidence: evidence
      })
    end
  end

  def submit(other, _attrs), do: {:error, {:not_a_ledger, other}}

  # -- validation -------------------------------------------------------------

  defp command(attrs) do
    case Map.fetch(attrs, :command) do
      {:ok, c} when c in @commands -> {:ok, c}
      {:ok, c} -> {:error, {:unknown_command, c}}
      :error -> {:error, {:missing, :command}}
    end
  end

  defp string(attrs, key) do
    case Map.fetch(attrs, key) do
      {:ok, v} when is_binary(v) and v != "" -> {:ok, v}
      {:ok, v} -> {:error, {:wrong_type, key, v}}
      :error -> {:error, {:missing, key}}
    end
  end

  defp map(attrs, key) do
    case Map.fetch(attrs, key) do
      {:ok, v} when is_map(v) -> {:ok, v}
      {:ok, v} -> {:error, {:wrong_type, key, v}}
      :error -> {:error, {:missing, key}}
    end
  end

  defp authorization(attrs) do
    with {:ok, auth} <- map(attrs, :authorization) do
      missing = Enum.reject(["kind", "granted_by"], &is_binary(Map.get(auth, &1)))

      cond do
        missing != [] -> {:error, {:authorization_missing, missing}}
        true -> co_signers(auth, Map.get(attrs, :actor))
      end
    end
  end

  # ADDED 2026-07-26, Phase 6 item 6.0, which found that `authorization` had a
  # single `granted_by` and an airlock needs TWO keys. The extension is OPTIONAL,
  # so every entry written before it stays valid and still verifies — additive was
  # the whole point.
  #
  # When present, each co-signer must be a distinct party and none may be the
  # actor: the same rule as `two_parties/2`, for the same reason.
  defp co_signers(auth, actor) do
    case Map.get(auth, "co_signers") do
      nil ->
        {:ok, auth}

      list when is_list(list) ->
        holders = Enum.map(list, &(is_map(&1) && &1["holder"]))

        cond do
          not Enum.all?(holders, &is_binary/1) ->
            {:error, {:co_signer_missing, :holder}}

          length(Enum.uniq(Enum.map(holders, &normalise/1))) != length(holders) ->
            {:error, {:co_signers_not_distinct, holders}}

          is_binary(actor) and normalise(actor) in Enum.map(holders, &normalise/1) and
              length(holders) < 2 ->
            {:error, {:cosigner_is_proposer, actor}}

          true ->
            {:ok, auth}
        end

      other ->
        {:error, {:wrong_type, :co_signers, other}}
    end
  end

  # The proposer may not be the co-signer. Compared on a normalised form, because
  # "Claude", "claude" and "claude " are one person.
  defp two_parties(actor, attrs) do
    granted_by =
      case Map.get(attrs, :authorization) do
        %{"granted_by" => g} when is_binary(g) -> g
        _ -> nil
      end

    cond do
      granted_by == nil -> :ok
      normalise(actor) == normalise(granted_by) -> {:error, {:cosigner_is_proposer, actor}}
      true -> :ok
    end
  end

  defp normalise(s) when is_binary(s), do: s |> String.trim() |> String.downcase()

  defp evidence(attrs) do
    case Map.fetch(attrs, :evidence) do
      {:ok, list} when is_list(list) ->
        bad =
          Enum.reject(list, fn e ->
            is_map(e) and is_binary(e["path"]) and is_binary(e["sha256"]) and
              Regex.match?(~r/^[0-9a-f]{64}$/, e["sha256"] || "")
          end)

        if bad == [],
          do: {:ok, list},
          else: {:error, {:evidence_needs_path_and_sha256, bad}}

      {:ok, other} ->
        {:error, {:wrong_type, :evidence, other}}

      :error ->
        {:error, {:missing, :evidence}}
    end
  end

  defp instant(attrs) do
    case Map.get(attrs, :at) do
      {utc, ns} when is_binary(utc) and is_integer(ns) ->
        {utc, ns}

      nil ->
        {DateTime.utc_now() |> DateTime.to_iso8601(), System.os_time(:nanosecond)}
    end
  end
end
