defmodule SP.Brain.MinecraftCorpus do
  @moduledoc """
  TRAINING DATA — the world of Minecraft, in words. A procedural generator of show-style sentences
  about the Minecraft world, tagged by SCENE-TYPE (what's on the screen): forest, cave, plains,
  night, danger, water, mining, building, calm, hunt, day. Pure data — combinatorial fills over a
  Minecraft vocabulary, no LLM, no scraping. The deeper language model (`SP.Brain.Language`) learns
  from this body of text and recombines it; the scene-type is the "meaning" it conditions on, so —
  paired with the visual cortex's scene-state and the body's symbolic senses — the producer can
  describe WHAT IT SEES. The bigger/more varied the corpus, the better it talks (training is the lever).
  """

  @subj ~w(unit colony builder hunter wanderer forager miner scout)
  @tree ~w(oak birch spruce jungle acacia)
  @ore ~w(coal iron gold diamond stone cobblestone)
  @mob ~w(zombie skeleton creeper spider witch)
  @animal ~w(cow sheep pig chicken rabbit)
  @biome ~w(forest plains desert mountains swamp jungle tundra hills meadow)

  # scene-type => list of templates with {slots} drawn from the vocab maps below.
  @templates %{
    forest: [
      "the {subj} forages among the {tree} trees of the green forest",
      "tall {tree} trees rise green over the {subj} in the wood",
      "the {subj} gathers wood from the {tree} logs by the trees",
      "sunlight falls through the {tree} leaves on the quiet forest floor",
      "the {subj} walks deep into the shade of the {tree} wood",
      "birds call over the {tree} canopy as the {subj} cuts wood",
      "the forest is thick with {tree} trees around the {subj}",
      "the {subj} fells a {tree} trunk and stacks the logs"
    ],
    cave: [
      "deep in the dark cave the {subj} mines the {ore}",
      "the {subj} digs through cold stone seeking the {ore}",
      "torchlight flickers as the {subj} tunnels for {ore}",
      "the narrow cave winds down where the {subj} works the {ore}",
      "the {subj} hears water drip in the black depths of the cave",
      "the cave opens wide and the {subj} finds a vein of {ore}",
      "the {subj} crawls through the low cave toward the {ore}",
      "shadows shift as the {subj} carves into the cave wall"
    ],
    plains: [
      "the {subj} crosses the open {biome} under a wide blue sky",
      "grass waves over the {biome} as the {subj} wanders far",
      "the {biome} stretches flat and far before the {subj}",
      "the {subj} walks the rolling {biome} toward the hills",
      "a soft wind moves the grass as the {subj} roams the {biome}",
      "the {biome} is calm and open around the lone {subj}"
    ],
    night: [
      "night falls and the {subj} seeks shelter from the dark",
      "under the dark sky a {mob} stirs near the {subj}",
      "stars rise over the {biome} as the {subj} keeps watch",
      "the cold night closes in and the {subj} builds a wall",
      "the moon climbs as the {subj} hides from the night",
      "darkness covers the {biome} and the {subj} waits for dawn",
      "a {mob} groans in the dark as the {subj} holds its ground",
      "the {subj} lights a torch against the deep night"
    ],
    danger: [
      "a {mob} closes in as the {subj} flees for its life",
      "the {subj} fights the {mob} to survive the night",
      "fear grips the {subj} as the {mob} draws near",
      "the {subj} runs from the {mob} across the dark {biome}",
      "the {mob} lunges and the {subj} strikes back hard",
      "wounded and afraid the {subj} backs away from the {mob}",
      "the {subj} is cornered by the {mob} near the cliff",
      "danger rises as more than one {mob} hunts the {subj}"
    ],
    water: [
      "the {subj} swims across the cold deep water",
      "waves lap the shore as the {subj} wades through water",
      "the {subj} crosses the river toward the far bank",
      "the {subj} dives under the dark water for a moment",
      "the {subj} struggles against the current of the wide river",
      "rain falls on the water as the {subj} swims for land"
    ],
    mining: [
      "the {subj} mines the {ore} from the grey stone",
      "stone breaks as the {subj} digs out the {ore}",
      "the {subj} hauls the {ore} back from the deep rock",
      "the {subj} swings a pick and the {ore} comes loose",
      "the {subj} stacks the {ore} it pulled from the stone",
      "the {subj} chips through hard rock to reach the {ore}"
    ],
    building: [
      "stone by stone the {subj} builds a shelter before night",
      "the {subj} raises a wall of cobblestone against the cold",
      "the {subj} lays planks to floor a small safe home",
      "the {subj} stacks blocks to close the door before dark",
      "the {subj} shapes a roof of wood over the shelter",
      "brick by brick the {subj} walls itself safe for the night"
    ],
    calm: [
      "the colony rests calm in the {biome} under a clear sky",
      "all is quiet as the {subj} eats and gathers strength",
      "the {subj} stands content with food and wood in store",
      "the {subj} sits by the fire as the day winds down",
      "peace settles over the {biome} and the {subj} rests",
      "the {subj} is calm and well fed in the warm {biome}"
    ],
    hunt: [
      "the {subj} hunts the {animal} across the open {biome}",
      "the {subj} chases a {animal} through the tall grass",
      "the {subj} strikes the {animal} for food before night",
      "the {subj} stalks a {animal} at the edge of the {biome}",
      "the {subj} corners the {animal} against the trees",
      "the {subj} brings down a {animal} and gathers the meat"
    ],
    day: [
      "morning light spreads warm over the {biome}",
      "the bright day rises and the {subj} sets to work",
      "the sun climbs high over the {biome} and the {subj}",
      "a clear day opens over the {biome} for the {subj}",
      "warm light falls on the {biome} as the {subj} forages",
      "the day is bright and the {subj} works in the open {biome}"
    ]
  }

  @doc "Generate `{sentence, scene_type}` training pairs — `:per` fills per template (default 12)."
  def generate(opts \\ []) do
    per = Keyword.get(opts, :per, 12)
    rng = :rand.seed_s(:exsss, {Keyword.get(opts, :seed, 11), 5, 9})

    {pairs, _} =
      Enum.flat_map_reduce(@templates, rng, fn {scene, tmpls}, r0 ->
        Enum.flat_map_reduce(tmpls, r0, fn t, r1 ->
          Enum.map_reduce(1..per, r1, fn _, r ->
            {s, r2} = fill(t, r)
            {{s, scene}, r2}
          end)
        end)
      end)

    Enum.uniq(pairs)
  end

  @doc "All scene-types the corpus covers (the meanings the producer can describe)."
  def scenes, do: Map.keys(@templates)

  # fill {slots} in a template from the vocab (random pick per slot, deterministic via rng).
  defp fill(template, rng) do
    Regex.scan(~r/\{(\w+)\}/, template)
    |> List.flatten()
    |> Enum.filter(&String.starts_with?(&1, "{"))
    |> Enum.reduce({template, rng}, fn slot, {acc, r} ->
      key = slot |> String.trim_leading("{") |> String.trim_trailing("}")
      {word, r2} = pick(vocab(key), r)
      {String.replace(acc, slot, word, global: false), r2}
    end)
  end

  defp vocab("subj"), do: @subj
  defp vocab("tree"), do: @tree
  defp vocab("ore"), do: @ore
  defp vocab("mob"), do: @mob
  defp vocab("animal"), do: @animal
  defp vocab("biome"), do: @biome
  defp vocab(_), do: ["thing"]

  defp pick(list, rng) do
    {r, rng} = :rand.uniform_s(rng)
    {Enum.at(list, trunc(r * length(list)) |> min(length(list) - 1)), rng}
  end
end
