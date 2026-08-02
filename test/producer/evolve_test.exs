defmodule SP.Producer.EvolveTest do
  @moduledoc "Gen-3 P7: the producer asks for sensors when chronically uncertain, and can grow one."
  use ExUnit.Case, async: true

  alias SP.Producer.Brain

  test "evolve emits a sensor_request for a CHRONICALLY uncertain factor, not a confident one" do
    {_ewma, reqs} =
      Enum.reduce(1..40, {%{}, []}, fn _i, {ewma, _} ->
        SP.Producer.evolve(ewma, [{:drama, 0.1}, {:server_health, 0.95}])
      end)

    factors = Enum.map(reqs, & &1.factor)
    assert :drama in factors
    refute :server_health in factors
    assert Enum.all?(reqs, &(&1.kind == :sensor_request))
  end

  test "a single confident reading raises no request" do
    {_ewma, reqs} = SP.Producer.evolve(%{}, [{:drama, 0.9}])
    assert reqs == []
  end

  test "factor_confidence reports one entry per modality, named" do
    fc = Brain.new(seed: 1) |> Brain.factor_confidence()
    assert length(fc) == 11
    assert {:server_health, _} = Enum.find(fc, &(elem(&1, 0) == :server_health))
  end

  test "add_sensor grafts a new designed-prior factor and the producer still decides" do
    b = Brain.new(seed: 1)
    assert length(Brain.beliefs(b)) == 11

    b2 = Brain.add_sensor(b, 3, [2.0, -1.0, -3.0])
    assert length(Brain.beliefs(b2)) == 12

    # it can step with the extended (12-factor) observation
    obs12 = [[2], [4], [0], [1], [2], [3], [0], [0], [2], [2], [2], [0]]
    {action, _b3} = Brain.act(b2, obs12)
    assert action in SP.Producer.Genome.actions()
  end
end
