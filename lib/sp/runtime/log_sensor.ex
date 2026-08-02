defmodule SP.Runtime.LogSensor do
  @moduledoc """
  A tiny `:logger` handler that COUNTS error/warning events on the node, so the Producer UNI
  can SENSE its own system health (the `error_rate` modality) instead of being blind to it.

  Pure BEAM — `:counters` (lock-free concurrent counters) + `:logger` + `:persistent_term`.
  No foreign layer, no I/O, no output change: the handler only increments two counters and the
  producer drains them each beat. Installed lazily by the Producer (idempotent), so there is no
  application-startup coupling. This is the "all the logs" sensor the show-runner reads.
  """
  @key __MODULE__
  @id :sp_log_sensor

  @errors_idx 1
  @warns_idx 2

  @doc "Install the counting `:logger` handler once. Idempotent and crash-safe."
  def install do
    ensure_ref()

    case :logger.add_handler(@id, __MODULE__, %{level: :warning}) do
      :ok -> :ok
      {:error, {:already_existing, _}} -> :ok
      _ -> :ok
    end
  catch
    _, _ -> :ok
  end

  @doc "Read AND reset the counts accumulated since the last drain: `%{errors: n, warns: n}`."
  def drain do
    case :persistent_term.get(@key, nil) do
      nil ->
        %{errors: 0, warns: 0}

      ref ->
        e = :counters.get(ref, @errors_idx)
        w = :counters.get(ref, @warns_idx)
        # subtract exactly what we read, so concurrent increments between get and reset survive.
        :counters.sub(ref, @errors_idx, e)
        :counters.sub(ref, @warns_idx, w)
        %{errors: e, warns: w}
    end
  end

  # `:logger` handler callback. MUST be cheap and MUST NOT log (no recursion) — it only bumps a
  # counter. error/critical/alert/emergency ⇒ errors; warning ⇒ warns (info/debug are filtered
  # out by the handler's `level: :warning`).
  def log(%{level: level}, _config) do
    case :persistent_term.get(@key, nil) do
      nil ->
        :ok

      ref ->
        idx = if level in [:emergency, :alert, :critical, :error], do: @errors_idx, else: @warns_idx
        :counters.add(ref, idx, 1)
        :ok
    end
  end

  defp ensure_ref do
    case :persistent_term.get(@key, nil) do
      nil ->
        ref = :counters.new(2, [:write_concurrency])
        :persistent_term.put(@key, ref)
        ref

      ref ->
        ref
    end
  end
end
