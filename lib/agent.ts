import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import { streamText, tool, stepCountIs, type LanguageModel, type StopCondition, type ToolSet } from "ai";
import { makeTools, type ToolContext } from "./tools";
import type { PlanEvent } from "./events";
import type { Plan } from "./types";

export interface AgentModel {
  provider: "anthropic" | "google";
  id: string;
  model: LanguageModel;
}

/** Models that hit a quota or capacity error, skipped by this server instance for a while. */
const exhausted = new Map<string, number>();
const COOLDOWN_MS = 30 * 60 * 1000;

/**
 * Claude when its key is set, otherwise Gemini (free tier), otherwise none and the offline planner runs.
 * Model env vars take a comma-separated list; later models are fallbacks when one is overloaded.
 */
export function pickModels(): AgentModel[] {
  for (const [id, until] of exhausted) if (Date.now() > until) exhausted.delete(id);
  const list = (v: string | undefined, dflt: string) => (v || dflt).split(",").map((x) => x.trim()).filter(Boolean);
  if (process.env.ANTHROPIC_API_KEY) {
    return list(process.env.ANTHROPIC_MODEL, "claude-sonnet-5-5").map((id) => ({ provider: "anthropic" as const, id, model: anthropic(id) }));
  }
  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    // The free tier allows only ~20 requests per model per day, so spread runs across several models.
    return list(process.env.GEMINI_MODEL, "gemini-3.6-flash,gemini-3.5-flash,gemini-3.5-flash-lite,gemini-3.1-flash-lite")
      .filter((id) => !exhausted.has(id))
      .map((id) => ({ provider: "google" as const, id, model: google(id) }));
  }
  return [];
}

const SYSTEM = `You are Dead Night, an event planner for one independent café. Your job: fill the café's quietest night with an event its neighbourhood will actually show up for, within the owner's real constraints.

How to work:
1. Call get_cafe_profile and review_past_events, then locate_cafe.
2. Learn the crowd with Qloo before having ideas. Use crowd_also_likes (several kinds: music_genres, artist, tv_show or podcast, culture_tags), local_taste_tags (music and place at least), and nearby_venues to see what's open late on the quiet night. Use find_tags + audience_profile to check that a theme's audience matches the café crowd's age skew.
3. Generate 5-7 candidate events. Run check_feasibility on each one with honest costs (talent, rentals, ingredients for specials, prizes, printing) and staffing.
4. Propose the best 3 with submit_plan. Put candidates that failed feasibility, clash with the taste data, or were dropped by past results into ruledOut with the concrete reason.

Rules:
- Every idea must be grounded in specific Qloo results. Each tasteSignals label names the actual genres, artists, shows or venue types Qloo returned (e.g. "Crowd loves 2 Dope Queens and Las Culturistas"), never a generic phrase like "genre affinity". Put the tool name only in the source field. Never invent a signal.
- Write for a café owner: plain words, no tool names or field names in headline, audienceSummary, pitch or whyItFits. Do the research before ideas: call at least 8 Qloo tools.
- Menu tie-ins use the owner's actual menu items (or a simple special made from them).
- Respect review_past_events verdicts: repeat what worked, fix what was "tweak", and don't re-propose a "drop" format.
- Never assume alcohol without a liquor license; never end later than latestEventEnd; never exceed budget or staff.
- Expected attendance should be realistic for a small café: compare with typicalQuietNightCovers and the seat count.
- Announcement drafts are drafts. Nothing is posted or spent until the owner approves, so don't claim otherwise.
- If submit_plan returns accepted:false, fix the listed problems and submit again.
Keep any prose between tool calls to one short sentence about what you're checking next.`;

/** Returns true if the agent delivered an accepted plan. */
export async function runAgent(models: AgentModel[], ctx: ToolContext, request: string | undefined, emit: (e: PlanEvent) => void) {
  for (let i = 0; i < models.length; i++) {
    const last = i === models.length - 1;
    emit({ type: "start", mode: "agent", model: models[i].id });
    const outcome = await attempt(models[i], ctx, request, emit, last);
    if (outcome === "planned") return true;
    if (outcome === "failed") return false;
  }
  return false;
}

/** "retry" means the model failed before doing anything (overloaded, out of quota) and another model can take over. */
async function attempt(
  model: AgentModel,
  ctx: ToolContext,
  request: string | undefined,
  emit: (e: PlanEvent) => void,
  last: boolean,
): Promise<"planned" | "failed" | "retry"> {
  const defs = makeTools(ctx);
  const tools: ToolSet = {};
  for (const [name, def] of Object.entries(defs)) {
    tools[name] = tool({
      description: def.description,
      inputSchema: def.inputSchema,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      execute: async (input: any) => {
        try {
          return await (def.run as (i: unknown) => Promise<unknown>)(input);
        } catch (err) {
          return { error: (err as Error).message };
        }
      },
    });
  }

  const planAccepted: StopCondition<ToolSet> = ({ steps }) => {
    const last = steps.at(-1);
    return !!last?.toolResults.some((r) => r.toolName === "submit_plan" && (r.output as { accepted?: boolean })?.accepted);
  };

  const result = streamText({
    model: model.model,
    system: SYSTEM,
    prompt: `Plan this week's ${ctx.cafe.quietNight} event for ${ctx.cafe.name}.${request ? ` The owner adds: "${request}"` : ""}`,
    tools,
    // Always call a tool, so the model can't wander off into prose; it ends by submitting a plan.
    toolChoice: "required",
    stopWhen: [planAccepted, stepCountIs(30)],
    maxRetries: 1,
  });

  const inputs = new Map<string, unknown>();
  let started = false;
  let planned = false;
  for await (const part of result.fullStream) {
    switch (part.type) {
      case "text-delta":
        emit({ type: "text", text: part.text });
        break;
      case "tool-call":
        started = true;
        inputs.set(part.toolCallId, part.input);
        emit({ type: "tool-call", id: part.toolCallId, name: part.toolName, input: part.input });
        break;
      case "tool-result":
        emit({ type: "tool-result", id: part.toolCallId, name: part.toolName, output: part.output });
        if (part.toolName === "submit_plan" && (part.output as { accepted?: boolean })?.accepted) {
          // The validated plan is the tool's input.
          planned = true;
          emit({ type: "plan", plan: inputs.get(part.toolCallId) as Plan });
        }
        break;
      case "tool-error":
        // Invalid tool input or a thrown tool; show it in the trace and let the model correct itself.
        emit({ type: "tool-result", id: part.toolCallId, name: part.toolName, output: { error: String((part.error as Error)?.message ?? part.error).slice(0, 300) } });
        break;
      case "finish-step":
        if (process.env.DEBUG_AGENT) console.error(`[agent] step finished: ${part.finishReason}`);
        break;
      case "error": {
        const message = String((part.error as Error)?.message ?? part.error);
        if (/quota|high demand|overloaded|rate limit|429|503/i.test(message)) exhausted.set(model.id, Date.now() + COOLDOWN_MS);
        const capacity = /quota|high demand|overloaded|rate limit|429|503/i.test(message);
        // Another model can take over from scratch; Qloo results are cached, so the redo is cheap.
        if ((capacity || !started) && !last) return "retry";
        const reason = /quota|rate limit|429/i.test(message) ? "hit its usage limit" : /high demand|overloaded|503/i.test(message) ? "is overloaded" : "stopped with an error";
        console.error(`[agent] ${model.id}: ${message}`);
        emit({ type: "notice", message: `${model.id} ${reason}` });
        return "failed";
      }
    }
  }
  if (!planned) emit({ type: "notice", message: `${model.id} stopped before submitting a plan` });
  return planned ? "planned" : "failed";
}
