defmodule SP.Minecraft.Rcon do
  @moduledoc """
  Minimal Source RCON client over OTP `:gen_tcp` (no hex dependencies), used to
  drive a Minecraft (Paper) server's console from the simulator.

  Protocol: each packet is `<<len::little-32, id::little-32, type::little-32,
  body, 0, 0>>` where `len` counts everything after itself. Types: 3 = auth,
  2 = exec command, 0 = response. The packet codec (`encode/3` / `decode/1`) is
  pure and unit-tested; `connect/3` and `command/2` do the network I/O.
  """

  @type_auth 3
  @type_exec 2

  @doc "Encode an RCON packet."
  @spec encode(integer(), integer(), binary()) :: binary()
  def encode(id, type, body) do
    payload = <<id::little-signed-32, type::little-signed-32, body::binary, 0, 0>>
    <<byte_size(payload)::little-signed-32, payload::binary>>
  end

  @doc """
  Decode one RCON packet from `binary`. Returns `{:ok, %{id,type,body}, rest}`
  or `{:more, binary}` if a full packet is not yet present.
  """
  @spec decode(binary()) :: {:ok, map(), binary()} | {:more, binary()}
  def decode(<<len::little-signed-32, rest::binary>>) when byte_size(rest) >= len do
    <<payload::binary-size(len), tail::binary>> = rest
    <<id::little-signed-32, type::little-signed-32, body_pad::binary>> = payload
    body = binary_part(body_pad, 0, max(byte_size(body_pad) - 2, 0))
    {:ok, %{id: id, type: type, body: body}, tail}
  end

  def decode(binary), do: {:more, binary}

  @doc "Connect and authenticate. Returns `{:ok, socket}` or `{:error, reason}`."
  @spec connect(charlist() | String.t(), :inet.port_number(), String.t(), keyword()) ::
          {:ok, port()} | {:error, term()}
  def connect(host, port, password, opts \\ []) do
    timeout = Keyword.get(opts, :timeout, 5000)
    host = if is_binary(host), do: String.to_charlist(host), else: host

    with {:ok, sock} <- :gen_tcp.connect(host, port, [:binary, active: false, packet: :raw], timeout),
         :ok <- :gen_tcp.send(sock, encode(1, @type_auth, password)),
         {:ok, %{id: id}} <- recv(sock, timeout) do
      if id == 1 do
        {:ok, sock}
      else
        :gen_tcp.close(sock)
        {:error, :auth_failed}
      end
    end
  end

  @doc "Run a single command, returning the server's response body."
  @spec command(port(), String.t(), keyword()) :: {:ok, String.t()} | {:error, term()}
  def command(sock, cmd, opts \\ []) do
    timeout = Keyword.get(opts, :timeout, 5000)

    with :ok <- :gen_tcp.send(sock, encode(2, @type_exec, cmd)),
         {:ok, %{body: body}} <- recv(sock, timeout) do
      {:ok, body}
    end
  end

  @doc "Run many commands in order; stops on the first error."
  @spec commands(port(), [String.t()], keyword()) :: :ok | {:error, term()}
  def commands(sock, cmds, opts \\ []) do
    Enum.reduce_while(cmds, :ok, fn cmd, _acc ->
      case command(sock, cmd, opts) do
        {:ok, _} -> {:cont, :ok}
        err -> {:halt, err}
      end
    end)
  end

  @spec close(port()) :: :ok
  def close(sock), do: :gen_tcp.close(sock)

  # Read exactly one length-framed packet.
  defp recv(sock, timeout) do
    with {:ok, <<len::little-signed-32>>} <- :gen_tcp.recv(sock, 4, timeout),
         {:ok, payload} <- :gen_tcp.recv(sock, len, timeout),
         {:ok, pkt, _rest} <- decode(<<len::little-signed-32, payload::binary>>) do
      {:ok, pkt}
    end
  end
end
