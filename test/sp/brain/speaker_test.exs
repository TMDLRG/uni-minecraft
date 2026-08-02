defmodule SP.Brain.SpeakerTest do
  @moduledoc "The producer's voice: grounded grade-4 speech + the no-hallucination grounding check."
  use ExUnit.Case, async: true

  alias SP.Brain.Speaker

  @rows [
    %{who: "UNI-1-1", emotion: :fear, context: :flee, action: "forward", senses: %{"health" => 5}},
    %{who: "UNI-1-2", emotion: :content, context: :forage, action: "mine", senses: %{"food" => 18}}
  ]

  test "say/1 produces a grounded, multilingual line for an agent" do
    out = Speaker.say(hd(@rows))
    assert is_map(out) and is_binary(out.en) and out.en =~ "UNI-1-1"
  end

  test "the produced line is GROUNDED — only names the cast it can see" do
    state = Speaker.state_of(@rows)
    line = Speaker.line(hd(@rows))
    assert Speaker.grounded?(line, state)
  end

  test "grounding REJECTS hallucinated facts (it bites — falsifiable no-fake-speech)" do
    state = Speaker.state_of(@rows)
    # a UNI not in the cast, or a number not in the state, must be flagged as ungrounded
    refute Speaker.grounded?("UNI-9-9 is hurt", state)
    refute Speaker.grounded?("there are 999 units online", state)
    # a true statement about the cast is grounded
    assert Speaker.grounded?("UNI-1-2 forages", state)
  end

  test "state_of/1 collects the visible cast + numbers" do
    state = Speaker.state_of(@rows)
    assert "UNI-1-1" in state.cast and "UNI-1-2" in state.cast
    assert 2 in state.numbers
  end
end
