defmodule SP.Brain.SelfLocationTest do
  @moduledoc """
  U11: the out-of-body experiment. Agreeing senses ⇒ the self-location posterior sits on
  the body. Under CONFLICT with visual precision dominant, it shifts OFF the body; with
  proprioceptive precision dominant, it stays on the body (the control). This reproduces
  the report via precision-weighted inference — not a claim the self left the body.
  """
  use ExUnit.Case, async: true

  alias SP.Brain.SelfLocation, as: SL

  test "agreeing senses ⇒ the self-location posterior sits ON the body" do
    m = SL.model(5, 1.0, 1.0)
    assert SL.where(m, 0, 0) == 0
  end

  test "FALSIFICATION: conflict + visual precision dominant ⇒ the self relocates OFF the body" do
    # proprioception says on-body (0); vision says displaced (3); vision is trusted.
    m = SL.model(5, 0.3, 4.0)
    assert SL.where(m, 0, 3) == 3
  end

  test "CONTROL: the same conflict with proprioception dominant keeps the self on-body" do
    m = SL.model(5, 4.0, 0.3)
    assert SL.where(m, 0, 3) == 0
  end

  test "the posterior is a proper distribution over locations" do
    m = SL.model(5, 0.3, 4.0)
    q = SL.locate(m, 0, 3)
    assert_in_delta Enum.sum(q), 1.0, 1.0e-9
    assert length(q) == 5
  end
end
