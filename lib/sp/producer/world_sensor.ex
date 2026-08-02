defmodule SP.Producer.WorldSensor do
  @moduledoc """
  The Producer's WORLD sense (WS1-B) — day/night rhythm and colony size, read over RCON from the
  real Minecraft server. This is what lets the Producer comment on the *gameplay*, not just the
  agents ("Night falls over the colony — Day 5").

  MARKOV-BLANKET SAFE by construction: it reads only WORLD-LEVEL facts — the time-of-day tick, the
  day count, and the online player count. It NEVER reads any UNI's coordinates or per-entity data
  (those never leave a UNI's body; see SP.Brain.Anchor.where_answer). The parsers are pure and
  unit-testable; only `poll/1` touches the socket.

  RCON (`:gen_tcp` via SP.Minecraft.Rcon) is legitimate body/world I/O, not a foreign mind — it is
  explicitly allowed by the §16 no-foreign-mind gate (gate 18 excludes `:gen_tcp`).
  """
  alias SP.Minecraft.Rcon

  @doc """
  Poll the world over an open RCON socket. Returns `%{daytime, tod, day, online}` or `nil` if the
  socket is nil or any query fails (the caller then just keeps its last reading).
  """
  def poll(nil), do: nil

  def poll(rcon) do
    with {:ok, dt} <- q(rcon, "time query daytime"),
         {:ok, dy} <- q(rcon, "time query day"),
         {:ok, ls} <- q(rcon, "list") do
      tod = int(dt)
      %{daytime: phase(tod), tod: tod, day: int(dy), online: online(ls)}
    else
      _ -> nil
    end
  end

  defp q(rcon, cmd) do
    case Rcon.command(rcon, cmd) do
      {:ok, body} -> {:ok, to_string(body)}
      _ -> :error
    end
  end

  @doc "The day/night phase from a 0..23999 daytime tick (0 = sunrise, 13000..22999 = mobs abroad)."
  def phase(t) when is_integer(t) and t >= 0 and t < 12_000, do: :day
  def phase(t) when is_integer(t) and t >= 12_000 and t < 13_000, do: :dusk
  def phase(t) when is_integer(t) and t >= 13_000 and t < 23_000, do: :night
  def phase(t) when is_integer(t), do: :dawn
  def phase(_), do: :day

  @doc "Parse the first (possibly negative) integer from an RCON `time query …` reply body."
  def int(body) do
    case Regex.run(~r/-?\d+/, to_string(body)) do
      [n] -> String.to_integer(n)
      _ -> 0
    end
  end

  @doc "Parse the online player count from a `list` reply (\"There are N of a max of M …\")."
  def online(body) do
    case Regex.run(~r/There are (\d+)/i, to_string(body)) do
      [_, n] -> String.to_integer(n)
      _ -> 0
    end
  end
end
