defmodule SP.ControlPlane.Recorder do
  @moduledoc """
  Append ONE entry to the persisted ledger, without rebuilding the ones already there.

  ## Why this exists (Phase 9, step 2.3)

  `scripts/control_plane_record_own_history.exs` records this programme's history by holding all seven
  entries as a LITERAL LIST and rebuilding the whole chain from `Ledger.new()` on every run. Each entry
  hashes its receipt from the file on disk, so the rebuilt chain only matches the stored one while every
  historical receipt stays byte-identical forever. Edit or reflow one receipt and the rebuild produces a
  different hash at that seq; `Store.persist/2` then correctly refuses with `would_rewrite_history_at_seq`,
  and the script becomes UNRUNNABLE — including for appending an unrelated new entry.

  That is 2.3's pre-registered falsifier, "it rebuilds the chain instead of appending", and it is not
  hypothetical: step 2.4 has to append Phases 6 and 7 to this very ledger, so the remediation would have
  jammed on its own second step.

  A recorder that must reproduce the past in order to write the future has confused REPLAY with APPEND. An
  append-only log is authoritative about what it already holds; the recorder's job is to add to it, not to
  re-derive it. So this LOADS what is stored, carries those entries as bytes, and appends exactly one.

  ## What it deliberately does not do

  It does not rewrite, reorder, or "correct" a stored entry — `Store.persist/2`'s prefix check still refuses
  that, and this module never tries. A wrong entry is superseded by a later one, never edited in place.
  """

  # @limitation cp.recorder.recorded-not-identity-safe
  #   what: `recorded?/2` answers "is there an entry with this transition", not "is THIS work recorded"
  #   why: every real entry so far shares the transition "phase.executed", so the question it can actually answer is coarser than the question a caller wants to ask.
  #   claim: adequate as a presence check, NOT as an identity check. Use `recorded_by/2` with a predicate when identity matters.
  #   proof: test/sp/control_plane/recorder_appends_not_rebuilds_test.exs
  alias SP.ControlPlane.{Command, Ledger, Store}

  @doc """
  Append one entry to the ledger in `dir`.

  Loads the stored chain (an absent store is an empty one — the first entry has to start somewhere),
  submits `attrs` THROUGH `Command`, and persists. Returns the seq written.

  ## Command is the only writer (F10)

  This module does not call the ledger writer itself. An earlier draft did, and the F10 guard caught it
  immediately — "no module in lib/ other than command.ex calls the ledger writer" — which is exactly the
  invariant that keeps the writ check, the two-party rule and the authorization check from being bypassable
  by a new module that means well. So the recorder submits, and `Command` decides.

  The stored entries are carried EXACTLY as loaded. Nothing recomputes them, so a historical receipt that
  has since been edited cannot block an unrelated append.
  """
  @spec append_one(Path.t(), map()) ::
          {:ok, %{seq: pos_integer(), total: non_neg_integer(), appended: non_neg_integer()}}
          | {:error, term()}
  def append_one(dir, attrs) when is_binary(dir) and is_map(attrs) do
    with {:ok, ledger} <- load_or_empty(dir),
         before = length(Ledger.entries(ledger)),
         {:ok, next} <- Command.submit(ledger, attrs),
         :ok <- Ledger.verify(next),
         {:ok, %{appended: appended, total: total}} <- Store.persist(dir, next) do
      {:ok, %{seq: before + 1, total: total, appended: appended}}
    end
  end

  @doc """
  The entries currently stored, as loaded. Used by callers that need to decide whether an entry is already
  recorded before appending it — asking is cheaper than a refused write, and far cheaper than a rebuild.
  """
  @spec stored(Path.t()) :: {:ok, [map()]} | {:error, term()}
  def stored(dir) do
    case load_or_empty(dir) do
      {:ok, ledger} -> {:ok, Ledger.entries(ledger)}
      other -> other
    end
  end

  @doc """
  True when an entry with this `transition` is already stored.

  CAUTION, measured on the real ledger 2026-07-27: `transition` is NOT a unique key there. All seven stored
  entries carry the same transition, `"phase.executed"`, so this answers "has anything of this KIND been
  recorded", never "has THIS step been recorded". Use `recorded_by/2` for identity. Kept because the kind
  question is still worth asking, and because silently making it mean something else would be worse.
  """
  @spec recorded?(Path.t(), String.t()) :: boolean()
  def recorded?(dir, transition) when is_binary(transition) do
    case stored(dir) do
      {:ok, entries} -> Enum.any?(entries, &(&1["transition"] == transition))
      _ -> false
    end
  end

  @doc """
  True when some stored entry satisfies `pred`.

  This is the identity question, and it takes a predicate because the ledger has no single identity field:
  what distinguishes one recorded phase from another lives in `resulting`, which differs by entry kind. Step
  2.6 ("every step marked done has EXACTLY one ledger entry") needs this rather than `recorded?/2` — keying
  on `transition` there would report every phase as already recorded and quietly skip the backfill.
  """
  @spec recorded_by(Path.t(), (map() -> boolean())) :: boolean()
  def recorded_by(dir, pred) when is_function(pred, 1) do
    case stored(dir) do
      {:ok, entries} -> Enum.any?(entries, pred)
      _ -> false
    end
  end

  # An absent store is an empty ledger, not an error: the first append has to be possible. Any OTHER load
  # failure propagates — a corrupt store must never be silently replaced by a fresh one, which would be
  # exactly the "rebuild" this module exists to avoid.
  defp load_or_empty(dir) do
    case Store.load(dir) do
      {:ok, ledger} -> {:ok, ledger}
      {:error, {:not_a_store, _}} -> {:ok, Ledger.new()}
      other -> other
    end
  end
end
