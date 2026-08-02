# WS-A diagnostic (no code change): confirm the harvest AIM + the real inventory item names/state.
# Standalone Source-RCON -> 127.0.0.1:25575 pass "sp". data get entity reveals rotation (aim) + NBT inventory.
defmodule R do
  def pkt(id, type, body), do: (p = <<id::little-32, type::little-32>> <> body <> <<0, 0>>; <<byte_size(p)::little-32>> <> p)
  def recv_one(sock) do
    {:ok, <<len::little-32>>} = :gen_tcp.recv(sock, 4, 5000)
    {:ok, data} = :gen_tcp.recv(sock, len, 5000)
    <<id::little-signed-32, type::little-32, rest::binary>> = data
    {id, type, binary_part(rest, 0, max(byte_size(rest) - 2, 0))}
  end
  def cmd(sock, c), do: (:gen_tcp.send(sock, pkt(2, 2, c)); {_i, _t, out} = recv_one(sock); IO.puts("\n> #{c}\n#{String.trim(out)}"))
end
{:ok, sock} = :gen_tcp.connect(~c"127.0.0.1", 25575, [:binary, active: false], 5000)
:gen_tcp.send(sock, R.pkt(1, 3, "sp"))
{aid, _t, _b} = R.recv_one(sock)
IO.puts(if aid == 1, do: "RCON auth OK", else: "RCON auth FAIL (#{aid})")
if aid == 1 do
  ["data get entity UNI-2-1 Rotation", "data get entity UNI-2-1 Pos",
   "data get entity UNI-0-1 Inventory", "data get entity UNI-1-1 Inventory"]
  |> Enum.each(&R.cmd(sock, &1))
end
:gen_tcp.close(sock)
