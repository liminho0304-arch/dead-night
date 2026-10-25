import type { CafeProfile, EventRecord } from "./types";

/** A fictional demo café. Edit it in the app, or reset to this. */
export const DEMO_CAFE: CafeProfile = {
  name: "Lantern & Ladle",
  address: "Grand St, Williamsburg, Brooklyn, NY",
  quietNight: "tuesday",
  closesAt: "18:00",
  latestEventEnd: "22:30",
  seats: 34,
  budget: 250,
  staffAvailable: 2,
  typicalQuietNightCovers: 9,
  amenities: { liquorLicense: false, soundSystem: true, projector: false, outdoorSpace: false, piano: false },
  menu: [
    { name: "Oat cortado", category: "coffee", price: 4.75 },
    { name: "Cold brew", category: "coffee", price: 5.25 },
    { name: "Hojicha latte", category: "tea", price: 5.5 },
    { name: "Cardamom bun", category: "pastry", price: 4.5 },
    { name: "Miso-butter toast", category: "food", price: 9 },
    { name: "Grain bowl", category: "food", price: 13 },
  ],
  notes: "Small room with a long communal table and a record player behind the counter. Regulars are freelancers and Pratt students.",
};

export const DEMO_HISTORY: EventRecord[] = [
  {
    id: "seed-1",
    date: "2026-09-29",
    status: "done",
    announcement: "Movie night this Tuesday!",
    idea: {
      id: "screening",
      title: "Classic movie night",
      format: "screening",
      pitch: "A borrowed projector and a 90s classic.",
      whyItFits: "Owner's hunch.",
      tasteSignals: [],
      menuTieIns: ["Cold brew"],
      startTime: "19:00",
      endTime: "21:30",
      estimatedCost: 120,
      costBreakdown: [{ item: "Projector rental", amount: 75 }, { item: "License", amount: 45 }],
      staffNeeded: 1,
      expectedAttendance: 20,
      risks: [],
      announcementDraft: "",
    },
    feedback: { attendance: 8, actualCost: 130, revenue: 64, rating: 2, notes: "Hard to see the screen, people left early." },
  },
];
