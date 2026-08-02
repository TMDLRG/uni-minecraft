# Gracefully save + stop the Minecraft Paper server via Source-RCON (so the world is flushed cleanly,
# not killed mid-write). Standalone — no BEAM needed. Safe to run after the colony node is already down.
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

case :gen_tcp.connect(~c"127.0.0.1", 25575, [:binary, active: false], 3000) do
  {:ok, sock} ->
    :gen_tcp.send(sock, R.pkt(1, 3, "sp"))
    {aid, _t, _b} = R.recv_one(sock)
    if aid == 1 do
      R.cmd(sock, "save-all flush")
      Process.sleep(2500)
      R.cmd(sock, "stop")
    else
      IO.puts("RCON auth FAIL (#{aid})")
    end
    :gen_tcp.close(sock)

  {:error, reason} ->
    IO.puts("MC RCON not reachable (#{inspect(reason)}) — server likely already down")
end
