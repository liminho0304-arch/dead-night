import type { CafeProfile, EventRecord } from "./types";

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  // Treat early-morning times as past midnight.
  return (h < 5 ? h + 24 : h) * 60 + (m || 0);
};

export interface FeasibilityInput {
  title: string;
  estimatedCost: number;
  staffNeeded: number;
  expectedAttendance: number;
  startTime: string;
  endTime: string;
  needs?: { alcohol?: boolean; amplifiedSound?: boolean; projector?: boolean; outdoor?: boolean; piano?: boolean };
}

export interface FeasibilityResult {
  title: string;
  feasible: boolean;
  blockers: string[];
  warnings: string[];
}

/** Hard checks against what the owner told us. The agent must not propose anything that fails these. */
export function checkFeasibility(cafe: CafeProfile, idea: FeasibilityInput): FeasibilityResult {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const a = cafe.amenities;
  const n = idea.needs ?? {};

  if (idea.estimatedCost > cafe.budget) blockers.push(`Costs $${idea.estimatedCost}, over the $${cafe.budget} budget.`);
  else if (idea.estimatedCost > cafe.budget * 0.85) warnings.push(`Uses ${Math.round((idea.estimatedCost / cafe.budget) * 100)}% of the budget, little room for surprises.`);

  if (idea.staffNeeded > cafe.staffAvailable) blockers.push(`Needs ${idea.staffNeeded} staff, only ${cafe.staffAvailable} available.`);

  if (idea.expectedAttendance > cafe.seats * 1.3) blockers.push(`Expects ${idea.expectedAttendance} people for ${cafe.seats} seats.`);
  else if (idea.expectedAttendance > cafe.seats) warnings.push(`Standing room needed for ${idea.expectedAttendance - cafe.seats} people.`);

  if (toMin(idea.endTime) > toMin(cafe.latestEventEnd)) blockers.push(`Ends at ${idea.endTime}, later than the ${cafe.latestEventEnd} limit.`);
  if (toMin(idea.endTime) <= toMin(idea.startTime)) blockers.push("End time is not after start time.");

  if (n.alcohol && !a.liquorLicense) blockers.push("Needs alcohol, but there is no liquor license.");
  if (n.amplifiedSound && !a.soundSystem) warnings.push("Needs amplified sound; there is no sound system, so budget a rental.");
  if (n.projector && !a.projector) warnings.push("Needs a projector; there isn't one, so budget a rental.");
  if (n.outdoor && !a.outdoorSpace) blockers.push("Needs outdoor space, which the café doesn't have.");
  if (n.piano && !a.piano) blockers.push("Needs a piano, which the café doesn't have.");

  const perHead = idea.expectedAttendance > 0 ? idea.estimatedCost / idea.expectedAttendance : Infinity;
  const avgTicket = averageTicket(cafe);
  if (perHead > avgTicket * 1.5) warnings.push(`Costs about $${perHead.toFixed(2)} per guest against a ~$${avgTicket.toFixed(2)} average ticket.`);

  return { title: idea.title, feasible: blockers.length === 0, blockers, warnings };
}

export function averageTicket(cafe: CafeProfile) {
  if (!cafe.menu.length) return 8;
  const prices = cafe.menu.map((m) => m.price).sort((x, y) => x - y);
  // Roughly a drink plus half a food item.
  const median = prices[Math.floor(prices.length / 2)];
  return Math.max(5, median * 1.5);
}

export type Verdict = "repeat" | "tweak" | "drop";

export interface EventReview {
  title: string;
  format: string;
  date: string;
  attendance: number;
  baseline: number;
  lift: number;
  actualCost: number;
  revenue: number;
  profit: number;
  costPerGuest: number;
  rating: number;
  notes: string;
  verdict: Verdict;
  why: string;
}

/** Turn logged outcomes into repeat / tweak / drop calls the planner has to respect. */
export function reviewHistory(cafe: CafeProfile, history: EventRecord[]): { reviews: EventReview[]; pending: string[] } {
  const night = cafe.quietNight.charAt(0).toUpperCase() + cafe.quietNight.slice(1);
  const reviews: EventReview[] = [];
  const pending: string[] = [];
  for (const e of history) {
    if (!e.feedback) {
      pending.push(`${e.idea.title} (${e.date}, ${e.status})`);
      continue;
    }
    const f = e.feedback;
    const baseline = cafe.typicalQuietNightCovers;
    const lift = f.attendance - baseline;
    const profit = f.revenue - f.actualCost;
    const costPerGuest = f.attendance ? f.actualCost / f.attendance : f.actualCost;
    let verdict: Verdict;
    let why: string;
    if (profit >= 0 && lift > 0 && f.rating >= 4) {
      verdict = "repeat";
      why = `Brought ${lift} more guests than a normal ${night}, made $${profit.toFixed(0)}, rated ${f.rating}/5.`;
    } else if (lift <= 0 || (profit < 0 && f.rating <= 2)) {
      verdict = "drop";
      why = lift <= 0 ? `No lift over a normal ${night} (${f.attendance} vs ${baseline}).` : `Lost $${(-profit).toFixed(0)} and rated ${f.rating}/5.`;
    } else {
      verdict = "tweak";
      why = profit < 0 ? `Drew a crowd (+${lift}) but lost $${(-profit).toFixed(0)}; cut costs or add a ticket.` : `Worked (+${lift} guests) but rated ${f.rating}/5; fix what guests flagged.`;
    }
    reviews.push({
      title: e.idea.title,
      format: e.idea.format,
      date: e.date,
      attendance: f.attendance,
      baseline,
      lift,
      actualCost: f.actualCost,
      revenue: f.revenue,
      profit,
      costPerGuest: Math.round(costPerGuest * 100) / 100,
      rating: f.rating,
      notes: f.notes,
      verdict,
      why,
    });
  }
  return { reviews, pending };
}
