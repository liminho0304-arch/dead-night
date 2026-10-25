"use client";
import { useState } from "react";

export interface TraceStep {
  id: string;
  name: string;
  input: unknown;
  output?: unknown;
}

const LABELS: Record<string, { icon: string; text: (input: Record<string, unknown>) => string; qloo?: boolean }> = {
  get_cafe_profile: { icon: "☕", text: () => "Reading your café profile" },
  review_past_events: { icon: "📒", text: () => "Reviewing results of past events" },
  locate_cafe: { icon: "📍", text: () => "Finding the café in Qloo's taste graph", qloo: true },
  crowd_also_likes: { icon: "🔗", text: (i) => `What your crowd also loves: ${String(i.kind).replace("_", " ")}`, qloo: true },
  local_taste_tags: { icon: "🗺️", text: (i) => `Neighbourhood taste: ${i.kind}`, qloo: true },
  local_favorites: { icon: "⭐", text: (i) => `Local favourites: ${String(i.kind).replace("_", " ")}`, qloo: true },
  nearby_venues: { icon: "🌃", text: () => "What else is open nearby that night", qloo: true },
  find_tags: { icon: "🏷️", text: (i) => `Looking up the "${i.query}" audience`, qloo: true },
  audience_profile: { icon: "👥", text: () => "Comparing audience age and gender skew", qloo: true },
  check_feasibility: { icon: "🧮", text: (i) => `Checking "${i.title}" against budget, staff and hours` },
  submit_plan: { icon: "📝", text: () => "Submitting the plan for your approval" },
};

function summarize(name: string, output: unknown): string {
  if (output && typeof output === "object" && "error" in output) return `⚠ ${(output as { error: string }).error}`;
  const names = (xs: unknown) =>
    Array.isArray(xs)
      ? xs
          .slice(0, 5)
          .map((x) => (x as { name?: string }).name)
          .filter(Boolean)
          .join(", ")
      : "";
  switch (name) {
    case "locate_cafe": {
      const o = output as { matched: string; name: string; crowdSignal: string };
      return o.matched === "cafe" ? `Found ${o.name}. Signal: ${o.crowdSignal}` : `Using ${o.name}; signal: ${o.crowdSignal}`;
    }
    case "crowd_also_likes":
      return names((output as { results: unknown[] }).results) || "No results";
    case "local_taste_tags":
    case "local_favorites":
    case "find_tags":
      return names(output) || "No results";
    case "nearby_venues": {
      const o = output as { openLateCount: number; venues: unknown[] };
      return `${o.venues.length} venues, ${o.openLateCount} open past 8pm: ${names(o.venues)}`;
    }
    case "audience_profile":
      return `${(output as unknown[]).length} audience profiles`;
    case "review_past_events": {
      const o = output as { reviews: { title: string; verdict: string }[] };
      return o.reviews.length ? o.reviews.map((r) => `${r.title}: ${r.verdict}`).join(" · ") : "No past results yet";
    }
    case "check_feasibility": {
      const o = output as { feasible: boolean; blockers: string[]; warnings: string[] };
      return o.feasible ? `✓ Feasible${o.warnings.length ? ` (${o.warnings[0]})` : ""}` : `✗ ${o.blockers.join(" ")}`;
    }
    case "submit_plan": {
      const o = output as { accepted: boolean; problems?: string[] };
      return o.accepted ? "✓ Plan ready" : `✗ Sent back: ${o.problems?.join(" ")}`;
    }
    case "get_cafe_profile":
      return "Loaded";
    default:
      return "";
  }
}

export function Trace({ steps, running, thoughts }: { steps: TraceStep[]; running: boolean; thoughts: string }) {
  const [open, setOpen] = useState<string | null>(null);
  const qlooCalls = steps.filter((s) => LABELS[s.name]?.qloo).length;
  return (
    <div className="card p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="label">Agent trace</span>
        <span className="text-xs text-night-400">
          {steps.length} steps · <span className="text-lamp-400">{qlooCalls} Qloo calls</span>
        </span>
      </div>
      <ol className="space-y-1.5">
        {steps.map((s) => {
          const l = LABELS[s.name] ?? { icon: "•", text: () => s.name };
          const done = s.output !== undefined;
          return (
            <li key={s.id} className="text-sm">
              <button className="flex w-full items-start gap-2 text-left" onClick={() => setOpen(open === s.id ? null : s.id)}>
                <span className="w-5 shrink-0 text-center">{done ? l.icon : <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-lamp-400" />}</span>
                <span className="min-w-0 flex-1">
                  <span className={l.qloo ? "text-lamp-300" : "text-night-200"}>{l.text((s.input ?? {}) as Record<string, unknown>)}</span>
                  {done && <span className="block truncate text-xs text-night-400">{summarize(s.name, s.output)}</span>}
                </span>
              </button>
              {open === s.id && (
                <pre className="mt-1 ml-7 max-h-64 overflow-auto rounded-lg bg-night-950 p-2 text-[11px] text-night-400">
                  {JSON.stringify({ input: s.input, output: s.output }, null, 2)}
                </pre>
              )}
            </li>
          );
        })}
        {running && steps.length === 0 && <li className="text-sm text-night-400">Starting…</li>}
      </ol>
      {thoughts && <p className="mt-3 border-t border-night-700 pt-3 text-xs italic text-night-400">{thoughts.slice(-400)}</p>}
    </div>
  );
}
