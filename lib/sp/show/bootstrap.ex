defmodule SP.Show.Bootstrap do
  @moduledoc """
  A supervised, one-shot colony populator for the headless/prod auto-start path
  (`UNI_AUTOSTART=1`). Replaces the old fire-and-forget `Task.start` in `SpUi.Application`,
  which was unsupervised (a crash during population left the colony half-built with nothing
  to notice).

  On start it waits for the show + the Minecraft server to be reachable, then spawns the
  design cast (kin from `UNI_KIN` or the default `[0,1,1,2,3]`) once, then idles as a
  supervised process. It NEVER auto-spawns on the dev box (only `SpUi.Application` adds it,
  and only when `UNI_AUTOSTART=1`), so the dev box stays byte-inert unless the operator opts in.

  Population is idempotent-ish: it only spawns up to the target size and only if the colony is
  currently under it, so a Bootstrap restart never piles on a second cast.
  """
  use GenServer

  @name __MODULE__
  @boot_delay_ms 12_000
  @spawn_gap_ms 2_500

  def start_link(opts \\ []), do: GenServer.start_link(__MODULE__, opts, name: @name)

  @impl true
  def init(opts) do
    kin = Keyword.get(opts, :kin, [0, 1, 1, 2, 3])
    Process.send_after(self(), :populate, @boot_delay_ms)
    {:ok, %{kin: kin, done: false}}
  end

  @impl true
  def handle_info(:populate, %{done: true} = state), do: {:noreply, state}

  def handle_info(:populate, state) do
    # Only add agents the colony is missing, so a restart of this bootstrap never double-spawns.
    have = safe(fn -> length(SP.Brain.Colony.snapshot()) end) || 0
    want = length(state.kin)

    if have >= want do
      {:noreply, %{state | done: true}}
    else
      Enum.drop(state.kin, have)
      |> Enum.each(fn k ->
        safe(fn -> SP.Brain.Colony.spawn_agent(k, "see_all") end)
        Process.sleep(@spawn_gap_ms)
      end)

      {:noreply, %{state | done: true}}
    end
  end

  def handle_info(_other, state), do: {:noreply, state}

  defp safe(fun) do
    fun.()
  catch
    _, _ -> nil
  end
end
