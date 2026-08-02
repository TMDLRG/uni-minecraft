# Re-trigger the colony after a phx.server restart: start the Producer (camera/show + :3020) and respawn
# the 5 design UNIs as UNI-kin-1 (idx 1 on a fresh colony) so they reload runs/colony/UNI-kin-1.bin brains
# + MC restores their saved inventory (logs/tables) under the NEW body.js (the WS-A doCraft fix).
node = :"uni@Thinker"
unless Node.connect(node) == true do
  IO.puts("connect FAILED"); System.halt(1)
end
IO.puts("connected to #{node}")
IO.inspect(:rpc.call(node, SP.Producer, :ensure_started, []), label: "producer.ensure_started")
Process.sleep(1500)
for kin <- [0, 1, 1, 2, 3] do
  IO.inspect(:rpc.call(node, SP.Brain.Colony, :spawn_agent, [kin, "see_all"]), label: "spawn kin #{kin}")
  Process.sleep(2500)
end
Process.sleep(3000)
names =
  case :rpc.call(node, SP.Runtime.Board, :all, []) do
    l when is_list(l) -> Enum.map(l, &Map.get(&1, :username))
    other -> other
  end
IO.inspect(names, label: "board usernames")
