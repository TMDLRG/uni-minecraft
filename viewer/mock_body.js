// Test double for SP.Brain.Bridge — NO Minecraft. Drives the stdio blanket in
// lockstep: emit a sense line, read one action line, repeat N times, then exit.
// Proves the Port framing + one-sense-in / one-action-out discipline.

const N = parseInt(process.env.MOCK_N || "5", 10);
let i = 0;

// health;food;wood;tools;foodCount;look;hostileDist;hurt
const sense = () => "20;18;0;0;0;oak_log;;false";

process.stdout.write(sense() + "\n"); // first sense (σ → brain)

let buf = "";
process.stdin.on("data", (d) => {
  buf += d.toString();
  let idx;
  while ((idx = buf.indexOf("\n")) >= 0) {
    buf = buf.slice(idx + 1); // an action (α ← brain) was received
    i += 1;
    if (i >= N) {
      process.exit(0);
    }
    process.stdout.write(sense() + "\n"); // next sense, lockstep
  }
});
