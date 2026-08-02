defmodule SP.ControlPlane.BuildIdentityTest do
  use ExUnit.Case, async: true

  alias SP.ControlPlane.BuildIdentity

  @algo "uni.build_identity.module_set.v1"

  describe "identity/0" do
    test "module_set_sha256 is a 64-hex digest" do
      assert BuildIdentity.identity().module_set_sha256 =~ ~r/^[0-9a-f]{64}$/
    end

    test "is deterministic — two calls over the same loaded set agree" do
      assert BuildIdentity.identity() == BuildIdentity.identity()
      assert BuildIdentity.module_set_sha256() == BuildIdentity.identity().module_set_sha256
    end

    test "covers the Control-Plane module set, including the known modules" do
      id = BuildIdentity.identity()
      names = Enum.map(id.modules, & &1.module)
      assert id.module_count == length(id.modules)
      assert id.module_count > 5

      for mod <- [
            "Elixir.SP.ControlPlane.Anchor",
            "Elixir.SP.ControlPlane.Ledger",
            "Elixir.SP.ControlPlane.Store",
            "Elixir.SP.ControlPlane.Command"
          ] do
        assert mod in names, "expected #{mod} in the identity module set"
      end
    end

    test "each member carries a loaded-bytecode md5 (32-hex) or an honest MISSING" do
      for %{beam_md5: md5} <- BuildIdentity.identity().modules do
        assert md5 == "MISSING" or md5 =~ ~r/^[0-9a-f]{32}$/
      end
    end
  end

  describe "independent recomputation (proof-3 method M2 — shares no code with the module under test)" do
    # Rebuild the digest here with a separate implementation. If BuildIdentity computes it differently, the
    # two disagree and this test fails — an oracle that imported the code under test would be worthless.
    defp recompute(members) do
      [@algo | Enum.flat_map(members, fn {name, md5} -> [name, md5] end)]
      |> Enum.join(<<0>>)
      |> then(&:crypto.hash(:sha256, &1))
      |> Base.encode16(case: :lower)
    end

    test "matches an independent digest over the same members" do
      id = BuildIdentity.identity()
      members = Enum.map(id.modules, fn %{module: n, beam_md5: m} -> {n, m} end)
      assert recompute(members) == id.module_set_sha256
    end

    test "the digest is content-sensitive — one changed member changes it (mutation)" do
      id = BuildIdentity.identity()
      members = Enum.map(id.modules, fn %{module: n, beam_md5: m} -> {n, m} end)
      [{n0, m0} | rest] = members
      mutated = [{n0, flip_last_hex(m0)} | rest]

      refute recompute(mutated) == id.module_set_sha256,
             "changing one member's bytecode md5 must change the module-set digest"
    end

    defp flip_last_hex("MISSING"), do: "00000000000000000000000000000000"

    defp flip_last_hex(hex) do
      {head, <<last::utf8>>} = String.split_at(hex, String.length(hex) - 1)
      swapped = if <<last::utf8>> == "0", do: "1", else: "0"
      head <> swapped
    end
  end
end
