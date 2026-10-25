import { makeTools, type ToolContext } from "./tools";
import { averageTicket, type EventReview, type FeasibilityResult } from "./ops";
import type { PlanEvent } from "./events";
import type { CafeProfile, MenuItem, Plan, PlanIdea, TasteSignal } from "./types";

/**
 * Deterministic planner used when no ANTHROPIC_API_KEY is configured. It calls the same Qloo
 * tools in a fixed order and matches the results against a small catalogue of café formats,
 * so the app stays fully usable (and honest about where each idea comes from) without an LLM.
 */

type Named = { name: string; id?: string; affinity?: number };

interface Signals {
  crowd: string;
  crowdMusic: Named[];
  crowdArtists: Named[];
  crowdTv: Named[];
  crowdPodcasts: Named[];
  crowdMovies: Named[];
  crowdCulture: Named[];
  localMusic: Named[];
  localPlaces: Named[];
  lateCompetitors: string[];
  reviews: EventReview[];
}

interface Candidate {
  format: string;
  title: string;
  pitch: string;
  why: string;
  signals: TasteSignal[];
  match: number;
  costs: { item: string; amount: number }[];
  staff: number;
  attendanceFactor: number;
  needs: PlanIdea["needs"];
  menuCats: MenuItem["category"][];
  special?: string;
  endOverride?: string;
  risks: string[];
}

/** First item matching the earliest keyword, so keyword order sets priority. */
const has = (list: Named[], words: string[]) => {
  for (const w of words) {
    const hit = list.find((x) => x.name.toLowerCase().includes(w));
    if (hit) return hit;
  }
};
const top = (list: Named[], n = 3) => list.slice(0, n).map((x) => x.name);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function catalogue(s: Signals, cafe: CafeProfile): Candidate[] {
  const out: Candidate[] = [];
  const genre = s.crowdMusic[0]?.name ?? s.localMusic[0]?.name;
  const genre2 = s.crowdMusic[1]?.name ?? s.localMusic[1]?.name;
  const soundRental = cafe.amenities.soundSystem ? [] : [{ item: "Speaker rental", amount: 60 }];

  if (genre) {
    out.push({
      format: "listening night",
      title: `${cap(genre)} & ${genre2 ?? "deep cuts"} listening night`,
      pitch: `A local selector plays ${genre}${genre2 ? ` and ${genre2}` : ""} records front to back. Phones down, coffee up.`,
      why: `${cap(genre)} is the top music genre for ${s.crowd}, and ${top(s.crowdArtists, 2).join(" and ") || "similar artists"} rank high with the same crowd.`,
      signals: [
        { label: `Café crowd over-indexes on ${genre}${genre2 ? ` and ${genre2}` : ""}`, source: "crowd_also_likes", detail: top(s.crowdMusic, 5).join(", ") },
        ...(s.crowdArtists.length ? [{ label: `Artists this crowd loves: ${top(s.crowdArtists, 3).join(", ")}`, source: "crowd_also_likes" }] : []),
      ],
      match: (s.crowdMusic[0]?.affinity ?? 0.8) + 0.1,
      costs: [{ item: "Local DJ / selector", amount: 100 }, { item: "Flyers and chalkboard", amount: 15 }, ...soundRental],
      staff: 2,
      attendanceFactor: 2.2,
      needs: { amplifiedSound: true },
      menuCats: ["coffee", "pastry"],
      special: `"B-side" espresso tonic`,
      risks: ["Needs a DJ who'll play to a seated room, not a club."],
    });
  }

  const show = s.crowdTv[0] ?? s.crowdPodcasts[0];
  if (show) {
    const second = s.crowdTv[1] ?? s.crowdPodcasts[1];
    out.push({
      format: "trivia",
      title: `${show.name}${second ? ` vs. ${second.name}` : ""} trivia`,
      pitch: `Teams of four, three rounds on ${show.name}${second ? ` and ${second.name}` : ""}, winners drink free for a week.`,
      why: `${show.name} is one of the strongest TV/podcast affinities for ${s.crowd}, so the questions land with exactly the people already nearby.`,
      signals: [
        { label: `${show.name} ranks high with the café crowd`, source: "crowd_also_likes", detail: [...top(s.crowdTv, 3), ...top(s.crowdPodcasts, 2)].join(", ") },
        ...(s.crowdPodcasts.length ? [{ label: `Podcasts this crowd loves: ${top(s.crowdPodcasts, 2).join(", ")}`, source: "crowd_also_likes" }] : []),
      ],
      match: (show.affinity ?? 0.8) + 0.08,
      costs: [{ item: "Quizmaster", amount: 75 }, { item: "Prizes (drink cards, at cost)", amount: 25 }, { item: "Printing", amount: 10 }],
      staff: 2,
      attendanceFactor: 2.6,
      needs: {},
      menuCats: ["coffee", "food"],
      special: "Team snack board",
      risks: ["Trivia works best with a regular cadence; one-offs build slowly."],
    });
  }

  const words = has([...s.crowdCulture, ...s.localMusic], ["poetry", "writing", "book", "essay", "comedy", "podcast", "activism"]);
  if (words) {
    out.push({
      format: "open mic",
      title: `Open page: ${words.name.toLowerCase()} & spoken word night`,
      pitch: "Five-minute slots for readers, poets and storytellers. Sign-up sheet by the register.",
      why: `${cap(words.name)} shows up in what ${s.crowd} and the neighbourhood over-index on: a crowd that writes and performs as well as listens.`,
      signals: [{ label: `Taste signal: ${words.name}`, source: s.crowdCulture.includes(words) ? "crowd_also_likes" : "local_taste_tags", detail: top(s.crowdCulture, 6).join(", ") }, ...(s.localPlaces.length ? [{ label: `Neighbourhood goes to: ${top(s.localPlaces, 3).join(", ")}`, source: "local_taste_tags" }] : [])],
      match: (words.affinity ?? 0.75) + 0.02,
      costs: [{ item: "Host stipend", amount: 40 }, ...soundRental],
      staff: 1,
      attendanceFactor: 2.0,
      needs: { amplifiedSound: true },
      menuCats: ["tea", "pastry"],
      risks: ["Quality varies; a host with a few booked readers anchors the night."],
    });
  }

  const art = has(s.crowdCulture, ["photo", "art", "design", "craft", "fashion", "illustration"]);
  if (art) {
    out.push({
      format: "maker night",
      title: `${cap(art.name)} night: bring a project`,
      pitch: `A local ${art.name.toLowerCase()} artist leads a 45-minute mini-session, then open table time.`,
      why: `${cap(art.name)} is a strong cross-domain interest for ${s.crowd}.`,
      signals: [{ label: `Taste signal: ${art.name}`, source: "local_taste_tags", detail: top(s.crowdCulture, 6).join(", ") }, ...(s.crowdArtists.length ? [{ label: `Crowd's artists: ${top(s.crowdArtists, 3).join(", ")}`, source: "crowd_also_likes" }] : [])],
      match: (art.affinity ?? 0.7),
      costs: [{ item: "Guest artist", amount: 100 }, { item: "Materials", amount: 60 }],
      staff: 1,
      attendanceFactor: 1.6,
      needs: {},
      menuCats: ["coffee", "pastry"],
      risks: ["Needs pre-registration to size materials."],
    });
  }

  const film = s.crowdMovies[0];
  if (film) {
    out.push({
      format: "screening",
      title: `Indie film night: ${film.name}`,
      pitch: `A screening of ${film.name} with a short intro and a post-film chat.`,
      why: `${film.name} is a top film affinity for ${s.crowd}.`,
      signals: [{ label: `Crowd loves films like ${top(s.crowdMovies, 3).join(", ")}`, source: "crowd_also_likes" }],
      match: (film.affinity ?? 0.7) - 0.05,
      costs: [{ item: "Public screening license", amount: 90 }, ...(cafe.amenities.projector ? [] : [{ item: "Projector rental", amount: 75 }])],
      staff: 1,
      attendanceFactor: 1.8,
      needs: { projector: true },
      menuCats: ["coffee", "food"],
      risks: ["Feature-length films run long; check the end time."],
    });
  }

  if (genre) {
    out.push({
      format: "live music",
      title: `Live ${genre} set with a local act`,
      pitch: `Two short sets from a local ${genre} act.`,
      why: `Matches the crowd's top genre (${genre}).`,
      signals: [{ label: `Café crowd over-indexes on ${genre}`, source: "crowd_also_likes" }],
      match: (s.crowdMusic[0]?.affinity ?? 0.8) - 0.02,
      costs: [{ item: "Band guarantee", amount: 250 }, { item: "Sound tech", amount: 80 }, ...soundRental],
      staff: 2,
      attendanceFactor: 2.4,
      needs: { amplifiedSound: true },
      menuCats: ["coffee"],
      risks: ["Guarantee is due even if nobody comes."],
    });
  }

  out.push({
    format: "tasting",
    title: "Natural wine & small plates night",
    pitch: "Three pours paired with small plates from the kitchen.",
    why: `${has(s.localPlaces, ["wine", "cocktail", "bar"])?.name ?? "Bars"} rank high among places the neighbourhood goes.`,
    signals: [{ label: `Neighbourhood goes to: ${top(s.localPlaces, 3).join(", ")}`, source: "local_taste_tags" }],
    match: 0.7,
    costs: [{ item: "Wine", amount: 120 }, { item: "Small plates", amount: 60 }],
    staff: 2,
    attendanceFactor: 2.0,
    needs: { alcohol: true },
    menuCats: ["beer_wine", "food"],
    risks: [],
  });

  out.push({
    format: "dance party",
    title: `Late ${genre ?? "dance"} party`,
    pitch: "Push the tables back and dance till late.",
    why: `${s.lateCompetitors.length} nearby venues are open late, so the crowd is out.`,
    signals: [{ label: `${s.lateCompetitors.length} venues nearby open late on ${cafe.quietNight}`, source: "nearby_venues", detail: s.lateCompetitors.slice(0, 4).join(", ") }],
    match: 0.6,
    costs: [{ item: "DJ", amount: 150 }],
    staff: 2,
    attendanceFactor: 3,
    needs: { amplifiedSound: true },
    menuCats: ["coffee"],
    endOverride: "01:00",
    risks: [],
  });

  return out;
}

function pickMenu(cafe: CafeProfile, cats: MenuItem["category"][], special?: string) {
  const items = cats.flatMap((c) => cafe.menu.filter((m) => m.category === c).slice(0, 1)).map((m) => `${m.name} ($${m.price.toFixed(2)})`);
  if (special && cafe.menu.length) items.push(`Special: ${special}`);
  return items.length ? items : cafe.menu.slice(0, 2).map((m) => m.name);
}

const addMin = (hhmm: string, mins: number) => {
  const [h, m] = hhmm.split(":").map(Number);
  const t = h * 60 + m + mins;
  return `${String(Math.floor(t / 60) % 24).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
};
const minOf = (a: string, b: string) => (a < b ? a : b);

export async function runOfflinePlanner(ctx: ToolContext, emit: (e: PlanEvent) => void): Promise<void> {
  const tools = makeTools(ctx);
  let n = 0;
  async function call<T>(name: keyof typeof tools, input: Record<string, unknown> = {}): Promise<T | null> {
    const id = `offline-${++n}`;
    emit({ type: "tool-call", id, name, input });
    try {
      const output = await (tools[name].run as (i: unknown) => Promise<unknown>)(input);
      emit({ type: "tool-result", id, name, output });
      return output as T;
    } catch (err) {
      emit({ type: "tool-result", id, name, output: { error: (err as Error).message } });
      return null;
    }
  }

  const cafe = ctx.cafe;
  await call("get_cafe_profile");
  const history = (await call<{ reviews: EventReview[] }>("review_past_events")) ?? { reviews: [] };
  const where = await call("locate_cafe");
  if (!where) {
    emit({ type: "error", message: "Couldn't find the café's location in Qloo. Check the address." });
    return;
  }
  type Crowd = { crowd: string | null; results: Named[] };
  const crowdMusic = await call<Crowd>("crowd_also_likes", { kind: "music_genres" });
  const crowdArtists = await call<Crowd>("crowd_also_likes", { kind: "artist", take: 6 });
  const crowdTv = await call<Crowd>("crowd_also_likes", { kind: "tv_show", take: 5 });
  const crowdPodcasts = await call<Crowd>("crowd_also_likes", { kind: "podcast", take: 5 });
  const crowdMovies = await call<Crowd>("crowd_also_likes", { kind: "movie", take: 5 });
  const crowdCulture = await call<Crowd>("crowd_also_likes", { kind: "culture_tags", take: 12 });
  const localMusic = (await call<Named[]>("local_taste_tags", { kind: "music", take: 8 })) ?? [];
  const localPlaces = (await call<Named[]>("local_taste_tags", { kind: "place", take: 8 })) ?? [];
  // Cross-domain interest tags aren't available for every crowd; the neighbourhood's are the next best signal.
  const localCulture = crowdCulture?.results.length ? [] : ((await call<Named[]>("local_taste_tags", { kind: "culture", take: 12 })) ?? []);
  const venues = await call<{ venues: { name: string; openThatNight: boolean; closesThatNight: string | null }[] }>("nearby_venues", { radiusMeters: 1000 });

  const s: Signals = {
    crowd: crowdMusic?.crowd ?? "people nearby",
    crowdMusic: crowdMusic?.results ?? [],
    crowdArtists: crowdArtists?.results ?? [],
    crowdTv: dedupe(crowdTv?.results ?? []),
    crowdPodcasts: crowdPodcasts?.results ?? [],
    crowdMovies: crowdMovies?.results ?? [],
    crowdCulture: crowdCulture?.results.length ? crowdCulture.results : localCulture,
    localMusic,
    localPlaces,
    lateCompetitors: (venues?.venues ?? []).filter((v) => v.openThatNight && (v.closesThatNight ?? "") >= "21:00").map((v) => v.name),
    reviews: history.reviews,
  };

  const candidates = catalogue(s, cafe);
  const start = minOf(cafe.closesAt >= "19:00" ? "19:00" : addMin(cafe.closesAt, 30), "19:30");
  const verdicts = new Map(s.reviews.map((r) => [r.format.toLowerCase(), r]));
  const ideas: { idea: PlanIdea; score: number }[] = [];
  const ruledOut: Plan["ruledOut"] = [];
  const learnings: string[] = [];

  for (const c of candidates) {
    const past = verdicts.get(c.format);
    if (past?.verdict === "drop") {
      ruledOut.push({ idea: c.title, reason: `Past ${c.format} on ${past.date} was a drop: ${past.why}` });
      learnings.push(`Dropped ${c.format}: ${past.why}`);
      continue;
    }
    const cost = c.costs.reduce((a, b) => a + b.amount, 0);
    const end = c.endOverride ?? minOf(addMin(start, 150), cafe.latestEventEnd);
    const attendance = Math.min(Math.round(cafe.typicalQuietNightCovers * c.attendanceFactor), Math.round(cafe.seats * 1.1));
    const idea: PlanIdea = {
      id: c.format.replace(/\s+/g, "-"),
      title: c.title,
      format: c.format,
      pitch: c.pitch,
      whyItFits: c.why,
      tasteSignals: c.signals,
      menuTieIns: pickMenu(cafe, c.menuCats, c.special),
      startTime: start,
      endTime: end,
      estimatedCost: cost,
      costBreakdown: c.costs,
      staffNeeded: c.staff,
      expectedAttendance: attendance,
      risks: c.risks,
      announcementDraft: `This ${cap(cafe.quietNight)} at ${cafe.name}: ${c.title}. ${c.pitch} ${start}–${end}. Free entry, come early for a seat.`,
      needs: c.needs,
    };
    const check = await call<FeasibilityResult>("check_feasibility", {
      title: idea.title,
      estimatedCost: idea.estimatedCost,
      staffNeeded: idea.staffNeeded,
      expectedAttendance: idea.expectedAttendance,
      startTime: idea.startTime,
      endTime: idea.endTime,
      needs: idea.needs,
    });
    if (!check?.feasible) {
      ruledOut.push({ idea: c.title, reason: check?.blockers.join(" ") ?? "Failed the feasibility check." });
      continue;
    }
    idea.risks = [...idea.risks, ...check.warnings];
    let score = c.match;
    if (past?.verdict === "repeat") {
      score += 0.2;
      idea.whyItFits += ` Last time it worked: ${past.why}`;
      learnings.push(`Repeating ${c.format}: ${past.why}`);
    } else if (past?.verdict === "tweak") {
      idea.risks.push(`Last time: ${past.why}`);
      learnings.push(`Tweaking ${c.format}: ${past.why}`);
    }
    // Prefer cheap nights that still draw people.
    score -= (cost / Math.max(cafe.budget, 1)) * 0.15;
    ideas.push({ idea, score });
  }

  ideas.sort((a, b) => b.score - a.score);
  const chosen = ideas.slice(0, 3).map((x) => x.idea);
  for (const extra of ideas.slice(3)) ruledOut.push({ idea: extra.idea.title, reason: "Feasible, but a weaker taste match than the top three this week." });

  const ticket = averageTicket(cafe);
  const plan: Plan = {
    headline: chosen[0]
      ? `${cap(cafe.quietNight)} is quiet, but ${s.crowd} have clear tastes. ${chosen[0].title} is the best bet at about ${chosen[0].expectedAttendance} guests vs. ${cafe.typicalQuietNightCovers} on a normal night.`
      : "No idea passed the feasibility checks. Loosen the budget, staff or hours and try again.",
    audienceSummary: `${cap(s.crowd)} over-index on ${top(s.crowdMusic, 3).join(", ") || "varied music"}, watches ${top(s.crowdTv, 2).join(" and ") || "a range of shows"}, and shares interests in ${top(s.crowdCulture, 4).join(", ") || "local culture"}. Around the café people go to ${top(s.localPlaces, 3).join(", ")}; ${s.lateCompetitors.length} nearby venues stay open past 9pm on ${cap(cafe.quietNight)}s. Average ticket here is about $${ticket.toFixed(2)}.`,
    ideas: chosen,
    ruledOut,
    learningsApplied: learnings,
  };
  const submitted = await call<{ accepted: boolean }>("submit_plan", plan as unknown as Record<string, unknown>);
  if (submitted?.accepted) emit({ type: "plan", plan });
}

function dedupe(list: Named[]) {
  const seen = new Set<string>();
  return list.filter((x) => (seen.has(x.name) ? false : (seen.add(x.name), true)));
}
