defmodule SP.ControlPlane.Drift do
  @moduledoc """
  A comparison between two observations, refusing at construction any pairing of
  two different **kinds** of thing.

  ## Why this type exists

  Phase 1 of the Control Plane build set out to clear five live drift signals and
  cleared none. The reason was not staleness. Four of the five compare
  structurally different kinds — a prose line against `git ls-files` output, a
  JSON object against a whole 51 KB markdown document — and the collector's
  comparison is `equal = a.raw === b.raw`, a pure byte compare. Those four can
  never read `equal = true`, and no amount of editing documents will change that.

  Gaia is behaving correctly. Its law demands a mechanical compare and forbids it
  from judging what a difference *means*. The defect is in the pairing, and it is
  invisible at the moment the pairing is made. This type makes it visible: a
  cross-kind comparison cannot be constructed, so the mistake is caught where it
  is made rather than surviving as a permanently red signal.

  See `docs/control-plane/phases/PHASE-1-RESULTS.md` (UNI-FLAGELLUM).

  ## `equal = false` is not evidence of staleness

  A comparison always carries both sides. It never reduces to a boolean, because
  a bare boolean is exactly what made the four bad pairings unreadable — the
  answer looked like a finding when it was an artefact of the question.
  """

  @kinds [:sha256, :prose, :prose_document, :file_listing, :json_object, :verdict, :integer]
  @relations [:declared_vs_observed, :absent, :snapshot_vs_live, :self]

  @type kind :: :sha256 | :prose | :prose_document | :file_listing | :json_object | :verdict | :integer
  @type relation :: :declared_vs_observed | :absent | :snapshot_vs_live | :self
  @type observation :: %{locator: String.t(), raw: String.t(), kind: kind()}
  @type comparison :: %{a: observation(), b: observation(), relation: relation(), equal: boolean()}

  @doc "The kinds an observation may declare."
  @spec kinds() :: [kind()]
  def kinds, do: @kinds

  @doc "The relations a comparison may declare. The same four Gaia uses."
  @spec relations() :: [relation()]
  def relations, do: @relations

  @doc """
  Build one observation. `raw` is always the rendered binary form, whatever the
  kind — `:integer` means "an integer, rendered", not "an Elixir integer".
  """
  @spec observation(String.t(), String.t(), kind()) :: {:ok, observation()} | {:error, term()}
  def observation(locator, raw, kind) do
    cond do
      kind not in @kinds -> {:error, {:unknown_kind, kind}}
      not is_binary(locator) -> {:error, {:locator_must_be_a_string, locator}}
      not is_binary(raw) -> {:error, {:raw_must_be_a_string, raw}}
      true -> {:ok, %{locator: locator, raw: raw, kind: kind}}
    end
  end

  @doc """
  Compare two observations of the **same kind**.

  Refuses a cross-kind pairing at construction — identical raw bytes do not
  excuse it, because the point is that the two values were never commensurable.
  A read.
  """
  @spec compare(observation(), observation(), relation()) :: {:ok, comparison()} | {:error, term()}
  def compare(%{kind: ka, raw: ra} = a, %{kind: kb, raw: rb} = b, relation)
      when is_map_key(a, :locator) and is_map_key(b, :locator) do
    cond do
      ka != kb -> {:error, {:kind_mismatch, ka, kb}}
      relation not in @relations -> {:error, {:unknown_relation, relation}}
      true -> {:ok, %{a: a, b: b, relation: relation, equal: ra == rb}}
    end
  end

  def compare(a, b, _relation), do: {:error, {:not_an_observation, a, b}}
end
