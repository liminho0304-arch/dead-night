"use client";
import { useState } from "react";
import { reviewHistory } from "@/lib/ops";
import type { CafeProfile, EventFeedback, EventRecord } from "@/lib/types";

const VERDICT_STYLE = {
  repeat: "bg-sage-400/15 text-sage-400",
  tweak: "bg-lamp-400/15 text-lamp-300",
  drop: "bg-ember-400/15 text-ember-400",
} as const;

export function EventsView({
  cafe,
  history,
  onUpdate,
  onDelete,
}: {
  cafe: CafeProfile;
  history: EventRecord[];
  onUpdate: (e: EventRecord) => void;
  onDelete: (id: string) => void;
}) {
  const { reviews } = reviewHistory(cafe, history);
  const byTitleDate = new Map(reviews.map((r) => [`${r.title}|${r.date}`, r]));
  const sorted = [...history].sort((a, b) => b.date.localeCompare(a.date));

  if (!history.length) {
    return <div className="card p-8 text-center text-night-400">No events yet. Approve an idea from a plan and it shows up here.</div>;
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-night-400">
        Log what actually happened after each event. Dead Night compares it with a normal <span className="capitalize">{cafe.quietNight}</span> ({cafe.typicalQuietNightCovers} guests) and uses the verdict next time it plans.
      </p>
      {sorted.map((e) => {
        const r = byTitleDate.get(`${e.idea.title}|${e.date}`);
        return (
          <div key={e.id} className="card p-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="label">
                  {e.date} · {e.idea.format}
                </p>
                <h3 className="font-display mt-1 text-lg text-white">{e.idea.title}</h3>
              </div>
              <div className="flex items-center gap-2">
                {r ? (
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${VERDICT_STYLE[r.verdict]}`}>{r.verdict}</span>
                ) : (
                  <span className="rounded-full bg-night-700 px-3 py-1 text-xs text-night-200">{e.status === "announced" ? "Approved and announced" : "Approved, not announced"}</span>
                )}
                <button className="text-xs text-night-400 hover:text-ember-400" onClick={() => onDelete(e.id)} aria-label="Delete event">
                  Remove
                </button>
              </div>
            </div>
            {r && (
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-5">
                <Cell label="Guests" value={`${r.attendance} (${r.lift >= 0 ? "+" : ""}${r.lift})`} />
                <Cell label="Cost" value={`$${r.actualCost}`} />
                <Cell label="Revenue" value={`$${r.revenue}`} />
                <Cell label="Profit" value={`${r.profit < 0 ? "-" : ""}$${Math.abs(r.profit).toFixed(0)}`} />
                <Cell label="Rating" value={`${r.rating}/5`} />
              </div>
            )}
            {r && <p className="mt-2 text-sm text-night-200">{r.why}</p>}
            {e.feedback?.notes && <p className="mt-1 text-sm italic text-night-400">“{e.feedback.notes}”</p>}
            {!e.feedback && <FeedbackForm onSave={(f) => onUpdate({ ...e, status: "done", feedback: f })} />}
            {e.announcement && !e.feedback && (
              <details className="mt-3 text-sm">
                <summary className="cursor-pointer text-night-400">Announcement</summary>
                <p className="mt-1 whitespace-pre-wrap text-night-200">{e.announcement}</p>
              </details>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-night-800 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-night-400">{label}</div>
      <div className="font-semibold text-white">{value}</div>
    </div>
  );
}

function FeedbackForm({ onSave }: { onSave: (f: EventFeedback) => void }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ attendance: "", actualCost: "", revenue: "", rating: "4", notes: "" });
  if (!open)
    return (
      <button className="btn-ghost mt-4" onClick={() => setOpen(true)}>
        Log results
      </button>
    );
  const valid = f.attendance !== "" && f.actualCost !== "" && f.revenue !== "";
  return (
    <form
      className="mt-4 grid gap-3 sm:grid-cols-4"
      onSubmit={(ev) => {
        ev.preventDefault();
        if (!valid) return;
        onSave({
          attendance: Number(f.attendance),
          actualCost: Number(f.actualCost),
          revenue: Number(f.revenue),
          rating: Number(f.rating) as EventFeedback["rating"],
          notes: f.notes,
        });
      }}
    >
      <Field label="Guests" value={f.attendance} onChange={(v) => setF({ ...f, attendance: v })} />
      <Field label="Actual cost ($)" value={f.actualCost} onChange={(v) => setF({ ...f, actualCost: v })} />
      <Field label="Revenue that night ($)" value={f.revenue} onChange={(v) => setF({ ...f, revenue: v })} />
      <label>
        <span className="label">Your rating</span>
        <select className="input mt-1" value={f.rating} onChange={(e) => setF({ ...f, rating: e.target.value })}>
          {[5, 4, 3, 2, 1].map((n) => (
            <option key={n} value={n}>
              {n} / 5
            </option>
          ))}
        </select>
      </label>
      <label className="sm:col-span-4">
        <span className="label">What guests said</span>
        <input className="input mt-1" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="Too loud, loved the special, ran out of buns…" />
      </label>
      <div className="flex gap-2 sm:col-span-4">
        <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>
          Cancel
        </button>
        <button className="btn-primary" disabled={!valid}>
          Save results
        </button>
      </div>
    </form>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label>
      <span className="label">{label}</span>
      <input type="number" min={0} className="input mt-1" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
