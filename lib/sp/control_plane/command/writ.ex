defmodule SP.ControlPlane.Command.Writ do
  @moduledoc """
  A writ of authority to append one entry to the ledger.

  The ledger's writer demands one of these and refuses anything else. Only
  `SP.ControlPlane.Command` constructs them.

  ## What this does and does not prove

  Elixir cannot restrict callers. A determined module can build a `%Writ{}` and
  bypass the command path, and this struct does nothing to stop it. What it stops
  is the *accidental* write — the convenience helper that grows a second writer
  because appending looked harmless.

  The fence that actually holds is a static one: no module in `lib/` other than
  the command module may reference the ledger's writer, and that is checked by
  reading the source in
  `test/sp/control_plane/command_is_only_writer_test.exs`, not by trusting it.
  Both guards are weak alone and are therefore both present.
  """

  @enforce_keys [:command, :actor, :role]
  defstruct [:command, :actor, :role]

  @type t :: %__MODULE__{command: atom(), actor: String.t(), role: String.t()}
end
