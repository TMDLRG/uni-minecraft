# Owner-authorized REVERSIBLE ease so the build-chain can emerge: difficulty peaceful + permanent day.
# Standalone Source-RCON client (no SP modules / no node needed) -> 127.0.0.1:25575 pass "sp".
defmodule R do
  def pkt(id, type, body), do: (p = <<id::little-32, type::little-32>> <> body <> <<0, 0>>; <<byte_size(p)::little-32>> <> p)
  def recv_one(sock) do
    {:ok, <<len::little-32>>} = :gen_tcp.recv(sock, 4, 5000)
    {:ok, data} = :gen_tcp.recv(sock, len, 5000)
    <<id::little-signed-32, type::little-32, rest::binary>> = data
    {id, type, binary_part(rest, 0, max(byte_size(rest) - 2, 0))}
  end
  def cmd(sock, c) do
    :gen_tcp.send(sock, pkt(2, 2, c))
    {_i, _t, out} = recv_one(sock)
    IO.puts("> #{c}  ->  #{String.trim(out)}")
  end
end

{:ok, sock} = :gen_tcp.connect(~c"127.0.0.1", 25575, [:binary, active: false], 5000)
:gen_tcp.send(sock, R.pkt(1, 3, "sp"))
{aid, _t, _b} = R.recv_one(sock)
IO.puts(if aid == 1, do: "RCON auth OK", else: "RCON auth FAIL (#{aid})")
if aid == 1 do
  ["difficulty peaceful", "time set day", "gamerule doDaylightCycle false",
   "difficulty", "gamerule doDaylightCycle"]
  |> Enum.each(&R.cmd(sock, &1))
end
:gen_tcp.close(sock)
