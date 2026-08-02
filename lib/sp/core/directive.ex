defmodule SP.Core.Directive do
  @moduledoc """
  A directive is a **pure description of an external effect** (Jido invariant #4).

  Agent decision logic (`cmd/2`-style) is pure: it returns `{updated_state,
  [directive]}`. It never performs effects itself and never mutates the world.
  The runtime (`SP.Sim` in the pure core, `SP.Runtime` for the live Jido
  adapter) is the *only* component that interprets directives and applies their
  effects. This keeps the internal/external boundary intact (Hard constraint #6,
  Jido invariants #3–#5).

  Variants:

    * `Actuate`    - request a world-facing action through an opaque action
      channel id with parameters. Whether it is *gated* (allowed by current
      morphology/development) is decided by `SP.Body` at interpretation time, not
      by the agent.
    * `Emit`       - emit a signal (e.g. an agent broadcasting to peers).
    * `Schedule`   - ask the runtime to deliver a signal/instruction at a future
      tick (no `Process.sleep`; logical time only).
    * `SpawnWorker`- spawn an ephemeral worker/probe agent.
    * `StopChild`  - stop a previously spawned child.

  Directives are inert values. Constructing one performs nothing.
  """

  defmodule Actuate do
    @moduledoc "Request a world action via an opaque action channel."
    @enforce_keys [:channel]
    defstruct [:channel, params: %{}]
    @type t :: %__MODULE__{channel: non_neg_integer() | atom(), params: map()}
  end

  defmodule Emit do
    @moduledoc "Emit a signal."
    @enforce_keys [:signal]
    defstruct [:signal]
    @type t :: %__MODULE__{signal: SP.Core.Signal.t()}
  end

  defmodule Schedule do
    @moduledoc "Deliver `signal` at logical tick `at` (>= current tick)."
    @enforce_keys [:at, :signal]
    defstruct [:at, :signal]
    @type t :: %__MODULE__{at: non_neg_integer(), signal: SP.Core.Signal.t()}
  end

  defmodule SpawnWorker do
    @moduledoc "Spawn an ephemeral worker/probe with an initial instruction."
    @enforce_keys [:kind]
    defstruct [:kind, :ref, args: %{}]
    @type t :: %__MODULE__{kind: atom(), ref: term(), args: map()}
  end

  defmodule StopChild do
    @moduledoc "Stop a previously spawned child by ref."
    @enforce_keys [:ref]
    defstruct [:ref]
    @type t :: %__MODULE__{ref: term()}
  end

  @type t ::
          Actuate.t() | Emit.t() | Schedule.t() | SpawnWorker.t() | StopChild.t()

  @doc "Convenience constructor for an actuation directive."
  @spec actuate(non_neg_integer() | atom(), map()) :: Actuate.t()
  def actuate(channel, params \\ %{}), do: %Actuate{channel: channel, params: params}

  @doc "Convenience constructor for an emit directive."
  @spec emit(SP.Core.Signal.t()) :: Emit.t()
  def emit(%SP.Core.Signal{} = sig), do: %Emit{signal: sig}

  @doc "Returns `true` if `term` is any directive struct."
  @spec directive?(term()) :: boolean()
  def directive?(%Actuate{}), do: true
  def directive?(%Emit{}), do: true
  def directive?(%Schedule{}), do: true
  def directive?(%SpawnWorker{}), do: true
  def directive?(%StopChild{}), do: true
  def directive?(_), do: false

  @doc "Validate a directive's internal shape. Returns `:ok` or `{:error, reason}`."
  @spec validate(t()) :: :ok | {:error, term()}
  def validate(%Actuate{channel: c}) when is_integer(c) or is_atom(c), do: :ok
  def validate(%Emit{signal: s}), do: ok_if(SP.Core.Signal.valid?(s), {:invalid_signal, s})

  def validate(%Schedule{at: at, signal: s}) when is_integer(at) and at >= 0,
    do: ok_if(SP.Core.Signal.valid?(s), {:invalid_signal, s})

  def validate(%SpawnWorker{kind: k}) when is_atom(k), do: :ok
  def validate(%StopChild{ref: r}) when not is_nil(r), do: :ok
  def validate(other), do: {:error, {:invalid_directive, other}}

  defp ok_if(true, _), do: :ok
  defp ok_if(false, reason), do: {:error, reason}
end
