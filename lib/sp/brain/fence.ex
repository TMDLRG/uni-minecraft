defmodule SP.Brain.Fence do
  @moduledoc """
  The claim fence, in ONE place (WS3-A). On-air text describes BEHAVIOUR / viability-learning
  only — never experience, consciousness, or life. This is the binding honesty rule from
  `docs/LAB_PROTOCOL.md` / `CLAUDE.md`, and this module is the Elixir-side gate every narration
  line passes through before it reaches the broadcast.

  The token list is versioned in `production/schemas/claim_fence.json` (v1.0.0 — the reviewed
  union of the once-divergent copies; changing it requires /lab-team-review). This regex and the
  JS copy in `viewer/command_center.cjs` MUST carry the same token body; the drift guard is
  `test/sp/brain/fence_snapshot_test.exs`. A flagged line is DROPPED (honestly silent), never
  reworded into a subtly-different claim — exactly as the studio bridge does.

  Pure string work; no math, no I/O. (It names the banned CLAIM tokens, not the §16 foreign-mind
  tokens, so it is inert to gates 14/18.)
  """

  # behaviour-only: bans prove/conscious/aware/alive/living/experience/feel/suffer/first-ever/agi/…
  @fence ~r/\b(prov(e[sd]?|en|ing)|proof|conscious\w*|sentien\w*|self.?aware\w*|aware(ness)?|alive|living|life.?form\w*|digital\s+life|new\s+life|experienc\w*|feel(s|ings?)?|felt|suffer\w*|first.?ever|world.?s?.?first|breakthrough|agi|human.?level)\b/i

  @doc "True when `text` carries no banned claim word."
  @spec clean?(term) :: boolean
  def clean?(text) when is_binary(text), do: not Regex.match?(@fence, text)
  def clean?(_), do: true

  @doc "The first banned word in `text`, or nil."
  @spec flag(term) :: String.t() | nil
  def flag(text) when is_binary(text) do
    case Regex.run(@fence, text) do
      [w | _] -> w
      _ -> nil
    end
  end

  def flag(_), do: nil

  @doc """
  Gate a narration line `%{text, i18n}`: return it unchanged only if EVERY string (the English
  `text` AND every `i18n` language) is clean; otherwise nil — drop it, honestly silent. A line
  that trips the fence never reaches air (better a beat of silence than an over-claim).
  """
  @spec gate_line(map) :: map | nil
  def gate_line(%{i18n: i18n} = line) when is_map(i18n) do
    strings = [Map.get(line, :text, "") | Map.values(i18n)]
    if Enum.all?(strings, &clean?/1), do: line, else: nil
  end

  def gate_line(%{text: t} = line), do: if(clean?(t), do: line, else: nil)
  def gate_line(_), do: nil
end
