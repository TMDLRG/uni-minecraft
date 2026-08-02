defmodule SP.Show.RemoteRowsTest do
  # async: false — fetch(nil) exercises the real local Colony.snapshot() path (starts the
  # runtime tree), and colony_node/0 reads process-global env.
  use ExUnit.Case, async: false

  alias SP.Show.RemoteRows

  test "fetch(nil) takes the local branch and returns a list (today's semantics)" do
    assert is_list(RemoteRows.fetch(nil))
  end

  test "fetch on an unreachable node folds to [] (badrpc, never a raise, never a stall)" do
    assert RemoteRows.fetch(:"nonode@red-nonexistent-host") == []
  end

  test "normalise drops anything without a string username" do
    rows = [%{username: "UNI-1-1"}, %{senses: %{}}, "junk", %{username: 5}, nil]
    assert [%{username: "UNI-1-1"}] = RemoteRows.normalise(rows)
  end

  test "normalise defaults exactly the HEAD consumer keys (Director.card/1 destructure)" do
    [row] = RemoteRows.normalise([%{username: "UNI-1-1"}])
    assert row.kin == 0
    assert row.mode == "see_all"
    assert row.senses == %{}
    assert row.action == nil
  end

  test "normalise never overwrites a present key" do
    [row] =
      RemoteRows.normalise([
        %{username: "u", kin: 3, senses: %{"health" => 5}, mode: "blind", action: "mine"}
      ])

    assert row.kin == 3
    assert row.senses == %{"health" => 5}
    assert row.mode == "blind"
    assert row.action == "mine"
  end

  test "colony_node is nil when env unset or empty, an atom when set" do
    System.delete_env("UNI_COLONY_NODE")
    assert RemoteRows.colony_node() == nil

    System.put_env("UNI_COLONY_NODE", "")
    assert RemoteRows.colony_node() == nil

    System.put_env("UNI_COLONY_NODE", "uni@uni-colony")
    on_exit(fn -> System.delete_env("UNI_COLONY_NODE") end)
    assert RemoteRows.colony_node() == :"uni@uni-colony"
  end
end
