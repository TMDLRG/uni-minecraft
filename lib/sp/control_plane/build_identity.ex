defmodule SP.ControlPlane.BuildIdentity do
  @moduledoc """
  The boot-time build identity of the Control Plane body (Phase 9, step 1.1).

  A long-lived body can be healthy yet running stale bytes. The Node bodies solve
  this by freezing a `module_set_sha256` over their loaded `require.cache`; the
  .NET HUD by its assembly MVID. The Control Plane is the BEAM analogue: it has no
  long-running process, so its identity is the digest of the **actually-loaded**
  bytecode of every `SP.ControlPlane.*` module.

  ## The loaded bytes, not the disk

  `Kernel.module_info(:md5)` is the MD5 the compiler stamped into the loaded module
  itself — the ground truth of what code is in memory, immune to a later recompile
  that changes the `.beam` on disk without a reload. That is exactly the staleness
  this step exists to expose, so this module hashes `module_info(:md5)` rather than
  re-reading the `.beam` file via `:code.get_object_code/1` (which would report the
  disk, not the running module). Either could be recomputed independently by a
  reviewer (proof 3 is M2), and the choice is stated here so it is auditable.

  ## In-charter primitives only

  `:crypto`, `Base` and the module list from `Application.spec/2` — no new
  dependency, consistent with `SP.ControlPlane`'s primitive budget.
  """

  @algo "uni.build_identity.module_set.v1"
  @app :stratified_palimpsest

  @typedoc "A frozen description of the loaded Control-Plane module set."
  @type t :: %{
          module_set_sha256: String.t(),
          module_count: non_neg_integer(),
          modules: [%{module: String.t(), beam_md5: String.t()}]
        }

  @doc "The 64-hex digest over the loaded bytecode of every `SP.ControlPlane.*` module."
  @spec module_set_sha256() :: String.t()
  def module_set_sha256, do: identity().module_set_sha256

  @doc """
  The full identity: the digest, the member count, and each module with its loaded
  bytecode MD5. Deterministic for a given loaded module set.
  """
  @spec identity() :: t()
  def identity do
    members =
      control_plane_modules()
      |> Enum.sort()
      |> Enum.map(&member/1)

    digest =
      [@algo | Enum.flat_map(members, fn {name, md5} -> [name, md5] end)]
      |> Enum.join(<<0>>)
      |> then(&:crypto.hash(:sha256, &1))
      |> Base.encode16(case: :lower)

    %{
      module_set_sha256: digest,
      module_count: length(members),
      modules: Enum.map(members, fn {name, md5} -> %{module: name, beam_md5: md5} end)
    }
  end

  # Every module the compiled application declares under the Control-Plane namespace. Derived from the app
  # spec, not a hand-list, so a newly-added module cannot silently escape the identity.
  defp control_plane_modules do
    (Application.spec(@app, :modules) || [])
    |> Enum.filter(fn m -> String.starts_with?(Atom.to_string(m), "Elixir.SP.ControlPlane") end)
  end

  defp member(mod) do
    name = Atom.to_string(mod)
    # ensure_loaded so module_info reflects a real load; a module that cannot load is recorded as MISSING,
    # which changes the digest honestly rather than being silently skipped.
    md5 =
      with {:module, ^mod} <- Code.ensure_loaded(mod),
           bin when is_binary(bin) <- mod.module_info(:md5) do
        Base.encode16(bin, case: :lower)
      else
        _ -> "MISSING"
      end

    {name, md5}
  end
end
