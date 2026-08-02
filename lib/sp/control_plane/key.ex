defmodule SP.ControlPlane.Key do
  @moduledoc """
  One party's authority to cross a threshold.

  A key is not a secret and not a credential. It is a **record that a named party
  authorised this crossing, and where that authorisation can be checked** —
  holder, kind, and a reference to the grant.

  ## Two keys, and the second must actually be a second

  This is the third instance of one idea on this platform:

  * `SP.ControlPlane.Command` refuses a mutation whose co-signer is its proposer.
  * `node2` refuses every credential the ledger's writer holds.
  * An airlock needs **two keys from distinct holders, at least one an operator**.

  Two agent keys are one party wearing two hats. Holders are compared
  case- and whitespace-insensitively, because `"Michael"` and `"michael "` are one
  person — the same comparison Phase 3 built for the two-party rule, and for the
  same reason: an audit trail that thinks otherwise proves nothing.
  """

  @kinds [:operator, :agent, :service]

  @enforce_keys [:holder, :kind, :ref]
  defstruct [:holder, :kind, :ref]

  @type t :: %__MODULE__{holder: String.t(), kind: :operator | :agent | :service, ref: String.t()}

  @doc "The kinds of party that can hold a key."
  @spec kinds() :: [atom()]
  def kinds, do: @kinds

  @doc """
  Build a key. Every field is required: a key with no holder authorises nobody,
  and a key with no `ref` cannot be checked afterwards.
  """
  @spec new(String.t(), atom(), String.t()) :: {:ok, t()} | {:error, term()}
  def new(holder, kind, ref) do
    cond do
      not (is_binary(holder) and String.trim(holder) != "") -> {:error, {:blank, :holder}}
      kind not in @kinds -> {:error, {:unknown_kind, kind}}
      not (is_binary(ref) and String.trim(ref) != "") -> {:error, {:blank, :ref}}
      true -> {:ok, %__MODULE__{holder: String.trim(holder), kind: kind, ref: ref}}
    end
  end

  @doc "As `new/3`, raising on refusal. For tests and for callers that have already validated."
  @spec new!(String.t(), atom(), String.t()) :: t()
  def new!(holder, kind, ref) do
    case new(holder, kind, ref) do
      {:ok, key} -> key
      {:error, reason} -> raise ArgumentError, "invalid key: #{inspect(reason)}"
    end
  end

  @doc "The holder, normalised for comparison. `\"Michael \"` and `\"michael\"` are one party."
  @spec party(t()) :: String.t()
  def party(%__MODULE__{holder: h}), do: h |> String.trim() |> String.downcase()

  @doc "How many distinct parties these keys represent. A read."
  @spec parties([t()]) :: [String.t()]
  def parties(keys), do: keys |> Enum.map(&party/1) |> Enum.uniq()

  @doc "Is at least one of these an operator's key? A read."
  @spec any_operator?([t()]) :: boolean()
  def any_operator?(keys), do: Enum.any?(keys, &(&1.kind == :operator))

  @doc "The form recorded in a ledger entry's `authorization.co_signers`. A read."
  @spec to_record(t()) :: map()
  def to_record(%__MODULE__{} = k), do: %{"holder" => k.holder, "kind" => to_string(k.kind), "ref" => k.ref}
end
