defmodule SP.Core.Schema do
  @moduledoc """
  Tiny dependency-free schema validator for configs, scenarios and genome maps.

  A schema is a keyword list of `{key, type, opts}` where `opts` may include
  `:default` and `:required` (defaults to `true` when no `:default` is given).

  Supported types:

    * `:integer | :float | :number | :boolean | :string | :atom | :map`
    * `{:list, inner_type}`
    * `{:in, [allowed]}`
    * `{:range, lo, hi}` (inclusive, numeric)

  Returns `{:ok, normalized_map_with_defaults}` or `{:error, [{key, reason}]}`.
  We keep this intentionally small: it covers what scenario/seed/genome loading
  needs and nothing more (no premature generality).
  """

  @type type ::
          :integer
          | :float
          | :number
          | :boolean
          | :string
          | :atom
          | :map
          | {:list, type()}
          | {:in, [term()]}
          | {:range, number(), number()}
  @type field :: {atom(), type(), keyword()}
  @type schema :: [field()]

  @spec validate(map(), schema()) :: {:ok, map()} | {:error, [{atom(), term()}]}
  def validate(input, schema) when is_map(input) and is_list(schema) do
    {acc, errors} =
      Enum.reduce(schema, {%{}, []}, fn {key, type, opts}, {acc, errors} ->
        case fetch(input, key, opts) do
          {:ok, value} ->
            case check(value, type) do
              :ok -> {Map.put(acc, key, value), errors}
              {:error, reason} -> {acc, [{key, reason} | errors]}
            end

          :use_default ->
            {Map.put(acc, key, Keyword.get(opts, :default)), errors}

          :missing ->
            {acc, [{key, :required} | errors]}
        end
      end)

    case errors do
      [] -> {:ok, acc}
      _ -> {:error, Enum.reverse(errors)}
    end
  end

  @doc "Raising variant for trusted internal call sites."
  @spec validate!(map(), schema()) :: map()
  def validate!(input, schema) do
    case validate(input, schema) do
      {:ok, m} -> m
      {:error, errs} -> raise ArgumentError, "schema validation failed: #{inspect(errs)}"
    end
  end

  defp fetch(input, key, opts) do
    cond do
      Map.has_key?(input, key) -> {:ok, Map.get(input, key)}
      Map.has_key?(input, to_string(key)) -> {:ok, Map.get(input, to_string(key))}
      Keyword.has_key?(opts, :default) -> :use_default
      Keyword.get(opts, :required, true) -> :missing
      true -> :use_default
    end
  end

  defp check(v, :integer) when is_integer(v), do: :ok
  defp check(v, :float) when is_float(v), do: :ok
  defp check(v, :number) when is_number(v), do: :ok
  defp check(v, :boolean) when is_boolean(v), do: :ok
  defp check(v, :string) when is_binary(v), do: :ok
  defp check(v, :atom) when is_atom(v), do: :ok
  defp check(v, :map) when is_map(v), do: :ok

  defp check(v, {:list, inner}) when is_list(v) do
    Enum.find_value(v, :ok, fn el ->
      case check(el, inner) do
        :ok -> nil
        err -> err
      end
    end)
  end

  defp check(v, {:in, allowed}) do
    if v in allowed, do: :ok, else: {:error, {:not_in, allowed}}
  end

  defp check(v, {:range, lo, hi}) when is_number(v) do
    if v >= lo and v <= hi, do: :ok, else: {:error, {:out_of_range, lo, hi}}
  end

  defp check(v, type), do: {:error, {:type_mismatch, type, v}}
end
