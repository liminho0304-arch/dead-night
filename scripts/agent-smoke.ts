// Runs the LLM agent against live Qloo and prints the trace. Needs a model key in the environment.
import { pickModels, runAgent } from "../lib/agent";
import { DEMO_CAFE, DEMO_HISTORY } from "../lib/seed";

const models = pickModels();
if (!models.length) {
  console.error("Set ANTHROPIC_API_KEY or GOOGLE_GENERATIVE_AI_API_KEY.");
  process.exit(1);
}
runAgent(models, { cafe: DEMO_CAFE, history: DEMO_HISTORY }, undefined, (e) => {
  if (e.type === "tool-call") console.log(`→ ${e.name} ${JSON.stringify(e.input).slice(0, 160)}`);
  else if (e.type === "tool-result") console.log(`  ← ${JSON.stringify(e.output).slice(0, 200)}`);
  else if (e.type === "text") process.stdout.write(e.text);
  else console.log(JSON.stringify(e, null, 2));
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
