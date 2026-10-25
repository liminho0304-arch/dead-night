import { pickModels, runAgent } from "@/lib/agent";
import { runOfflinePlanner } from "@/lib/offline";
import type { PlanEvent } from "@/lib/events";
import type { PlanRequest } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  const body = (await req.json()) as PlanRequest;
  if (!body?.cafe?.name || !body.cafe.address) return Response.json({ error: "Café name and address are required." }, { status: 400 });

  const models = body.mode === "offline" ? [] : pickModels();
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (e: PlanEvent) => controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      const ctx = { cafe: body.cafe, history: body.history ?? [] };
      try {
        const planned = models.length > 0 && (await runAgent(models, ctx, body.request, emit));
        if (!planned) {
          // No model configured, or the model ran out of quota mid-plan: the offline planner still delivers.
          emit({ type: "start", mode: "offline" });
          await runOfflinePlanner(ctx, emit);
        }
      } catch (err) {
        emit({ type: "error", message: (err as Error).message });
      }
      emit({ type: "done" });
      controller.close();
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
}
