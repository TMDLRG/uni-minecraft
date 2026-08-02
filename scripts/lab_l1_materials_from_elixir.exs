# Ask THE ELIXIR what material each L1 fixture node renders as. (Phase 9 step 4.6, build L1)
#
#     mix run scripts/lab_l1_materials_from_elixir.exs
#
# l1.html restates SP.ControlPlane.Scene.material/1 in JavaScript, because the browser cannot call
# Elixir. A second implementation that nobody cross-checks is simply a second place to be wrong, so
# this prints the ELIXIR's answer for every fixture node and viewer/lab/verify_lab_l1.cjs fails if
# the two disagree. The Elixir is the contract; the JavaScript is a copy on trial.

alias SP.ControlPlane.Scene

fixture =
  Path.join(File.cwd!(), "viewer/lab/fixtures/l1_materials.json")
  |> File.read!()
  |> JSON.decode!()

answers =
  Enum.map(fixture["nodes"], fn n ->
    # Scene.material/1 reads atom keys, and truth_class is an atom in the vocabulary. An unknown
    # string must NOT be coerced into a new atom — it is unreadable, and unreadable is fog.
    tc =
      Enum.find(Scene.truth_classes(), fn a -> Atom.to_string(a) == n["truth_class"] end)

    node = %{
      id: n["id"],
      truth_class: tc,
      receipt_ref: n["receipt_ref"],
      evidence_class: n["evidence_class"],
      captured_at: n["captured_at"],
      live: if(is_map(n["live"]), do: %{up: n["live"]["up"]}, else: nil)
    }

    %{
      "id" => n["id"],
      "material" => Atom.to_string(Scene.material(node)),
      "liveness" => Atom.to_string(Scene.liveness(node)),
      "authorable" => Scene.authorable?(node)
    }
  end)

IO.puts(JSON.encode!(%{"source" => "SP.ControlPlane.Scene", "nodes" => answers}))
