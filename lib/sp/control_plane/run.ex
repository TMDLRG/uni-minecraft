defmodule SP.ControlPlane.Run do
  @moduledoc """
  An immutable run: what was run, on what, with what, when — and what it may
  therefore be used for.

  ## Identity is not the record

  `PHASE-4.md` item 4.3 pre-registered *"the same run twice produces
  byte-identical canonical bytes"*. That is **false and must stay false**: a run
  record carries wall-clock start and end, and two executions genuinely happen at
  different moments. A record that hid that would be lying.

  So there are two things, and they are kept apart:

  * **identity** — `code_identity`, `env_identity`, `inputs`, `params`, `seeds`,
    `planned_n`, `stopping_rule`. Hashed into `run_id`. Two runs of the same
    thing share it.
  * **record** — the times, the exit code, the outputs, `actual_n`. These differ
    between executions, and they must.

  **`planned_n` and `stopping_rule` are in the identity on purpose.**
  `CLAUDE.md`: *"never increase replicates after seeing a width."* If either were
  a free field, a short run could be relabelled complete, or a stopping rule
  declared once the numbers were in. Because they are hashed, doing either
  **changes what run this is** — the laundering leaves a mark.

  ## The status vocabulary

      NOT_RUN · PARTIAL_NOT_ESTABLISHED · STOPPED_BY_RULE · COMPLETE · OVERRUN · FAILED_RUN

  None of them is a score, and none of them is `ELIGIBLE`. The flagellum's
  `status.py` collapsed `actual_n > planned_n` silently into `ELIGIBLE` with no
  overrun flag and no test; these six words exist so that *"we did not run this"*,
  *"we stopped early"*, *"we ran more than we said"* and *"it crashed"* cannot be
  flattened into one.

  **`FAILED_RUN` outranks everything.** A crash is not a scientific negative, and
  a system that records them the same way manufactures evidence.

  ## Three refusals that come from real defects

  * `may_score?/1` refuses when convergence is **false or undeclared**. The
    flagellum's `fit.py` stored `res.success` and never read it; `compare.py`
    scored regardless. An absent flag is not success.
  * `score_to/3` writes **nothing** when scoring is refused. A halted run leaves
    no artifact to be mistaken for a result later.
  * `aggregate/2` refuses mismatched lengths **before** any mean. `score.py`'s
    bare `zip(per_event_nlpd, motor_ids)` truncated silently. It also refuses a
    repeated unit id: frames are not independent replicates.
  """

  @identity_keys [:code_identity, :env_identity, :inputs, :params, :seeds, :planned_n, :stopping_rule]
  @required_identity [:code_identity, :env_identity, :inputs, :params, :seeds, :planned_n]
  @required_execution [:started_utc, :started_unix_ns, :ended_utc, :ended_unix_ns, :exit_code]

  @statuses [:NOT_RUN, :PARTIAL_NOT_ESTABLISHED, :STOPPED_BY_RULE, :COMPLETE, :OVERRUN, :FAILED_RUN]

  @type t :: %{required(atom()) => term()}

  @doc "Every status this module can record. None is a score."
  @spec statuses() :: [atom()]
  def statuses, do: @statuses

  @doc "Build and validate an immutable run."
  @spec new(map()) :: {:ok, t()} | {:error, term()}
  def new(attrs) when is_map(attrs) do
    with :ok <- required(attrs, @required_identity),
         :ok <- required(attrs, @required_execution),
         :ok <- counts(attrs),
         :ok <- outputs(attrs) do
      identity = Map.take(attrs, @identity_keys)

      run =
        attrs
        |> Map.put_new(:actual_n, 0)
        |> Map.put_new(:outputs, [])
        |> Map.put(:run_id, digest(identity))

      {:ok, run}
    end
  end

  @doc "Canonical bytes for the whole record — identity AND execution. A read."
  @spec canonical(t()) :: binary()
  def canonical(run), do: SP.ControlPlane.Ledger.canonical(Map.delete(run, :run_id))

  @doc """
  The run's status. `FAILED_RUN` outranks everything; a crash is not a
  scientific negative. A read.
  """
  @spec status(t()) :: atom()
  def status(%{exit_code: code}) when code != 0, do: :FAILED_RUN

  def status(run) do
    planned = run[:planned_n]
    actual = run[:actual_n] || 0

    cond do
      actual == 0 -> :NOT_RUN
      actual > planned -> :OVERRUN
      actual == planned -> :COMPLETE
      substantive_rule?(run[:stopping_rule]) -> :STOPPED_BY_RULE
      true -> :PARTIAL_NOT_ESTABLISHED
    end
  end

  @doc """
  `:ok`, or `{:flagged, detail}` when the run's status is one a reader must not
  skim past. An overrun is not a bonus. A read.
  """
  @spec flag(t()) :: :ok | {:flagged, map()}
  def flag(run) do
    case status(run) do
      :OVERRUN ->
        {:flagged, %{status: :OVERRUN, planned_n: run[:planned_n], actual_n: run[:actual_n]}}

      :PARTIAL_NOT_ESTABLISHED ->
        {:flagged, %{status: :PARTIAL_NOT_ESTABLISHED, planned_n: run[:planned_n], actual_n: run[:actual_n]}}

      _ ->
        :ok
    end
  end

  @doc """
  May this run be scored? Refuses a crash, and refuses convergence that is false
  **or undeclared** — an absent flag is not success. A read.
  """
  @spec may_score?(t()) :: :ok | {:error, term()}
  def may_score?(%{exit_code: code}) when code != 0, do: {:error, {:failed_run, :exit_code, code}}

  def may_score?(run) do
    case Map.get(run, :converged) do
      true -> :ok
      false -> {:error, {:not_converged, run[:run_id]}}
      nil -> {:error, {:convergence_undeclared, run[:run_id]}}
      other -> {:error, {:convergence_not_a_boolean, other}}
    end
  end

  @doc """
  Score into `dir`, or refuse and write nothing. `fun` is only called once
  `may_score?/1` has passed — a halted run leaves no artifact behind.
  """
  @spec score_to(t(), Path.t(), (-> map())) :: {:ok, Path.t()} | {:error, term()}
  def score_to(run, dir, fun) when is_function(fun, 0) do
    # Phase 9 step 2.1: the filename is handed to Store SEPARATELY from the directory, so containment is
    # checkable. Previously this joined them here and passed one opaque path, which meant a run_id carrying
    # `..` escaped `dir` and nothing was in a position to notice. Store now refuses such a name and returns
    # the refusal, which propagates to the caller rather than being written and reported as success.
    # may_score?/1 stays FIRST and `fun` is still only called after it passes — a halted run must leave no
    # artifact behind, and reordering these would write the artifact before deciding it was allowed.
    with :ok <- may_score?(run),
         {:ok, path} <-
           SP.ControlPlane.Store.write_artifact(dir, "score_#{run[:run_id]}.json", JSON.encode!(fun.())) do
      {:ok, path}
    end
  end

  @doc """
  Aggregate scores against their unit ids. Refuses mismatched lengths **before**
  any mean, refuses empty input, and refuses a repeated unit id. A read.
  """
  @spec aggregate([number()], [String.t()]) :: {:ok, map()} | {:error, term()}
  def aggregate(scores, ids) when is_list(scores) and is_list(ids) do
    cond do
      length(scores) != length(ids) ->
        {:error, {:length_mismatch, %{scores: length(scores), ids: length(ids)}}}

      scores == [] ->
        {:error, {:empty_aggregate, "a mean over nothing is not zero"}}

      length(Enum.uniq(ids)) != length(ids) ->
        {:error, {:duplicate_unit_ids, ids -- Enum.uniq(ids)}}

      true ->
        {:ok, %{n: length(scores), mean: Enum.sum(scores) / length(scores)}}
    end
  end

  # -- internals --------------------------------------------------------------

  defp digest(identity) do
    identity
    |> SP.ControlPlane.Ledger.canonical()
    |> then(&:crypto.hash(:sha256, &1))
    |> Base.encode16(case: :lower)
  end

  defp required(attrs, keys) do
    case Enum.reject(keys, &Map.has_key?(attrs, &1)) do
      [] -> :ok
      [key | _] -> {:error, {:missing, key}}
    end
  end

  defp counts(attrs) do
    planned = Map.get(attrs, :planned_n)
    actual = Map.get(attrs, :actual_n, 0)

    cond do
      not (is_integer(planned) and planned >= 0) -> {:error, {:planned_n_must_be_a_count, planned}}
      not (is_integer(actual) and actual >= 0) -> {:error, {:actual_n_must_be_a_count, actual}}
      true -> :ok
    end
  end

  defp outputs(attrs) do
    list = Map.get(attrs, :outputs, [])

    cond do
      not is_list(list) ->
        {:error, {:outputs_must_be_a_list, list}}

      Enum.all?(list, &content_addressed?/1) ->
        :ok

      true ->
        {:error, {:outputs_must_carry_path_and_sha256, list}}
    end
  end

  defp content_addressed?(o) do
    is_map(o) and is_binary(o["path"]) and is_binary(o["sha256"]) and
      Regex.match?(~r/^[0-9a-f]{64}$/, o["sha256"])
  end

  # "yes", "TBD" and "n/a" are refusals dressed as rules. A stopping rule states
  # the condition under which the run stops, so it has words in it.
  defp substantive_rule?(rule) when is_binary(rule) do
    trimmed = String.trim(rule)
    String.length(trimmed) >= 8 and length(String.split(trimmed, ~r/\s+/, trim: true)) >= 3
  end

  defp substantive_rule?(_), do: false
end
