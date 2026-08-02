# "Reset world to a buildable STATE" (non-destructive): place the whole colony on a PRISTINE forest
# surface, spread out, with room + open sky to build a surface shelter (the phase-4 build-drive boost).
# Uses spreadplayers (lands each UNI on the top solid block — no fall damage, no bedrock holes). Keeps
# their learned brains + MC inventory (the 7 tools / phase-3..4 progress). Standalone Source-RCON.
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
if aid == 1 do
  R.cmd(sock, "difficulty peaceful")
  R.cmd(sock, "time set day")
  # pristine forest at +120,+120 (the colony dug up spawn 0,0); spread ~8 apart within 30 blocks, on the surface.
  R.cmd(sock, "spreadplayers 120 120 8 30 false @a")
end
:gen_tcp.close(sock)
