defmodule SP.ControlPlane.Pair do
  @moduledoc """
  Decides whether two runs form a comparable pair, and nothing else.

  `LAB_PROTOCOL.md`: a paired design has **exactly one differing variable**.

  Two differences do not make a result weaker. They make it **unattributable** —
  no observation can say which change produced the difference — so the pair is
  `VOID` and unclaimable. `VOID` is not a bad result; it is the absence of one.

  ## What counts as a variable

  Everything that defines *what was run*: each key of `params`, each key of
  `inputs`, `seeds`, `code_identity`, `env_identity`. A key present in one arm
  and absent in the other is a difference. A differing seed is a variable — it is
  not free.

  ## What does not

  Execution facts — start and end times, exit code, outputs, `actual_n`. Two arms
  necessarily run at different moments, and counting that as a second variable
  would make every pair `VOID`.

  ## This module renders no verdict

  It answers "are these comparable?". Whether a comparable difference *means*
  anything is adjudication, and that belongs to `SP.ControlPlane.Verdict`, behind
  a registered gate. A source scan asserts that no verdict word appears in this
  file.
  """

  @doc "The fields that define what was run. Everything else is execution."
  @spec variable_fields() :: [atom()]
  def variable_fields, do: [:code_identity, :env_identity, :seeds]

  @doc """
  Form a pair from two runs.

  `{:ok, %{variable:, a:, b:}}` for exactly one difference ·
  `{:error, :no_differing_variable}` for none ·
  `{:error, {:void, keys}}` for two or more.
  """
  @spec of(map(), map()) :: {:ok, map()} | {:error, term()}
  def of(arm_a, arm_b) when is_map(arm_a) and is_map(arm_b) do
    case differences(arm_a, arm_b) do
      [] -> {:error, :no_differing_variable}
      [{key, a, b}] -> {:ok, %{variable: key, a: a, b: b}}
      many -> {:error, {:void, many |> Enum.map(&elem(&1, 0)) |> Enum.sort()}}
    end
  end

  @doc "A pair is claimable only when it was constructed. There is no other way in. A read."
  @spec claimable?(map()) :: boolean()
  def claimable?(%{variable: v}) when is_binary(v), do: true
  def claimable?(_), do: false

  @doc "Every differing variable between two arms, as `{key, a, b}`. A read."
  @spec differences(map(), map()) :: [{String.t(), term(), term()}]
  def differences(arm_a, arm_b) do
    scalar =
      for f <- variable_fields(),
          Map.get(arm_a, f) != Map.get(arm_b, f),
          do: {to_string(f), Map.get(arm_a, f), Map.get(arm_b, f)}

    scalar ++ nested(arm_a, arm_b, :params, "") ++ nested(arm_a, arm_b, :inputs, "inputs.")
  end

  defp nested(arm_a, arm_b, field, prefix) do
    a = Map.get(arm_a, field) || %{}
    b = Map.get(arm_b, field) || %{}

    (Map.keys(a) ++ Map.keys(b))
    |> Enum.uniq()
    |> Enum.sort()
    |> Enum.reject(&(Map.get(a, &1) == Map.get(b, &1)))
    |> Enum.map(&{prefix <> to_string(&1), Map.get(a, &1), Map.get(b, &1)})
  end
end
