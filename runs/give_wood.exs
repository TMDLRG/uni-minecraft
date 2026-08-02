# Diagnostic jump-start: give the UNIs wood (isolates the harvesting blocker from the rest of the
# build-chain). If they then craft->tools->build, harvesting is the only blocker. Standalone RCON.
defmodule R do
  def pkt(id, type, body), do: (p = <<id::little-32, type::little-32>> <> body <> <<0, 0>>; <<byte_size(p)::little-32>> <> p)
  def recv_one(sock) do
    {:ok, <<len::little-32>>} = :gen_tcp.recv(sock, 4, 5000)
    {:ok, data} = :gen_tcp.recv(sock, len, 5000)
    <<id::little-signed-32, type::little-32, rest::binary>> = data
    {id, type, binary_part(rest, 0, max(byte_size(rest) - 2, 0))}
  end
  def cmd(sock, c), do: (:gen_tcp.send(sock, pkt(2, 2, c)); {_i, _t, out} = recv_one(sock); IO.puts("> #{c}  ->  #{String.trim(out)}"))
end
{:ok, sock} = :gen_tcp.connect(~c"127.0.0.1", 25575, [:binary, active: false], 5000)
:gen_tcp.send(sock, R.pkt(1, 3, "sp"))
{aid, _t, _b} = R.recv_one(sock)
IO.puts(if aid == 1, do: "RCON auth OK", else: "RCON auth FAIL (#{aid})")
if aid == 1, do: Enum.each(["give @a minecraft:oak_log 8"], &R.cmd(sock, &1))
:gen_tcp.close(sock)
