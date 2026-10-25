// Runs the offline planner against live Qloo and prints the trace. Usage: npm run smoke
import { runOfflinePlanner } from "../lib/offline";
import { DEMO_CAFE, DEMO_HISTORY } from "../lib/seed";

runOfflinePlanner({ cafe: DEMO_CAFE, history: DEMO_HISTORY }, (e) => {
  if (e.type === "tool-call") console.log(`→ ${e.name} ${JSON.stringify(e.input).slice(0, 120)}`);
  else if (e.type === "tool-result") console.log(`  ← ${JSON.stringify(e.output).slice(0, 220)}`);
  else console.log(JSON.stringify(e, null, 2));
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
