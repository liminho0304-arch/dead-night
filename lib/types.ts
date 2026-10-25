export type Weekday =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

export interface MenuItem {
  name: string;
  category: "coffee" | "tea" | "food" | "pastry" | "beer_wine" | "other";
  price: number;
}

export interface CafeProfile {
  name: string;
  address: string;
  quietNight: Weekday;
  /** Usual closing time on the quiet night, 24h "HH:MM". */
  closesAt: string;
  /** Latest the owner is willing to stay open for an event, 24h "HH:MM". */
  latestEventEnd: string;
  seats: number;
  /** Max the owner will spend per event, in dollars. */
  budget: number;
  /** Staff who can work the quiet night, including the owner. */
  staffAvailable: number;
  /** Typical covers on the quiet night today, used as the baseline. */
  typicalQuietNightCovers: number;
  amenities: {
    liquorLicense: boolean;
    soundSystem: boolean;
    projector: boolean;
    outdoorSpace: boolean;
    piano: boolean;
  };
  menu: MenuItem[];
  notes: string;
}

export interface TasteSignal {
  /** Short human label, e.g. "Your regulars over-index on indie rock". */
  label: string;
  /** Which Qloo lookup produced it. */
  source: string;
  detail?: string;
}

export interface PlanIdea {
  id: string;
  title: string;
  format: string;
  pitch: string;
  whyItFits: string;
  tasteSignals: TasteSignal[];
  menuTieIns: string[];
  startTime: string;
  endTime: string;
  estimatedCost: number;
  costBreakdown: { item: string; amount: number }[];
  staffNeeded: number;
  expectedAttendance: number;
  risks: string[];
  announcementDraft: string;
  needs?: { alcohol?: boolean; amplifiedSound?: boolean; projector?: boolean; outdoor?: boolean; piano?: boolean };
}

export interface RuledOutIdea {
  idea: string;
  reason: string;
}

export interface Plan {
  headline: string;
  audienceSummary: string;
  ideas: PlanIdea[];
  ruledOut: RuledOutIdea[];
  learningsApplied: string[];
}

export type EventStatus = "approved" | "announced" | "done";

export interface EventFeedback {
  attendance: number;
  actualCost: number;
  revenue: number;
  rating: 1 | 2 | 3 | 4 | 5;
  notes: string;
}

export interface EventRecord {
  id: string;
  date: string;
  status: EventStatus;
  idea: PlanIdea;
  announcement: string;
  feedback?: EventFeedback;
}

export interface PlanRequest {
  cafe: CafeProfile;
  history: EventRecord[];
  request?: string;
  mode?: "auto" | "offline";
}
