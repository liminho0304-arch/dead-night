"use client";
import { useState } from "react";
import type { CafeProfile, Plan, PlanIdea } from "@/lib/types";

const fmtTime = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  const hr = h % 12 || 12;
  return `${hr}${m ? `:${String(m).padStart(2, "0")}` : ""}${h >= 12 && h < 24 ? "pm" : "am"}`;
};

export function PlanView({
  plan,
  cafe,
  defaultDate,
  onApprove,
  approvedIds,
}: {
  plan: Plan;
  cafe: CafeProfile;
  defaultDate: string;
  onApprove: (idea: PlanIdea, date: string, announcement: string, announced: boolean) => void;
  approvedIds: Set<string>;
}) {
  return (
    <div className="space-y-6">
      <div className="card p-5">
        <p className="font-display text-xl leading-snug text-lamp-300">{plan.headline}</p>
        <p className="mt-3 text-sm leading-relaxed text-night-200">{plan.audienceSummary}</p>
        {plan.learningsApplied.length > 0 && (
          <div className="mt-4 rounded-lg border border-sage-400/30 bg-sage-400/5 p-3">
            <p className="label text-sage-400">Learned from your past events</p>
            <ul className="mt-1 list-disc pl-5 text-sm">
              {plan.learningsApplied.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {plan.ideas.map((idea, i) => (
          <IdeaCard key={idea.id + i} idea={idea} rank={i + 1} cafe={cafe} defaultDate={defaultDate} onApprove={onApprove} approved={approvedIds.has(idea.title)} />
        ))}
      </div>

      {plan.ruledOut.length > 0 && (
        <div className="card p-5">
          <p className="label">Ruled out</p>
          <ul className="mt-2 space-y-2">
            {plan.ruledOut.map((r, i) => (
              <li key={i} className="flex gap-2 text-sm">
                <span className="text-ember-400">✗</span>
                <span>
                  <span className="font-medium text-night-200">{r.idea}</span> <span className="text-night-400">— {r.reason}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function IdeaCard({
  idea,
  rank,
  cafe,
  defaultDate,
  onApprove,
  approved,
}: {
  idea: PlanIdea;
  rank: number;
  cafe: CafeProfile;
  defaultDate: string;
  onApprove: (idea: PlanIdea, date: string, announcement: string, announced: boolean) => void;
  approved: boolean;
}) {
  const [approving, setApproving] = useState(false);
  const [date, setDate] = useState(defaultDate);
  const [text, setText] = useState(idea.announcementDraft);
  const [spend, setSpend] = useState(false);
  const [announce, setAnnounce] = useState(false);
  const lift = idea.expectedAttendance - cafe.typicalQuietNightCovers;

  return (
    <article className={`card flex flex-col p-5 ${rank === 1 ? "ring-1 ring-lamp-400/40" : ""}`}>
      <div className="flex items-center justify-between">
        <span className="label">
          #{rank} · {idea.format}
        </span>
        <span className="text-xs text-night-400">
          {fmtTime(idea.startTime)}–{fmtTime(idea.endTime)}
        </span>
      </div>
      <h3 className="font-display mt-2 text-lg leading-tight text-white">{idea.title}</h3>
      <p className="mt-2 text-sm text-night-200">{idea.pitch}</p>

      <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
        <Stat label="Cost" value={`$${idea.estimatedCost}`} sub={`of $${cafe.budget}`} />
        <Stat label="Staff" value={String(idea.staffNeeded)} sub={`of ${cafe.staffAvailable}`} />
        <Stat label="Guests" value={`~${idea.expectedAttendance}`} sub={`${lift >= 0 ? "+" : ""}${lift} vs usual`} />
      </dl>

      <div className="mt-4">
        <p className="label">Why it fits</p>
        <p className="mt-1 text-sm leading-relaxed">{idea.whyItFits}</p>
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {idea.tasteSignals.map((s, i) => (
            <li key={i} title={s.detail ? `${s.source}: ${s.detail}` : s.source} className="rounded-full border border-lamp-400/30 bg-lamp-400/10 px-2.5 py-0.5 text-xs text-lamp-300">
              {s.label}
            </li>
          ))}
        </ul>
      </div>

      {idea.menuTieIns.length > 0 && (
        <div className="mt-4">
          <p className="label">On the menu</p>
          <p className="mt-1 text-sm">{idea.menuTieIns.join(" · ")}</p>
        </div>
      )}

      <details className="mt-4 text-sm">
        <summary className="cursor-pointer text-night-400 hover:text-night-200">Costs and risks</summary>
        <ul className="mt-2 space-y-0.5">
          {idea.costBreakdown.map((c, i) => (
            <li key={i} className="flex justify-between text-night-400">
              <span>{c.item}</span>
              <span>${c.amount}</span>
            </li>
          ))}
        </ul>
        {idea.risks.length > 0 && (
          <ul className="mt-2 list-disc pl-5 text-night-400">
            {idea.risks.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        )}
      </details>

      <div className="mt-auto pt-5">
        {approved ? (
          <p className="rounded-lg bg-sage-400/10 px-3 py-2 text-center text-sm text-sage-400">Approved. Find it under Events.</p>
        ) : !approving ? (
          <button className="btn-primary w-full" onClick={() => setApproving(true)}>
            Review and approve
          </button>
        ) : (
          <div className="space-y-3 rounded-xl border border-night-600 bg-night-800/60 p-3">
            <label className="block">
              <span className="label">Date</span>
              <input type="date" className="input mt-1" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label className="block">
              <span className="label">Announcement (edit freely)</span>
              <textarea className="input mt-1 h-28" value={text} onChange={(e) => setText(e.target.value)} />
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1 accent-lamp-400" checked={spend} onChange={(e) => setSpend(e.target.checked)} />
              <span>I approve spending up to ${idea.estimatedCost} on this event.</span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1 accent-lamp-400" checked={announce} onChange={(e) => setAnnounce(e.target.checked)} />
              <span>I approve this announcement (copied to your clipboard to post).</span>
            </label>
            <div className="flex gap-2">
              <button className="btn-ghost flex-1" onClick={() => setApproving(false)}>
                Cancel
              </button>
              <button
                className="btn-primary flex-1"
                disabled={!spend}
                onClick={async () => {
                  if (announce) {
                    try {
                      await navigator.clipboard.writeText(text);
                    } catch {}
                  }
                  onApprove(idea, date, text, announce);
                }}
              >
                Approve
              </button>
            </div>
          </div>
        )}
      </div>
    </article>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-lg bg-night-800 px-2 py-2">
      <dt className="text-[10px] uppercase tracking-wider text-night-400">{label}</dt>
      <dd className="text-base font-semibold text-white">{value}</dd>
      <dd className="text-[10px] text-night-400">{sub}</dd>
    </div>
  );
}
