import type { Weekday } from "./types";

const BASE = process.env.QLOO_API_URL ?? "https://hackathon.api.qloo.com";

const cache = new Map<string, { at: number; data: unknown }>();
const TTL_MS = 10 * 60 * 1000;

async function qloo<T>(path: string, params: Record<string, string | number | undefined>): Promise<T> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") qs.set(k, String(v));
  const url = `${BASE}${path}?${qs}`;
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data as T;

  const headers: Record<string, string> = { accept: "application/json" };
  if (process.env.QLOO_API_KEY) headers["X-Api-Key"] = process.env.QLOO_API_KEY;
  const res = await fetch(url, { headers, cache: "no-store" });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Qloo ${path} ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = (await res.json()) as T;
  cache.set(url, { at: Date.now(), data });
  return data;
}

const point = (lat: number, lon: number) => `POINT(${lon} ${lat})`;
const round = (n: number | undefined, d = 3) => (n === undefined ? undefined : Math.round(n * 10 ** d) / 10 ** d);

export const ENTITY_TYPES = ["artist", "movie", "tv_show", "book", "podcast", "brand", "videogame"] as const;
export type EntityKind = (typeof ENTITY_TYPES)[number];

export const TAG_KINDS = {
  music: "urn:tag:genre:music",
  place: "urn:tag:genre:place",
  media: "urn:tag:genre:media",
  culture: "urn:tag:genre:qloo",
} as const;
export type TagKind = keyof typeof TAG_KINDS;

interface RawEntity {
  name: string;
  entity_id: string;
  location?: { lat: number; lon: number };
  query?: { affinity?: number; distance?: number };
  properties?: Record<string, unknown>;
  tags?: { name: string; type: string }[];
}

const norm = (s: string) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 2 && w !== "the" && w !== "cafe" && w !== "coffee");

/**
 * Find the café in Qloo's graph. If Qloo doesn't know it (most small cafés), fall back to its
 * neighbourhood so location-based insights still work.
 */
export async function locate(name: string, address: string) {
  const wanted = norm(name);
  const places = await qloo<{ results: RawEntity[] }>("/search", { query: `${name} ${address}`, types: "urn:entity:place", take: 5 });
  const place = places.results?.find((r) => {
    if (!r.location || !wanted.length) return false;
    const got = new Set(norm(r.name));
    return wanted.filter((w) => got.has(w)).length / wanted.length >= 0.6;
  });
  if (place) {
    return {
      matched: "cafe" as const,
      name: place.name,
      entityId: place.entity_id as string | null,
      address: (place.properties?.address as string) ?? null,
      lat: place.location!.lat,
      lon: place.location!.lon,
    };
  }
  // Try the address from most to least specific: "Bedford Ave, Williamsburg, Brooklyn, NY" → "Williamsburg, Brooklyn, NY" → ...
  const parts = address.split(",").map((s) => s.trim()).filter(Boolean);
  for (let i = 0; i < parts.length; i++) {
    const q = parts.slice(i).join(", ");
    const locs = await qloo<{ results: RawEntity[] }>("/search", { query: q, types: "urn:entity:locality", take: 1 });
    const loc = locs.results?.[0];
    if (loc?.location) {
      return { matched: "neighborhood" as const, name: loc.name, entityId: null as string | null, address: q, lat: loc.location.lat, lon: loc.location.lon };
    }
  }
  throw new Error(`Qloo could not place "${address}"`);
}

/** What the people around a point over-index on, as genre/category tags. */
export async function localTasteTags(lat: number, lon: number, kind: TagKind, take = 10) {
  const d = await qloo<{ results: { tags: { name: string; id: string; query?: { affinity?: number } }[] } }>(
    "/v2/insights",
    { "filter.type": "urn:tag", "filter.tag.types": TAG_KINDS[kind], "signal.location": point(lat, lon), take },
  );
  return d.results.tags.map((t) => ({ name: t.name.trim(), id: t.id, affinity: round(t.query?.affinity) }));
}

/** Top artists/films/etc. for people around a point. */
export async function localFavorites(lat: number, lon: number, kind: EntityKind, take = 8) {
  const d = await qloo<{ results: { entities: RawEntity[] } }>("/v2/insights", {
    "filter.type": `urn:entity:${kind}`,
    "signal.location": point(lat, lon),
    take,
  });
  return d.results.entities.map((e) => ({ name: e.name, id: e.entity_id, affinity: round(e.query?.affinity) }));
}

/** Cross-domain: what people who go to this café also love. */
export async function crowdAlsoLikes(entityId: string, kind: EntityKind | "music_genres" | "culture_tags", take = 8) {
  if (kind === "music_genres" || kind === "culture_tags") {
    const d = await qloo<{ results: { tags: { name: string; id: string; query?: { affinity?: number } }[] } }>(
      "/v2/insights",
      {
        "filter.type": "urn:tag",
        "filter.tag.types": kind === "music_genres" ? TAG_KINDS.music : TAG_KINDS.culture,
        "signal.interests.entities": entityId,
        take,
      },
    );
    return d.results.tags.map((t) => ({ name: t.name.trim(), id: t.id, affinity: round(t.query?.affinity) }));
  }
  const d = await qloo<{ results: { entities: RawEntity[] } }>("/v2/insights", {
    "filter.type": `urn:entity:${kind}`,
    "signal.interests.entities": entityId,
    take,
  });
  return d.results.entities.map((e) => ({ name: e.name, id: e.entity_id, affinity: round(e.query?.affinity) }));
}

type Hours = Partial<Record<Weekday, { opens: string; closes: string; closed: boolean }[]>>;

/** Nearby venues and whether they are open late on a given night: the competition, or the gap. */
export async function nearbyVenues(lat: number, lon: number, night: Weekday, opts: { radius?: number; tag?: string; take?: number } = {}) {
  const d = await qloo<{ results: { entities: RawEntity[] } }>("/v2/insights", {
    "filter.type": "urn:entity:place",
    "filter.location": point(lat, lon),
    "filter.location.radius": opts.radius ?? 1200,
    "filter.tags": opts.tag,
    take: opts.take ?? 15,
  });
  return d.results.entities.map((e) => {
    const p = e.properties ?? {};
    const hours = (p.hours as Hours | undefined)?.[night];
    const slot = hours?.[0];
    const closes = slot && !slot.closed ? slot.closes.replace(/^T/, "").slice(0, 5) : null;
    return {
      name: e.name,
      id: e.entity_id,
      genre: (p.primary_genre as { name?: string } | undefined)?.name ?? null,
      categories: (e.tags ?? []).filter((t) => t.type.includes("category")).map((t) => t.name).slice(0, 3),
      openThatNight: !!slot && !slot.closed,
      closesThatNight: closes,
      liveMusic: (p.live_music as boolean | null) ?? null,
      keywords: ((p.keywords as { name: string }[] | undefined) ?? []).slice(0, 5).map((k) => k.name),
      distanceM: e.query?.distance ? Math.round(e.query.distance) : null,
    };
  });
}

/** Age/gender skew of the audience for a set of tags or entities (-1..1, 0 = average). */
export async function audienceProfile(input: { tagIds?: string[]; entityIds?: string[] }) {
  const d = await qloo<{ results: { demographics: { entity_id: string; query: { age: Record<string, number>; gender: Record<string, number> } }[] } }>(
    "/v2/insights",
    {
      "filter.type": "urn:demographics",
      "signal.interests.tags": input.tagIds?.join(","),
      "signal.interests.entities": input.entityIds?.join(","),
    },
  );
  return d.results.demographics.map((x) => ({ id: x.entity_id, age: x.query.age, gender: x.query.gender }));
}

/** Resolve a free-text theme ("trivia", "jazz", "board games") into Qloo tag ids. */
export async function findTags(query: string, take = 6) {
  const d = await qloo<{ results: { tags: { id: string; name: string; parents?: { type: string }[] }[] } }>("/v2/tags", {
    "filter.query": query,
    take,
  });
  return d.results.tags.map((t) => ({ id: t.id, name: t.name, appliesTo: (t.parents ?? []).map((p) => p.type.replace("urn:entity:", "")) }));
}
