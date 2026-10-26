"use client";
import { useMemo, useRef, useState } from "react";
import { Trace, type TraceStep } from "@/components/Trace";
import { PlanView } from "@/components/PlanView";
import { EventsView } from "@/components/EventsView";
import { ProfileForm } from "@/components/ProfileForm";
import { LiveSignals } from "@/components/LiveSignals";
import SAMPLE_PLAN from "@/lib/sample-plan.json";
import { DEMO_CAFE, DEMO_HISTORY } from "@/lib/seed";
import { nextWeekday, useStored } from "@/lib/storage";
import type { PlanEvent } from "@/lib/events";
import type { CafeProfile, EventRecord, Plan, PlanIdea } from "@/lib/types";

type Tab = "plan" | "events" | "cafe";

export default function Home() {
  const [tab, setTab] = useState<Tab>("plan");
  const [cafe, setCafe] = useStored<CafeProfile>("dn.cafe", DEMO_CAFE);
  const [history, setHistory] = useStored<EventRecord[]>("dn.history", DEMO_HISTORY);
  const [plan, setPlan] = useStored<Plan | null>("dn.plan", null);
  const [isSample, setIsSample] = useStored("dn.planIsSample", false);
  const [demoDismissed, setDemoDismissed] = useStored("dn.demoDismissed", false);
  const [steps, setSteps] = useState<TraceStep[]>([]);
  const [thoughts, setThoughts] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [request, setRequest] = useState("");
  const abort = useRef<AbortController | null>(null);

  const approvedIds = useMemo(() => new Set(history.map((h) => h.idea.title)), [history]);
  const pendingFeedback = history.filter((h) => !h.feedback).length;
  const isDemo = cafe.name === DEMO_CAFE.name && cafe.address === DEMO_CAFE.address;

  async function run() {
    abort.current?.abort();
    const ac = new AbortController();
    abort.current = ac;
    setRunning(true);
    setError(null);
    setSteps([]);
    setThoughts("");
    setNotice(null);
    setPlan(null);
    setIsSample(false);
    try {
      const res = await fetch("/api/plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cafe, history, request: request.trim() || undefined }),
        signal: ac.signal,
      });
      if (!res.ok || !res.body) throw new Error((await res.json().catch(() => null))?.error ?? `Request failed (${res.status})`);
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let gotPlan = false;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const e = JSON.parse(line) as PlanEvent;
          if (e.type === "start") {
            // A new planner (fallback model or offline) starts over; show only its trace.
            setSteps([]);
            setThoughts("");
          }
          if (e.type === "start") setMode(e.mode === "agent" ? `AI agent (${e.model})` : "Offline planner");
          else if (e.type === "text") setThoughts((t) => t + e.text);
          else if (e.type === "notice") setNotice(e.message);
          else if (e.type === "tool-call") setSteps((s) => [...s, { id: e.id, name: e.name, input: e.input }]);
          else if (e.type === "tool-result") setSteps((s) => s.map((x) => (x.id === e.id ? { ...x, output: e.output } : x)));
          else if (e.type === "plan") {
            gotPlan = true;
            setPlan(e.plan);
          } else if (e.type === "error") setError(e.message);
        }
      }
      if (!gotPlan) setError((err) => err ?? "The agent stopped without a plan. Try again.");
    } catch (err) {
      if ((err as Error).name !== "AbortError") setError((err as Error).message);
    } finally {
      setRunning(false);
    }
  }

  function approve(idea: PlanIdea, date: string, announcement: string, announced: boolean) {
    setHistory((h) => [...h, { id: crypto.randomUUID(), date, status: announced ? "announced" : "approved", idea, announcement }]);
  }

  return (
    <main className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4 py-8">
        <div>
          <h1 className="font-display text-4xl text-white">
            Dead <span className="text-lamp-400">Night</span>
          </h1>
          <p className="mt-1 text-sm text-night-400">
            Fill {cafe.name}&apos;s quietest night with something your neighbourhood actually wants. Powered by Qloo taste data.
          </p>
        </div>
        <nav className="flex gap-1 rounded-xl border border-night-700 bg-night-900 p-1 text-sm">
          {(
            [
              ["plan", "Plan"],
              ["events", `Events${pendingFeedback ? ` (${pendingFeedback})` : ""}`],
              ["cafe", "My café"],
            ] as const
          ).map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)} className={`rounded-lg px-4 py-1.5 ${tab === k ? "bg-night-700 text-white" : "text-night-400 hover:text-night-200"}`}>
              {label}
            </button>
          ))}
        </nav>
      </header>

      {tab === "plan" && (
        <div className="space-y-6">
          <div className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
            <div className="flex-1">
              <p className="text-sm text-night-200">
                Plan the next <span className="capitalize text-lamp-300">{cafe.quietNight}</span> at {cafe.name}: ${cafe.budget} budget, {cafe.staffAvailable} staff, {cafe.seats} seats, until {cafe.latestEventEnd}.
              </p>
              <input className="input mt-2" placeholder="Anything specific this week? (optional, e.g. 'something for students during finals')" value={request} onChange={(e) => setRequest(e.target.value)} />
            </div>
            <button className="btn-primary sm:self-end" onClick={run} disabled={running}>
              {running ? "Planning…" : plan ? "Plan again" : `Plan my ${cafe.quietNight.charAt(0).toUpperCase()}${cafe.quietNight.slice(1)}`}
            </button>
          </div>

          {error && <div className="rounded-xl border border-ember-400/40 bg-ember-400/10 p-3 text-sm text-ember-400">{error}</div>}

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className={`min-w-0 space-y-4 lg:order-1 ${plan || running ? "order-1" : "order-2"}`}>
              {isDemo && !demoDismissed && !running && (
                <div className="flex flex-wrap items-center gap-3 rounded-xl border border-night-700 bg-night-800/60 px-4 py-3 text-sm">
                  <span className="flex-1">
                    You&apos;re trying <span className="text-white">{DEMO_CAFE.name}</span>, a made-up café in Williamsburg. Put in your own café to see what your neighbourhood wants.
                  </span>
                  <button className="btn-ghost py-1 text-xs" onClick={() => setTab("cafe")}>
                    Set up my café
                  </button>
                  <button className="text-night-400 hover:text-night-200" onClick={() => setDemoDismissed(true)} aria-label="Dismiss">
                    ✕
                  </button>
                </div>
              )}
              {plan && isSample && (
                <div className="rounded-xl border border-lamp-400/30 bg-lamp-400/5 px-4 py-3 text-sm text-lamp-300">
                  This is a saved plan from an earlier run of the AI agent on the demo café, so you can see the result right away. Click <span className="font-semibold">Plan again</span> to watch the agent run live against Qloo.
                </div>
              )}
              {plan ? (
                <PlanView plan={plan} cafe={cafe} defaultDate={nextWeekday(cafe.quietNight)} onApprove={approve} approvedIds={approvedIds} />
              ) : running ? (
                <LiveSignals steps={steps} />
              ) : (
                <div className="card p-10 text-center">
                  <p className="font-display text-2xl text-white">
                    Your <span className="capitalize">{cafe.quietNight}</span>s are quiet.
                  </p>
                  <p className="mx-auto mt-2 max-w-md text-sm text-night-400">
                    Dead Night looks up what your café&apos;s crowd and the neighbourhood actually love in Qloo, checks every idea against your budget, staff and hours, and learns from how past events went. You approve anything that costs money or gets announced.
                  </p>
                  <div className="mt-6 flex flex-wrap justify-center gap-3">
                    <button className="btn-primary" onClick={run}>
                      Run the agent live (about a minute)
                    </button>
                    {isDemo && (
                      <button
                        className="btn-ghost"
                        onClick={() => {
                          setPlan(SAMPLE_PLAN as Plan);
                          setIsSample(true);
                        }}
                      >
                        See a sample plan instantly
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
            {(running || steps.length > 0) && (
              <aside className={`min-w-0 lg:order-2 ${plan || running ? "order-2" : "order-1"}`}>
                <Trace steps={steps} running={running} thoughts={thoughts} />
                {mode && <p className="mt-2 text-right text-[11px] text-night-400">Planner: {mode}</p>}
                {notice && <p className="mt-1 text-right text-[11px] text-night-400">{notice}, so the offline planner finished the job.</p>}
              </aside>
            )}
          </div>
        </div>
      )}

      {tab === "events" && (
        <EventsView
          cafe={cafe}
          history={history}
          onUpdate={(e) => setHistory((h) => h.map((x) => (x.id === e.id ? e : x)))}
          onDelete={(id) => setHistory((h) => h.filter((x) => x.id !== id))}
        />
      )}

      {tab === "cafe" && (
        <ProfileForm
          cafe={cafe}
          onChange={setCafe}
          onReset={() => {
            setCafe(DEMO_CAFE);
            setHistory(DEMO_HISTORY);
            setPlan(null);
          }}
        />
      )}

      <footer className="mt-16 text-center text-xs text-night-400">
        Taste data from{" "}
        <a className="underline" href="https://www.qloo.com" target="_blank" rel="noreferrer">
          Qloo
        </a>
        . Your café data stays in this browser. Nothing is posted or spent without your approval.
      </footer>
    </main>
  );
}
