defmodule SP.ControlPlane.Store do
  @moduledoc """
  Durable, append-only persistence for a ledger and its anchor.

  **The only module in this namespace that touches disk.** That is asserted by a
  source scan in `test/sp/control_plane/store_append_only_test.exs`, so a second
  writer cannot appear quietly.

  ## Why this exists

  On 2026-07-25 the Control Plane made its first authorised write to canonical
  evidence and **could not record that write in its own ledger**, because the
  ledger had a hash-chained structure and nowhere to live. Its audit trail was a
  git commit and a receipt: the mechanism this body exists to replace.

  ## Two files, both plain and readable

      <dir>/ledger.ndjson   one canonical entry per line, append-only
      <dir>/anchor.json     the head and length, held OUTSIDE the chain
      <dir>/objects/<sha>   the bytes this chain has attested, addressed by content

  A human can open all of them. Evidence you need a tool to read is evidence you
  will stop reading.

  ## Evidence is content-addressed, and that was bought (Phase 9 step 2.7)

  The chain referenced evidence by **path**, and a path is mutable. Step 2.6
  re-ingested a bootstrap account over the path an earlier entry already named,
  and the ledger was then unable to produce bytes it had itself attested — one
  file, two recorded hashes, one of them permanently unresolvable.

  `objects/` is the repair: every reference is backed by an immutable object named
  by its own sha256, so superseded evidence stays retrievable forever. See
  `put_object/2`, `object/2` and `audit_evidence/3`. The rule that came out of it:
  **an append-only record must never point at a mutable path.**

  ## Append-only is enforced before the write, not detected after

  `persist/2` reads what is already on disk and **refuses** unless those bytes
  are an exact prefix of the ledger being persisted. A shorter ledger, a
  divergent history, or a file that grew behind its back all refuse — and a
  refused write writes nothing at all. The refusal names the `seq` where the two
  histories part company.

  ## Line terminators come from the LAST line

  Bought with a rollback. Appending to the canonical gate ledger — 58 `CRLF`
  lines, 148 `LF`, ending on `LF` — an earlier appender asked whether `CRLF`
  appeared *anywhere*, chose the minority terminator, and left an unauthorised
  blank line in canonical evidence. What matters when appending is the terminator
  of the **last line**. Nothing else.

  (This module deliberately does not name that file. A test forbids it, because a
  module that names the canonical evidence file is one edit away from writing to
  it — and that guard caught this very moduledoc.)

  ## What the anchor does and does not buy

  The anchor persists beside the ledger, so a reload that has lost its tail fails
  to attest — truncation is caught **in practice**, across restarts, for loss,
  corruption and accident.

  It is **not** proof against a tamperer with write access to this directory, who
  can truncate the ledger and rewrite the anchor to match. Nothing local can be.
  That needs an anchor the ledger's writer cannot reach — a second machine, a
  signed feed, a witness. A test performs exactly that attack and asserts it
  succeeds, so the limit stays visible.
  """

  # @limitation cp.anchor.local-writer
  #   what: the anchor is NOT proof against a tamperer with write access to the store directory
  #   why: such a tamperer can truncate the ledger and rewrite the anchor to match, in one move. Nothing held on the same disk as the writer can outrank the writer.
  #   claim: caught in practice for LOSS, corruption, truncation and accident, across restarts. NOT caught for deliberate tampering.
  #   proof: test/sp/control_plane/store_anchor_in_practice_test.exs:145
  alias SP.ControlPlane.{Anchor, Ledger}

  @ledger_file "ledger.ndjson"
  @anchor_file "anchor.json"
  @objects_dir "objects"

  @doc "Where the ledger lives inside a store directory."
  @spec ledger_path(Path.t()) :: Path.t()
  def ledger_path(dir), do: Path.join(dir, @ledger_file)

  @doc "Where the anchor lives inside a store directory."
  @spec anchor_path(Path.t()) :: Path.t()
  def anchor_path(dir), do: Path.join(dir, @anchor_file)

  @doc """
  Append everything in `ledger` that is not already on disk, and refresh the
  anchor. Refuses if the stored bytes are not a prefix of this ledger.
  """
  @spec persist(Path.t(), Ledger.t()) ::
          {:ok, %{appended: non_neg_integer(), total: non_neg_integer()}} | {:error, term()}
  def persist(dir, %Ledger{} = ledger) do
    entries = Ledger.entries(ledger)
    File.mkdir_p!(dir)
    path = ledger_path(dir)
    existing = if File.exists?(path), do: File.read!(path), else: ""
    stored = split(existing)

    with :ok <- prefix_check(stored, entries) do
      tail = Enum.drop(entries, length(stored))
      eol = terminator(existing)
      separator = if existing == "" or String.ends_with?(existing, "\n"), do: "", else: eol
      appended = Enum.map_join(tail, "", &(Ledger.canonical(&1) <> eol))

      # An initialised store with no entries is a real state, not an absent one:
      # the file is created even when there is nothing yet to put in it.
      if appended != "" or separator != "" or not File.exists?(path) do
        File.write!(path, existing <> separator <> appended)
      end

      write_anchor(dir, entries)
      {:ok, %{appended: length(tail), total: length(entries)}}
    end
  end

  @doc "Read a ledger back. Refuses a store that is absent, unparseable or unverifiable. A read."
  @spec load(Path.t()) :: {:ok, Ledger.t()} | {:error, term()}
  def load(dir) do
    path = ledger_path(dir)

    if File.exists?(path) do
      with {:ok, entries} <- decode_lines(split(File.read!(path))) do
        Ledger.from_entries(entries)
      end
    else
      {:error, {:not_a_store, dir}}
    end
  end

  @doc "The anchor held beside the ledger. A read."
  @spec anchor(Path.t()) :: {:ok, Anchor.t()} | {:error, term()}
  def anchor(dir) do
    path = anchor_path(dir)

    cond do
      not File.exists?(path) -> {:error, {:missing_anchor, path}}
      true -> Anchor.decode(File.read!(path))
    end
  end

  @doc """
  Load the store and attest it against the anchor held beside it.

  `{:ok, :anchored}` only when the chain is internally sound **and** it ends
  where the stored anchor says it ends. An absent anchor is a refusal, never a
  pass. A read.
  """
  @spec attest(Path.t()) :: {:ok, :anchored} | {:error, term()}
  def attest(dir) do
    with {:ok, ledger} <- load(dir),
         {:ok, a} <- anchor(dir) do
      Anchor.attest(ledger, a)
    end
  end

  @doc """
  Write one result artifact.

  Separate from `persist/2` on purpose: an artifact is a **product of a run**, not
  a ledger entry, and it is not append-only — a rerun may legitimately replace
  one. It lives here only because disk IO is confined to this module, which is
  enforced by a source scan, not by convention.

  It is `SP.ControlPlane.Run.score_to/3` that decides whether an artifact may be
  written at all. A halted run never reaches this function.

  ## Containment (Phase 9 step 2.1)

  The earlier `write_artifact/2` took a whole path and wrote it — `File.mkdir_p!` on its dirname, then
  `File.write!`. It had no notion of a declared directory, so it could not tell an artifact from an escape.
  Its only caller builds `Path.join(dir, "score_\#{run_id}.json")`, which means a `run_id` carrying `..`
  walked out of `dir` and an absolute path ignored `dir` entirely. That was 2.1's pre-registered falsifier,
  "a path traversal escapes the declared directory", and it held.

  It now takes the directory and the FILENAME separately, so containment is expressible at all, and it
  refuses rather than raises — a caller has to be able to handle a refusal. Two independent checks, both
  required: the name must be a plain filename (no separator, not `.`/`..`/empty), AND the expanded result
  must still sit under the expanded root. Either alone would be adequate on a well-behaved input; together
  they survive the ones that are not.
  """
  @spec write_artifact(Path.t(), String.t(), iodata()) ::
          {:ok, Path.t()} | {:error, {:escapes_declared_directory, map()}}
  def write_artifact(dir, name, contents) when is_binary(dir) and is_binary(name) do
    with :ok <- plain_filename(name),
         {:ok, path} <- within(dir, name) do
      File.mkdir_p!(Path.dirname(path))
      File.write!(path, contents)
      {:ok, path}
    end
  end

  # -- the content-addressed evidence store (Phase 9 step 2.7) ----------------

  @doc "Where this store keeps the bytes it has attested, addressed by their own sha256."
  @spec objects_path(Path.t()) :: Path.t()
  def objects_path(dir), do: Path.join(dir, @objects_dir)

  @doc "Where one object lives. Raises on anything that is not a lower-case 64-hex content address."
  @spec object_path(Path.t(), String.t()) :: Path.t()
  def object_path(dir, sha256) when is_binary(sha256) do
    if not content_address?(sha256) do
      raise ArgumentError, "not a content address: #{inspect(sha256)}"
    end

    Path.join(objects_path(dir), sha256)
  end

  @doc """
  Put bytes into the evidence store under their own sha256.

  Idempotent, and **never overwrites**. If an object is already present it is read
  back and compared: identical bytes are a no-op (`wrote: false`), and different
  bytes are `{:error, {:corrupt_object, sha}}` with the file left exactly as found.

  A store that silently repairs itself is not evidence — the repair would be
  indistinguishable from the tampering it was hiding. So it refuses and says so.
  """
  @spec put_object(Path.t(), iodata()) ::
          {:ok, %{sha256: String.t(), path: Path.t(), wrote: boolean()}} | {:error, term()}
  def put_object(dir, contents) do
    bytes = IO.iodata_to_binary(contents)
    sha256 = digest(bytes)
    path = object_path(dir, sha256)

    cond do
      not File.exists?(path) ->
        File.mkdir_p!(objects_path(dir))
        File.write!(path, bytes)
        {:ok, %{sha256: sha256, path: path, wrote: true}}

      File.read!(path) == bytes ->
        {:ok, %{sha256: sha256, path: path, wrote: false}}

      true ->
        {:error, {:corrupt_object, sha256}}
    end
  end

  @doc """
  Read attested bytes back by hash, **verifying on the way out**.

  An object that no longer hashes to the name it is filed under is refused, not
  served. A read.
  """
  @spec object(Path.t(), String.t()) :: {:ok, binary()} | {:error, term()}
  def object(dir, sha256) when is_binary(sha256) do
    cond do
      not content_address?(sha256) ->
        {:error, {:not_a_content_address, sha256}}

      not File.exists?(object_path(dir, sha256)) ->
        {:error, {:no_such_object, sha256}}

      true ->
        bytes = File.read!(object_path(dir, sha256))
        if digest(bytes) == sha256, do: {:ok, bytes}, else: {:error, {:corrupt_object, sha256}}
    end
  end

  @doc """
  Audit every evidence reference in `entries` against this store and the working
  tree rooted at `root`. A read; it writes nothing and repairs nothing.

  Two properties, separated on purpose because they are two different things, and
  **both** enforced:

  1. **Retrievability**, for every reference whether current or superseded — the
     bytes must be in the object store and rehash. An append-only chain that
     cannot produce evidence it has already attested is making a claim, not
     keeping a record.
  2. **The live path**, for the reference that is CURRENT at that path — the file
     must exist there and rehash. A superseded reference is not checked at its
     path, because a later entry in the chain says newer bytes live there now.

  Escaping (2) therefore takes a real entry appended through
  `SP.ControlPlane.Command` — two-party authorised, chained and anchored — with
  the new bytes both on disk and stored. That is not an exemption; that is the
  ledger recording that evidence changed.
  """
  @spec audit_evidence(Path.t(), Path.t(), [Ledger.entry()]) ::
          {:ok, %{checked: non_neg_integer(), superseded: non_neg_integer(), faults: []}}
          | {:error, [tuple()]}
  def audit_evidence(dir, root, entries) when is_list(entries) do
    timeline = Ledger.evidence_timeline(entries)
    faults = Enum.flat_map(timeline, &(retrieval_faults(dir, &1) ++ live_faults(root, &1)))

    report = %{
      checked: length(timeline),
      superseded: Enum.count(timeline, &(&1.state == :superseded)),
      faults: faults
    }

    if faults == [], do: {:ok, report}, else: {:error, faults}
  end

  defp retrieval_faults(dir, ref) do
    case object(dir, ref.sha256) do
      {:ok, _bytes} -> []
      {:error, _why} -> [{:unretrievable, ref.sha256, ref.path}]
    end
  end

  defp live_faults(_root, %{state: :superseded}), do: []

  defp live_faults(root, ref) do
    abs = Path.join(root, ref.path)

    if File.exists?(abs) do
      actual = digest(File.read!(abs))
      if actual == ref.sha256, do: [], else: [{:live_mismatch, ref.path, ref.sha256, actual}]
    else
      [{:live_missing, ref.path}]
    end
  end

  defp content_address?(s), do: is_binary(s) and s =~ ~r/^[0-9a-f]{64}$/

  defp digest(bytes), do: :crypto.hash(:sha256, bytes) |> Base.encode16(case: :lower)

  defp plain_filename(name) do
    cond do
      name in ["", ".", ".."] ->
        {:error, {:escapes_declared_directory, %{name: name, why: "not a filename"}}}

      String.contains?(name, ["/", "\\"]) ->
        {:error, {:escapes_declared_directory, %{name: name, why: "contains a path separator"}}}

      true ->
        :ok
    end
  end

  # Independent of the check above: expand both sides and require descent. `Path.relative_to/2` returns the
  # path unchanged when it is NOT under the root, which is the condition we refuse on.
  defp within(dir, name) do
    root = Path.expand(dir)
    path = Path.expand(Path.join(root, name))
    rel = Path.relative_to(path, root)

    if path == root or rel == path or String.starts_with?(rel, "..") do
      {:error, {:escapes_declared_directory, %{dir: root, name: name, resolved: path}}}
    else
      {:ok, path}
    end
  end

  # -- internals --------------------------------------------------------------

  defp split(""), do: []
  defp split(raw), do: String.split(raw, ~r/\r?\n/, trim: true)

  # The terminator of the LAST line. Not the most common; not "does CRLF occur".
  defp terminator(""), do: "\n"
  defp terminator(raw), do: if(String.ends_with?(raw, "\r\n"), do: "\r\n", else: "\n")

  defp prefix_check(stored, entries) do
    cond do
      length(stored) > length(entries) ->
        {:error, {:would_truncate, %{stored: length(stored), given: length(entries)}}}

      true ->
        stored
        |> Enum.zip(entries)
        |> Enum.with_index(1)
        |> Enum.reduce_while(:ok, fn {{line, entry}, seq}, _acc ->
          if line == Ledger.canonical(entry),
            do: {:cont, :ok},
            else: {:halt, {:error, {:would_rewrite_history_at_seq, seq}}}
        end)
    end
  end

  defp decode_lines(lines) do
    lines
    |> Enum.with_index(1)
    |> Enum.reduce_while({:ok, []}, fn {line, idx}, {:ok, acc} ->
      case JSON.decode(line) do
        {:ok, entry} when is_map(entry) -> {:cont, {:ok, [entry | acc]}}
        _ -> {:halt, {:error, {:unparseable_line, idx}}}
      end
    end)
    |> case do
      {:ok, reversed} -> {:ok, Enum.reverse(reversed)}
      error -> error
    end
  end

  defp write_anchor(dir, entries) do
    case Anchor.of_entries(entries) do
      {:ok, a} -> File.write!(anchor_path(dir), Anchor.encode(a))
      {:error, :empty_ledger} -> :ok
    end
  end
end
