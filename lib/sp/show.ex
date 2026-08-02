defmodule SP.Show do
  @moduledoc """
  Facade for the supervised live show (`SP.Show.Supervisor` owning Colony + Director +
  Producer). One entry point to bring the show up idempotently, one to read its liveness.

  Two host contexts, both durable where it counts:

    * **Phoenix node** (`cd ui && iex -S mix phx.server`, the real 24/7 host): with
      `UNI_AUTOSTART=1`, `SpUi.Application` supervises `SP.Show.Supervisor` DIRECTLY, so the
      whole show is restart-safe under the OS-level node.
    * **On-demand** (`/stream` mount, `mix producer.run`, dev-box operator): `ensure_started/1`
      starts `SP.Show.Supervisor` standalone (linked-then-unlinked so it survives the caller).
      The three show processes still self-heal under it; only the top supervisor isn't
      re-parented (acceptable for the operator-triggered path).

  This module is plumbing only — no math, no external mind. It lives outside the FE covenant
  scan dirs by design.
  """

  alias SP.Show.RemoteRows
  alias SP.Show.Supervisor, as: Sup

  @doc """
  Bring the supervised show up once (idempotent). Returns the supervisor pid. Started
  linked-then-unlinked so a transient caller (a LiveView, a Mix task) exiting never takes the
  show down.
  """
  def ensure_started(opts \\ []) do
    case Process.whereis(Sup) do
      nil ->
        # Sup.start_link/1 registers the supervisor under its module name, so running?/status and
        # the idempotency check above actually find it (a second call never starts a rival tree).
        case Sup.start_link(opts) do
          {:ok, pid} ->
            Process.unlink(pid)
            pid

          {:error, {:already_started, pid}} ->
            pid

          {:error, reason} ->
            raise "SP.Show.Supervisor failed to start: #{inspect(reason)}"
        end

      pid ->
        pid
    end
  end

  @doc "Is the show supervisor up?"
  def running?, do: is_pid(Process.whereis(Sup))

  @doc """
  Liveness of every show part — for the operator health surface (WS0-C) and to end the
  "is it the real Producer or the puppet?" ambiguity for good.
  """
  def status do
    producer = alive?(SP.Producer)
    director = alive?(SP.Brain.Director)
    colony = alive?(SP.Brain.Colony)

    pstat = if producer, do: safe(fn -> SP.Producer.status() end), else: nil
    # Count through the reviewed transport seam: UNI_COLONY_NODE unset = today's local read,
    # byte-identical; set = the remote board, so /producer/health reports the REAL colony count
    # on a remote-sensing node (else the local empty board reads 0 and the attach gate is
    # unreachable — reviewed change A2/E4).
    count = safe(fn -> length(RemoteRows.fetch(RemoteRows.colony_node())) end) || 0

    %{
      show_up: running?(),
      producer_up: producer,
      director_up: director,
      colony_up: colony,
      colony_count: count,
      # The REAL Director driver (:self rule-based puppet | :producer), NOT synthesized from PID existence. A live
      # Director PID whose driver is still :self is a headless puppet — it must read :self here so the health
      # verdict cannot claim LIVE for a puppet (the puppet-cam guard). nil when the Director is down/unreachable.
      driver: director && safe(fn -> SP.Brain.Director.driver() end),
      last_action: pstat && pstat[:action],
      frame: pstat && pstat[:frame],
      star: pstat && pstat[:star],
      tps: pstat && pstat[:tps],
      # RED instrumentation passthrough (reviewed E1/D2): the frame-stamped action ring — the
      # collector's anti-aliasing signal (a ≤4 s star hold vanishes under a 5 s poll of `star`
      # alone) — and the per-action observe-only fence counters (perseveration rate).
      knowledge: pstat && pstat[:knowledge],
      fenced: pstat && pstat[:fenced]
    }
  end

  @doc """
  The single honest liveness verdict from a `status/0` map (pure — for the health surface + tests):
    * `"LIVE"`    — Producer + Director up AND the Director's REAL driver is `:producer` (the Producer actually
      drives). PID existence is NOT enough: a live Director still in `:self` is a headless puppet ⇒ `"PARTIAL"`
      (the puppet-cam guard). The anti-frozen `frame`-advance check is caller-side (studio guard) across two probes.
    * `"PARTIAL"` — some show processes up but not the full producer-driven chain.
    * `"DOWN"`    — the show is not running.
  """
  def verdict(%{} = st) do
    cond do
      st.producer_up and st.director_up and Map.get(st, :driver) == :producer -> "LIVE"
      st.show_up or st.producer_up or st.director_up -> "PARTIAL"
      true -> "DOWN"
    end
  end

  defp alive?(name), do: is_pid(Process.whereis(name))

  defp safe(fun) do
    fun.()
  catch
    _, _ -> nil
  end
end
