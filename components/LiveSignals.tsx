"use client";
import type { TraceStep } from "./Trace";

const STAGES = [
  { label: "Reading your café and past results", tools: ["get_cafe_profile", "review_past_events"] },
  { label: "Learning what your crowd loves from Qloo", tools: ["locate_cafe", "crowd_also_likes", "local_taste_tags", "local_favorites", "nearby_venues", "find_tags", "audience_profile"] },
  { label: "Testing ideas against budget, staff and hours", tools: ["check_feasibility"] },
  { label: "Writing your plan", tools: ["submit_plan"] },
];

const GROUPS: Record<string, string> = {
  music_genres: "Music they over-index on",
  artist: "Artists",
  tv_show: "TV",
  podcast: "Podcasts",
  movie: "Films",
  book: "Books",
  culture_tags: "Interests",
  brand: "Brands",
  music: "Neighbourhood music",
  place: "Where the neighbourhood goes",
  media: "Neighbourhood reading",
  culture: "Neighbourhood interests",
};

type Named = { name: string };

/** What the agent has learned so far, shown while it works so the wait shows Qloo doing its job. */
export function LiveSignals({ steps }: { steps: TraceStep[] }) {
  const seen = new Set(steps.map((s) => s.name));
  const current = STAGES.reduce((acc, st, i) => (st.tools.some((t) => seen.has(t)) ? i : acc), 0);

  const groups = new Map<string, string[]>();
  let where: string | null = null;
  let checked = 0;
  let failed = 0;
  for (const s of steps) {
    const out = s.output as Record<string, unknown> | Named[] | undefined;
    if (!out || (typeof out === "object" && "error" in out)) continue;
    const kind = String((s.input as { kind?: string })?.kind ?? "");
    if (s.name === "locate_cafe") where = String((out as { crowdSignal?: string }).crowdSignal ?? "");
    if (s.name === "crowd_also_likes" || s.name === "local_taste_tags" || s.name === "local_favorites") {
      const list = (Array.isArray(out) ? out : ((out as { results?: Named[] }).results ?? [])) as Named[];
      const label = GROUPS[kind] ?? kind;
      const names = list.slice(0, 4).map((x) => x.name);
      if (names.length) groups.set(label, [...new Set([...(groups.get(label) ?? []), ...names])].slice(0, 5));
    }
    if (s.name === "check_feasibility") {
      checked++;
      if (!(out as { feasible?: boolean }).feasible) failed++;
    }
  }

  return (
    <div className="card p-6">
      <ol className="space-y-2">
        {STAGES.map((st, i) => (
          <li key={st.label} className={`flex items-center gap-3 text-sm ${i < current ? "text-night-400" : i === current ? "text-white" : "text-night-600"}`}>
            <span className="w-4 text-center">{i < current ? "✓" : i === current ? <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-lamp-400" /> : "·"}</span>
            {st.label}
            {i === 2 && checked > 0 && (
              <span className="text-xs text-night-400">
                {checked} checked, {failed} ruled out
              </span>
            )}
          </li>
        ))}
      </ol>
      {(where || groups.size > 0) && (
        <div className="mt-6 border-t border-night-700 pt-5">
          <p className="label">What Qloo says about your crowd so far</p>
          {where && <p className="mt-1 text-xs text-night-400">Signal: {where}</p>}
          <dl className="mt-3 space-y-3">
            {[...groups].map(([label, names]) => (
              <div key={label}>
                <dt className="text-xs text-night-400">{label}</dt>
                <dd className="mt-1 flex flex-wrap gap-1.5">
                  {names.map((n) => (
                    <span key={n} className="animate-[fadein_.4s_ease-out] rounded-full border border-lamp-400/30 bg-lamp-400/10 px-2.5 py-0.5 text-xs text-lamp-300">
                      {n}
                    </span>
                  ))}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}
