defmodule SP.Brain.Hierarchy2Test do
  use ExUnit.Case, async: true
  alias SP.Brain.Hierarchy2

  # purebody gate `gate.hierarchy2.composition` (registered stated_before_run in
  # lab/purebody/purebody.v1.jsonl). MECHANISM only: the down=prior / up=evidence
  # 2-level schedule, no joint blowup, exact flat reduction.

  defp onehot(n, i), do: for(k <- 0..(n - 1), do: if(k == i, do: 1.0, else: 0.0))
  # parent k -> child k (column-major: Sg columns, each onehot over Sc=Sg)
  defp ident_cols(n), do: for(k <- 0..(n - 1), do: onehot(n, k))
  defp uniform_cols(sc, sg), do: for(_ <- 0..(sg - 1), do: List.duplicate(1.0 / sc, sc))

  describe "H1 down-prior — the parent SUPPLIES the child prior" do
    test "q(g)=onehot(k) ⇒ child prior == W[:,k]" do
      w = ident_cols(4)
      h = Hierarchy2.new(4, List.duplicate(1.0, 4), [{:a, w}]) |> Hierarchy2.put_parent(onehot(4, 2))
      cp = Hierarchy2.child_priors(h)
      assert cp[:a] == Enum.at(w, 2)
    end
  end

  describe "H2 up-evidence — the children UPDATE the parent" do
    test "a child posterior shifts q(g) toward the predicting parent state" do
      w = ident_cols(4)
      h = Hierarchy2.new(4, List.duplicate(1.0, 4), [{:a, w}])
      h2 = Hierarchy2.parent_from_children(h, %{a: onehot(4, 3)})
      argmax = h2.qg |> Enum.with_index() |> Enum.max_by(&elem(&1, 0)) |> elem(1)
      assert argmax == 3
      assert Enum.at(h2.qg, 3) > 0.9
    end
  end

  describe "H3 no-blowup — the joint Sg·∏Sc is NEVER materialised" do
    test "1 parent (Sg=12) + 5 children (Sc=12): storage 72, joint 2,985,984" do
      w = uniform_cols(12, 12)
      specs = for i <- 1..5, do: {String.to_atom("c#{i}"), w}
      h = Hierarchy2.new(12, List.duplicate(1.0, 12), specs)
      assert Hierarchy2.belief_size(h) == 12 + 5 * 12
      assert Hierarchy2.joint_size(h) == 12 * 12 * 12 * 12 * 12 * 12
      assert Hierarchy2.joint_size(h) > Hierarchy2.belief_size(h)
    end
  end

  describe "H4 flat reduction — uniform W ⇒ flat prior, bit-identical" do
    test "an uninformative parent yields a uniform child prior regardless of q(g)" do
      w = uniform_cols(5, 4)
      h = Hierarchy2.new(4, [0.7, 0.1, 0.1, 0.1], [{:a, w}])
      cp = Hierarchy2.child_priors(h)
      flat = List.duplicate(1.0 / 5, 5)
      Enum.zip(cp[:a], flat) |> Enum.each(fn {x, y} -> assert_in_delta(x, y, 1.0e-12) end)
    end
  end
end
