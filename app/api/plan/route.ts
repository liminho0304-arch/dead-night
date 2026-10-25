import { pickModel, runAgent } from "@/lib/agent";
import { runOfflinePlanner } from "@/lib/offline";
import type { PlanEvent } from "@/lib/events";
import type { PlanRequest } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  const body = (await req.json()) as PlanRequest;
  if (!body?.cafe?.name || !body.cafe.address) return Response.json({ error: "Café name and address are required." }, { status: 400 });

  const model = body.mode === "offline" ? null : pickModel();
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (e: PlanEvent) => controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      const ctx = { cafe: body.cafe, history: body.history ?? [] };
      emit({ type: "start", mode: model ? "agent" : "offline", model: model?.id });
      try {
        if (model) await runAgent(model, ctx, body.request, emit);
        else await runOfflinePlanner(ctx, emit);
      } catch (err) {
        emit({ type: "error", message: (err as Error).message });
      }
      emit({ type: "done" });
      controller.close();
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
}
