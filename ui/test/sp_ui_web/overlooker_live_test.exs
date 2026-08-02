defmodule SpUiWeb.OverlookerLiveTest do
  use ExUnit.Case, async: false
  import Phoenix.ConnTest
  import Phoenix.LiveViewTest

  @endpoint SpUiWeb.Endpoint

  setup do
    {:ok, conn: build_conn()}
  end

  test "mounts the overlooker: 3D world view by default, blanket monitor, intact verdict + scene push", %{
    conn: conn
  } do
    {:ok, view, html} = live(conn, "/")

    # Header + the always-on panels.
    assert html =~ "OVERLOOKER"
    assert html =~ "Is the agent sealed off from the world?"
    assert html =~ "Signal &amp; action audit"

    # The evolution insights panel surfaces the live (1+1)-ES lineage.
    assert html =~ "Watch it evolve"
    assert html =~ "generation"

    # Default view is the 3D world canvas (driven by the JS hook).
    assert html =~ ~s(phx-hook="World")
    assert html =~ "World — the whole world as one 3D map"

    # Agent panel (box 3) is fed only the opaque observation, outside the world.
    assert html =~ "mind (outside)"

    # The server pushes a compact scene to the canvas hook on mount.
    assert_push_event(view, "scene", payload)
    assert %{"regions" => regions, "agent" => agent} = payload
    assert is_list(regions) and regions != []
    assert is_integer(agent["region"])

    # An honest live run verifies intact.
    rendered = render(view)
    assert rendered =~ "sealed off"
    refute rendered =~ "a leak was detected"
  end

  test "the world_ready handshake triggers a scene push", %{conn: conn} do
    {:ok, view, _html} = live(conn, "/")
    render_hook(view, "world_ready", %{})
    assert_push_event(view, "scene", %{"regions" => _})
  end

  test "the detailed layers and DOM map views remain available as toggles", %{conn: conn} do
    {:ok, view, _html} = live(conn, "/")

    layers = view |> element("button[phx-value-view='layers']") |> render_click()
    assert layers =~ "Overlooker — the whole world, all layers"
    assert layers =~ "nutrient (L0)"
    assert layers =~ "cavity (L2)"
    assert layers =~ "band 0 (L3)"

    map = view |> element("button[phx-value-view='map']") |> render_click()
    assert map =~ "World map — the whole world as one map"

    world = view |> element("button[phx-value-view='world']") |> render_click()
    assert world =~ ~s(phx-hook="World")
  end

  test "stepping advances the tick", %{conn: conn} do
    {:ok, view, _html} = live(conn, "/")
    before = render(view)
    after_ = view |> element("button", "step") |> render_click()
    assert before != after_
    assert after_ =~ "tick"
  end

  test "a tampered replay log turns the verdict RED (falsifiable on screen)", %{conn: conn} do
    runs = Path.expand("../runs", File.cwd!())
    File.mkdir_p!(runs)
    base = Path.join(runs, "uitest")

    sim =
      SP.Sim.new(seed: 7, agent: SP.Baselines.MorphologySeeking, max_ticks: 25, record_blanket?: true)
      |> SP.Sim.run()

    {:ok, %{log: log}} = SP.Sim.Recorder.write(sim, base)

    # Tamper one observation value in frame index 10 so encode-equivalence fails.
    lines = log |> File.read!() |> String.split("\n", trim: true)
    {head, [target | tail]} = Enum.split(lines, 10)
    frame = Jason.decode!(target)
    {ch, v} = frame["afferent"]["observation"] |> Enum.to_list() |> hd()
    tampered = put_in(frame, ["afferent", "observation", ch], v + 1.0)
    File.write!(log, Enum.join(head ++ [Jason.encode!(tampered)] ++ tail, "\n"))

    on_exit(fn ->
      File.rm(log)
      File.rm(Path.join(runs, "uitest.meta.json"))
    end)

    {:ok, view, _html} = live(conn, "/")
    render_change(view, "load_replay", %{"log" => "uitest.jsonl"})

    # Step through the run; the tampered frame must flip the badge to a violation.
    htmls = Enum.map(1..15, fn _ -> view |> element("button", "step") |> render_click() end)
    assert Enum.any?(htmls, &(&1 =~ "a leak was detected"))
    refute Enum.at(htmls, 0) =~ "a leak was detected"
  end
end
