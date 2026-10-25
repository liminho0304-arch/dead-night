import type { Plan } from "./types";

/** Newline-delimited JSON events streamed from /api/plan to the browser. */
export type PlanEvent =
  | { type: "start"; mode: "agent" | "offline"; model?: string }
  | { type: "text"; text: string }
  | { type: "tool-call"; id: string; name: string; input: unknown }
  | { type: "tool-result"; id: string; name: string; output: unknown }
  | { type: "plan"; plan: Plan }
  | { type: "error"; message: string }
  | { type: "notice"; message: string }
  | { type: "done" };
