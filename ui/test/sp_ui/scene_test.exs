defmodule SpUi.SceneTest do
  use ExUnit.Case, async: true

  alias SpUi.Scene

  defp sample_frame do
    SP.Sim.new(seed: 7, agent: SP.Baselines.MorphologySeeking, max_ticks: 6, record_blanket?: true)
    |> SP.Sim.run()
    |> SP.Sim.frames()
    |> List.last()
    |> SP.Observability.json()
    |> Jason.decode!()
  end

  defp manhattan({ax, ay}, {bx, by}), do: abs(ax - bx) + abs(ay - by)

  describe "layout/2 (deterministic region placement)" do
    test "root at origin, neighbours adjacent, all slots distinct" do
      c = Scene.layout([0, 1, 2], [[0, 1], [1, 2]])
      assert c[0] == {0, 0}
      assert map_size(c) == 3
      assert length(Enum.uniq(Map.values(c))) == 3
      assert manhattan(c[0], c[1]) == 1
      assert manhattan(c[1], c[2]) == 1
    end

    test "is a pure function of ids+edges (stable across calls)" do
      args = {[0, 1, 2, 3], [[0, 1], [1, 2], [0, 3]]}
      assert Scene.layout(elem(args, 0), elem(args, 1)) == Scene.layout(elem(args, 0), elem(args, 1))
    end

    test "a seam-opened child attaches adjacent to a placed neighbour" do
      # region 2 connected to 0 via a seam edge added later
      c = Scene.layout([0, 1, 2], [[0, 1], [0, 2]])
      assert c[0] == {0, 0}
      assert manhattan(c[0], c[2]) == 1
      assert c[1] != c[2]
    end
  end

  describe "build/1 (scene from a frame)" do
    setup do
      {:ok, scene: Scene.build(sample_frame())}
    end

    test "regions carry layout coords, per-cell rgb tiles, and 5 layer stacks", %{scene: scene} do
      assert is_list(scene["regions"]) and scene["regions"] != []
      r = hd(scene["regions"])
      assert is_integer(r["gx"]) and is_integer(r["gy"])
      assert length(r["tiles"]) == r["w"] * r["h"]
      assert Enum.all?(r["tiles"], &String.starts_with?(&1, "rgb("))
      assert length(r["stacks"]) == 5
      assert Enum.all?(r["stacks"], &(length(&1["colors"]) == r["w"] * r["h"]))
    end

    test "agent position and edges are present", %{scene: scene} do
      assert is_integer(scene["agent"]["region"])
      assert is_integer(scene["agent"]["cell"])
      assert is_list(scene["adjacency"])
      assert is_list(scene["seams"])
    end

    test "marks are sparse [cell, type, value] triples", %{scene: scene} do
      marks = scene["regions"] |> Enum.flat_map(& &1["marks"])

      assert Enum.all?(marks, fn [cell, type, _v] ->
               is_integer(cell) and type in ["struct", "eco"]
             end)
    end
  end
end
