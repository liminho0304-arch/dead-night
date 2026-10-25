import { z } from "zod";
import * as qloo from "./qloo";
import { checkFeasibility, reviewHistory } from "./ops";
import type { CafeProfile, EventRecord, Plan } from "./types";

/**
 * Every tool the planner can call, shared by the Claude agent and the offline planner.
 * Qloo tools go to the live API; the rest read the owner's own constraints and history.
 */
export interface ToolContext {
  cafe: CafeProfile;
  history: EventRecord[];
  /** Filled in by locate_cafe so later tools can default to it. */
  where?: Awaited<ReturnType<typeof qloo.locate>>;
  /** Café entities used as the "crowd" signal for cross-domain affinities. */
  crowdIds?: string[];
  crowdLabel?: string;
}

const entityKind = z.enum(qloo.ENTITY_TYPES);
const tagKind = z.enum(["music", "place", "media", "culture"]);

const needsSchema = z
  .object({
    alcohol: z.boolean().optional(),
    amplifiedSound: z.boolean().optional(),
    projector: z.boolean().optional(),
    outdoor: z.boolean().optional(),
    piano: z.boolean().optional(),
  })
  .optional()
  .describe("Equipment or licenses the event depends on.");

export const feasibilitySchema = z.object({
  title: z.string(),
  estimatedCost: z.number().describe("Total out-of-pocket cost in dollars."),
  staffNeeded: z.number().int(),
  expectedAttendance: z.number().int(),
  startTime: z.string().describe('24h "HH:MM"'),
  endTime: z.string().describe('24h "HH:MM"'),
  needs: needsSchema,
});

export const planSchema = z.object({
  headline: z.string().describe("One sentence: the opportunity on this café's quiet night."),
  audienceSummary: z.string().describe("Two or three sentences on who the local and café crowd is, grounded in the Qloo results."),
  ideas: z
    .array(
      z.object({
        id: z.string().describe("short slug"),
        title: z.string(),
        format: z.string().describe('Event type, e.g. "listening night", "trivia", "maker night".'),
        pitch: z.string().describe("One or two sentences a regular would read."),
        whyItFits: z.string().describe("Why this crowd will come, citing specific Qloo signals by name."),
        tasteSignals: z
          .array(z.object({ label: z.string(), source: z.string().describe("tool name that produced it"), detail: z.string().optional() }))
          .min(2),
        menuTieIns: z.array(z.string()).describe("Specific items from the owner's menu, or a small special built from them."),
        startTime: z.string(),
        endTime: z.string(),
        estimatedCost: z.number(),
        costBreakdown: z.array(z.object({ item: z.string(), amount: z.number() })),
        staffNeeded: z.number().int(),
        expectedAttendance: z.number().int(),
        risks: z.array(z.string()),
        announcementDraft: z.string().describe("A short Instagram/chalkboard announcement. The owner approves before anything is posted."),
        needs: needsSchema,
      }),
    )
    .min(2)
    .max(4),
  ruledOut: z
    .array(z.object({ idea: z.string(), reason: z.string().describe("Concrete reason: budget, staff, license, hours, taste mismatch, or past results.") }))
    .min(2),
  learningsApplied: z.array(z.string()).describe("How past event results changed this plan. Empty if there is no history."),
});

export function makeTools(ctx: ToolContext) {
  const where = () => {
    if (!ctx.where) throw new Error("Call locate_cafe first.");
    return ctx.where;
  };

  return {
    get_cafe_profile: {
      description: "Read the owner's café profile: quiet night, hours, seats, budget, staff, amenities, menu and notes.",
      inputSchema: z.object({}),
      run: async () => ctx.cafe,
    },
    locate_cafe: {
      description:
        "Find the café in Qloo's taste graph (or its neighbourhood if Qloo doesn't know the café). Also picks the 'crowd' signal used by crowd_also_likes. Call this first.",
      inputSchema: z.object({}),
      run: async () => {
        ctx.where = await qloo.locate(ctx.cafe.name, ctx.cafe.address);
        if (ctx.where.entityId) {
          ctx.crowdIds = [ctx.where.entityId];
          ctx.crowdLabel = `people who go to ${ctx.where.name}`;
        } else {
          const cafes = await qloo.nearbyVenues(ctx.where.lat, ctx.where.lon, ctx.cafe.quietNight, {
            tag: "urn:tag:category:place:cafe",
            take: 5,
            radius: 1500,
          });
          ctx.crowdIds = cafes.slice(0, 3).map((c) => c.id);
          const names = cafes.slice(0, 2).map((c) => c.name);
          ctx.crowdLabel = names.length ? `the crowd at nearby cafés like ${names.join(" and ")}` : "people nearby";
        }
        return { ...ctx.where, crowdSignal: ctx.crowdLabel };
      },
    },
    local_taste_tags: {
      description:
        "Qloo location insights: which genres/categories people around the café over-index on. kind=music (music genres), place (venue types they go to), media (book/podcast genres), culture (cross-domain interests).",
      inputSchema: z.object({ kind: tagKind, take: z.number().int().min(3).max(20).optional() }),
      run: async ({ kind, take }: { kind: qloo.TagKind; take?: number }) => qloo.localTasteTags(where().lat, where().lon, kind, take ?? 10),
    },
    local_favorites: {
      description: "Qloo location insights: the specific artists, films, TV shows, books, podcasts, brands or games most loved around the café.",
      inputSchema: z.object({ kind: entityKind, take: z.number().int().min(3).max(15).optional() }),
      run: async ({ kind, take }: { kind: qloo.EntityKind; take?: number }) => qloo.localFavorites(where().lat, where().lon, kind, take ?? 8),
    },
    crowd_also_likes: {
      description:
        "Qloo cross-domain affinities for the café crowd itself (the café, or nearby cafés if Qloo doesn't know it): what these coffee drinkers also love in music, film, TV, books, podcasts and brands. The strongest signal for event themes.",
      inputSchema: z.object({ kind: z.enum([...qloo.ENTITY_TYPES, "music_genres", "culture_tags"]), take: z.number().int().min(3).max(15).optional() }),
      run: async ({ kind, take }: { kind: qloo.EntityKind | "music_genres" | "culture_tags"; take?: number }) => {
        where();
        if (!ctx.crowdIds?.length) return { crowd: null, results: [] };
        return { crowd: ctx.crowdLabel, results: await qloo.crowdAlsoLikes(ctx.crowdIds.join(","), kind, take ?? 8) };
      },
    },
    nearby_venues: {
      description:
        "Qloo places near the café with their hours on the quiet night: shows what else is open (competition) and what's dark (the gap). Optional tag, e.g. urn:tag:category:place:bar.",
      inputSchema: z.object({ radiusMeters: z.number().int().min(200).max(5000).optional(), tag: z.string().optional() }),
      run: async ({ radiusMeters, tag }: { radiusMeters?: number; tag?: string }) => {
        const venues = await qloo.nearbyVenues(where().lat, where().lon, ctx.cafe.quietNight, { radius: radiusMeters, tag });
        const lateOpen = venues.filter((v) => v.openThatNight && v.closesThatNight && v.closesThatNight >= "20:00").length;
        return { night: ctx.cafe.quietNight, openLateCount: lateOpen, venues };
      },
    },
    find_tags: {
      description: "Resolve a theme word (e.g. 'trivia', 'jazz', 'board games', 'poetry') into Qloo tag ids for audience_profile.",
      inputSchema: z.object({ query: z.string() }),
      run: async ({ query }: { query: string }) => qloo.findTags(query),
    },
    audience_profile: {
      description:
        "Qloo demographics: the age and gender skew (-1..1, 0 = average) of fans of given tags or entities. Compare a theme's audience with the café crowd's.",
      inputSchema: z.object({ tagIds: z.array(z.string()).optional(), entityIds: z.array(z.string()).optional(), includeCafeCrowd: z.boolean().optional() }),
      run: async ({ tagIds, entityIds, includeCafeCrowd }: { tagIds?: string[]; entityIds?: string[]; includeCafeCrowd?: boolean }) => {
        const ids = [...(entityIds ?? []), ...(includeCafeCrowd && ctx.crowdIds ? ctx.crowdIds.slice(0, 1) : [])];
        const out = [] as Awaited<ReturnType<typeof qloo.audienceProfile>>;
        for (const t of tagIds ?? []) out.push(...(await qloo.audienceProfile({ tagIds: [t] })));
        for (const e of ids) out.push(...(await qloo.audienceProfile({ entityIds: [e] })));
        return out;
      },
    },
    review_past_events: {
      description: "The owner's logged results for past events, with repeat / tweak / drop verdicts. Respect these verdicts.",
      inputSchema: z.object({}),
      run: async () => reviewHistory(ctx.cafe, ctx.history),
    },
    check_feasibility: {
      description: "Check one candidate event against budget, staff, seats, hours and licenses. Run it on every idea before proposing it.",
      inputSchema: feasibilitySchema,
      run: async (input: z.infer<typeof feasibilitySchema>) => checkFeasibility(ctx.cafe, input),
    },
    submit_plan: {
      description:
        "Submit the final plan for the owner to approve. Every idea must pass check_feasibility. Nothing is spent or announced until the owner approves.",
      inputSchema: planSchema,
      run: async (plan: Plan) => {
        const problems = plan.ideas
          .map((i) => checkFeasibility(ctx.cafe, i))
          .filter((r) => !r.feasible)
          .map((r) => `${r.title}: ${r.blockers.join(" ")}`);
        if (problems.length) return { accepted: false, problems };
        return { accepted: true };
      },
    },
  };
}

export type Tools = ReturnType<typeof makeTools>;
export type ToolName = keyof Tools;
