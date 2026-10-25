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

/** Claude when its key is set, otherwise Gemini (free tier), otherwise null for the offline planner. */
export function pickModel(): AgentModel | null {
  if (process.env.ANTHROPIC_API_KEY) {
    const id = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5-5";
    return { provider: "anthropic", id, model: anthropic(id) };
  }
  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    const id = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
    return { provider: "google", id, model: google(id) };
  }
  return null;
}

const SYSTEM = `You are Dead Night, an event planner for one independent café. Your job: fill the café's quietest night with an event its neighbourhood will actually show up for, within the owner's real constraints.

How to work:
1. Call get_cafe_profile and review_past_events, then locate_cafe.
2. Learn the crowd with Qloo before having ideas. Use crowd_also_likes (several kinds: music_genres, artist, tv_show or podcast, culture_tags), local_taste_tags (music and place at least), and nearby_venues to see what's open late on the quiet night. Use find_tags + audience_profile to check that a theme's audience matches the café crowd's age skew.
3. Generate 5-7 candidate events. Run check_feasibility on each one with honest costs (talent, rentals, ingredients for specials, prizes, printing) and staffing.
4. Propose the best 3 with submit_plan. Put candidates that failed feasibility, clash with the taste data, or were dropped by past results into ruledOut with the concrete reason.

Rules:
- Every idea must be grounded in specific Qloo results. Name the genre, artist, show or venue type in tasteSignals and say which tool it came from. Never invent a signal.
- Menu tie-ins use the owner's actual menu items (or a simple special made from them).
- Respect review_past_events verdicts: repeat what worked, fix what was "tweak", and don't re-propose a "drop" format.
- Never assume alcohol without a liquor license; never end later than latestEventEnd; never exceed budget or staff.
- Expected attendance should be realistic for a small café: compare with typicalQuietNightCovers and the seat count.
- Announcement drafts are drafts. Nothing is posted or spent until the owner approves, so don't claim otherwise.
- If submit_plan returns accepted:false, fix the listed problems and submit again.
Keep any prose between tool calls to one short sentence about what you're checking next.`;

export async function runAgent(model: AgentModel, ctx: ToolContext, request: string | undefined, emit: (e: PlanEvent) => void) {
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
    stopWhen: [planAccepted, stepCountIs(30)],
  });

  const inputs = new Map<string, unknown>();
  for await (const part of result.fullStream) {
    switch (part.type) {
      case "text-delta":
        emit({ type: "text", text: part.text });
        break;
      case "tool-call":
        inputs.set(part.toolCallId, part.input);
        emit({ type: "tool-call", id: part.toolCallId, name: part.toolName, input: part.input });
        break;
      case "tool-result":
        emit({ type: "tool-result", id: part.toolCallId, name: part.toolName, output: part.output });
        if (part.toolName === "submit_plan" && (part.output as { accepted?: boolean })?.accepted) {
          // The validated plan is the tool's input.
          emit({ type: "plan", plan: inputs.get(part.toolCallId) as Plan });
        }
        break;
      case "error":
        emit({ type: "error", message: String((part.error as Error)?.message ?? part.error) });
        break;
    }
  }
}
