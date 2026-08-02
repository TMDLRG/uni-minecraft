defmodule SP.Core.Signal do
  @moduledoc """
  The primary communication unit (Jido invariant #1).

  A signal is a CloudEvents-shaped, immutable, schema-validated record. Sensors
  produce signals from world/internal events; agents consume signals and nothing
  else. Cross-agent communication happens through signals, never through
  privileged direct state access (Jido invariant #6).

  Fields follow the CloudEvents 1.0 core attributes:

    * `:specversion` - always `"1.0"`.
    * `:id`          - unique within a run (monotonic per emitter).
    * `:type`        - reverse-DNS event type, e.g. `"sp.sense.interoception"`.
    * `:source`      - logical emitter, e.g. `"sensor:interoception"`.
    * `:subject`     - optional sub-scope (e.g. a channel id).
    * `:time`        - logical world tick at emission (integer), not wall-clock.
    * `:datacontenttype` - always `"application/x-sp-channel"` once it crosses
      the learner interface; engineering signals may carry `"application/json"`.
    * `:data`        - the payload map.

  See `docs/runtime/signal_catalog.md` for the full catalog.
  """

  @enforce_keys [:id, :type, :source, :time, :data]
  defstruct specversion: "1.0",
            id: nil,
            type: nil,
            source: nil,
            subject: nil,
            time: 0,
            datacontenttype: "application/json",
            data: %{}

  @type t :: %__MODULE__{
          specversion: String.t(),
          id: String.t(),
          type: String.t(),
          source: String.t(),
          subject: String.t() | nil,
          time: integer(),
          datacontenttype: String.t(),
          data: map()
        }

  @type validation_error ::
          {:invalid_type, term()}
          | {:invalid_source, term()}
          | {:invalid_time, term()}
          | {:invalid_data, term()}
          | {:invalid_id, term()}

  @doc """
  Construct a validated signal. Returns `{:ok, signal}` or `{:error, reason}`.

  `type` must be a non-empty, dot-segmented lowercase reverse-DNS string so the
  catalog stays machine-checkable.
  """
  @spec new(map()) :: {:ok, t()} | {:error, validation_error()}
  def new(attrs) when is_map(attrs) do
    sig = struct(__MODULE__, attrs)
    validate(sig)
  end

  @doc "Like `new/1` but raises on invalid input. For trusted internal call sites only."
  @spec new!(map()) :: t()
  def new!(attrs) do
    case new(attrs) do
      {:ok, sig} -> sig
      {:error, reason} -> raise ArgumentError, "invalid signal: #{inspect(reason)}"
    end
  end

  @doc "Validate an already-built signal struct."
  @spec validate(t()) :: {:ok, t()} | {:error, validation_error()}
  def validate(%__MODULE__{} = s) do
    with :ok <- check_id(s.id),
         :ok <- check_type(s.type),
         :ok <- check_source(s.source),
         :ok <- check_time(s.time),
         :ok <- check_data(s.data) do
      {:ok, s}
    end
  end

  @doc "Boolean form of `validate/1` — used by property tests."
  @spec valid?(term()) :: boolean()
  def valid?(%__MODULE__{} = s), do: match?({:ok, _}, validate(s))
  def valid?(_), do: false

  @type_re ~r/^[a-z0-9]+(\.[a-z0-9_]+)+$/

  defp check_id(id) when is_binary(id) and byte_size(id) > 0, do: :ok
  defp check_id(id), do: {:error, {:invalid_id, id}}

  defp check_type(t) when is_binary(t) do
    if Regex.match?(@type_re, t), do: :ok, else: {:error, {:invalid_type, t}}
  end

  defp check_type(t), do: {:error, {:invalid_type, t}}

  defp check_source(s) when is_binary(s) and byte_size(s) > 0, do: :ok
  defp check_source(s), do: {:error, {:invalid_source, s}}

  defp check_time(t) when is_integer(t) and t >= 0, do: :ok
  defp check_time(t), do: {:error, {:invalid_time, t}}

  defp check_data(d) when is_map(d), do: :ok
  defp check_data(d), do: {:error, {:invalid_data, d}}
end
