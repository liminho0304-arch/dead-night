"use client";
import type { CafeProfile, MenuItem, Weekday } from "@/lib/types";

const DAYS: Weekday[] = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const CATS: MenuItem["category"][] = ["coffee", "tea", "food", "pastry", "beer_wine", "other"];
const AMENITIES: { key: keyof CafeProfile["amenities"]; label: string }[] = [
  { key: "liquorLicense", label: "Liquor license" },
  { key: "soundSystem", label: "Sound system" },
  { key: "projector", label: "Projector" },
  { key: "outdoorSpace", label: "Outdoor space" },
  { key: "piano", label: "Piano" },
];

export function ProfileForm({ cafe, onChange, onReset }: { cafe: CafeProfile; onChange: (c: CafeProfile) => void; onReset: () => void }) {
  const set = <K extends keyof CafeProfile>(k: K, v: CafeProfile[K]) => onChange({ ...cafe, [k]: v });
  const num = (k: keyof CafeProfile) => (e: React.ChangeEvent<HTMLInputElement>) => set(k, Number(e.target.value) as never);
  const setMenu = (i: number, patch: Partial<MenuItem>) => set("menu", cafe.menu.map((m, j) => (j === i ? { ...m, ...patch } : m)));

  return (
    <div className="space-y-6">
      <section className="card grid gap-4 p-5 sm:grid-cols-2">
        <L label="Café name">
          <input className="input" value={cafe.name} onChange={(e) => set("name", e.target.value)} />
        </L>
        <L label="Address or neighbourhood" hint="Used to find your crowd in Qloo.">
          <input className="input" value={cafe.address} onChange={(e) => set("address", e.target.value)} />
        </L>
        <L label="Quietest night">
          <select className="input capitalize" value={cafe.quietNight} onChange={(e) => set("quietNight", e.target.value as Weekday)}>
            {DAYS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </L>
        <L label="Guests on a normal quiet night">
          <input type="number" min={0} className="input" value={cafe.typicalQuietNightCovers} onChange={num("typicalQuietNightCovers")} />
        </L>
        <L label="Usually closes at">
          <input type="time" className="input" value={cafe.closesAt} onChange={(e) => set("closesAt", e.target.value)} />
        </L>
        <L label="Latest an event can end">
          <input type="time" className="input" value={cafe.latestEventEnd} onChange={(e) => set("latestEventEnd", e.target.value)} />
        </L>
        <L label="Seats">
          <input type="number" min={1} className="input" value={cafe.seats} onChange={num("seats")} />
        </L>
        <L label="Budget per event ($)">
          <input type="number" min={0} className="input" value={cafe.budget} onChange={num("budget")} />
        </L>
        <L label="Staff available that night (incl. you)">
          <input type="number" min={1} className="input" value={cafe.staffAvailable} onChange={num("staffAvailable")} />
        </L>
        <div>
          <span className="label">Have</span>
          <div className="mt-2 flex flex-wrap gap-2">
            {AMENITIES.map((a) => (
              <label key={a.key} className={`cursor-pointer rounded-full border px-3 py-1 text-xs ${cafe.amenities[a.key] ? "border-lamp-400 bg-lamp-400/10 text-lamp-300" : "border-night-600 text-night-400"}`}>
                <input type="checkbox" className="sr-only" checked={cafe.amenities[a.key]} onChange={(e) => set("amenities", { ...cafe.amenities, [a.key]: e.target.checked })} />
                {a.label}
              </label>
            ))}
          </div>
        </div>
        <L label="Notes for the planner" className="sm:col-span-2">
          <textarea className="input h-20" value={cafe.notes} onChange={(e) => set("notes", e.target.value)} />
        </L>
      </section>

      <section className="card p-5">
        <div className="mb-3 flex items-center justify-between">
          <span className="label">Menu</span>
          <button className="btn-ghost py-1 text-xs" onClick={() => set("menu", [...cafe.menu, { name: "", category: "coffee", price: 0 }])}>
            Add item
          </button>
        </div>
        <div className="space-y-2">
          {cafe.menu.map((m, i) => (
            <div key={i} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-2">
              <input className="input" placeholder="Item" value={m.name} onChange={(e) => setMenu(i, { name: e.target.value })} />
              <select className="input w-28" value={m.category} onChange={(e) => setMenu(i, { category: e.target.value as MenuItem["category"] })}>
                {CATS.map((c) => (
                  <option key={c} value={c}>
                    {c.replace("_", " / ")}
                  </option>
                ))}
              </select>
              <input type="number" step="0.25" min={0} className="input w-24" value={m.price} onChange={(e) => setMenu(i, { price: Number(e.target.value) })} />
              <button className="px-2 text-night-400 hover:text-ember-400" onClick={() => set("menu", cafe.menu.filter((_, j) => j !== i))} aria-label="Remove item">
                ✕
              </button>
            </div>
          ))}
        </div>
      </section>

      <button className="text-sm text-night-400 underline hover:text-night-200" onClick={onReset}>
        Reset to the demo café
      </button>
    </div>
  );
}

function L({ label, hint, className, children }: { label: string; hint?: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={`block ${className ?? ""}`}>
      <span className="label">{label}</span>
      <div className="mt-1">{children}</div>
      {hint && <span className="mt-1 block text-xs text-night-400">{hint}</span>}
    </label>
  );
}
