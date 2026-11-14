"use client";

/**
 * Dispatcher console v0 (D2-04, enough for M1): open requests by deadline, the proposed plan with
 * Approve (button or `A`, `J`/`K` to move), fleet, and SIM controls.
 * TODO(D2-03): full-bleed MapLibre + deck.gl map; these lists become the left/right drawers.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { SimBadge } from "@/components/Shell";
import { api, type StandIns } from "@/lib/api";
import { useLive } from "@/lib/live";

type Doc = { id: string } & Record<string, unknown>;
type Need = { seats?: number; wheelchair?: number; stretcher?: number; crew?: number; lift?: boolean };

const OPEN = new Set(["received", "approved", "driver_accepted", "en_route", "arrived", "reassigning"]);
const ON_A_VAN = new Set(["driver_accepted", "en_route", "arrived"]);
const HORIZON_MIN = 180; // full time-left bar
const BTN =
  "rounded border border-line bg-panel px-2.5 py-1 text-ink hover:border-muted disabled:opacity-50";
const BTN_PRIMARY =
  "min-h-9 rounded bg-vehicle px-3 py-1 text-sm font-semibold text-bg hover:brightness-110 disabled:opacity-50";

function minutesLeft(iso: unknown, now: number): number | null {
  if (typeof iso !== "string") return null;
  return (new Date(iso.endsWith("Z") || iso.includes("+") ? iso : `${iso}Z`).getTime() - now) / 60_000;
}

function NeedIcons({ need }: { need?: Need }) {
  if (!need) return null;
  return (
    <span className="flex gap-1.5 text-xs text-muted">
      <span title="seats">👤×{need.seats ?? 1}</span>
      {!!need.wheelchair && <span title="wheelchair">🦽×{need.wheelchair}</span>}
      {!!need.stretcher && <span title="stretcher">🛏️</span>}
      {(need.crew ?? 1) > 1 && <span title="crew">crew {need.crew}</span>}
      {need.lift && <span title="lift">lift</span>}
    </span>
  );
}

function TimeLeft({ min }: { min: number | null }) {
  if (min === null) return <span className="text-xs text-muted">no deadline</span>;
  const pct = Math.max(0, Math.min(100, (min / HORIZON_MIN) * 100));
  const urgent = min < 30;
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-24 overflow-hidden rounded bg-line">
        <div className={`h-full ${urgent ? "bg-fire" : "bg-help"}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`w-14 text-xs tabular-nums ${urgent ? "text-fire" : "text-muted"}`}>
        {min <= 0 ? "past" : `${Math.round(min)} min`}
      </span>
    </div>
  );
}

function Counter({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="flex flex-col items-center px-3">
      <span key={value} className={`animate-flash rounded px-1 text-lg font-semibold tabular-nums ${tone ?? ""}`}>
        {value}
      </span>
      <span className="text-[10px] uppercase tracking-wider text-muted">{label}</span>
    </div>
  );
}

export function Console() {
  const connect = useLive((s) => s.connect);
  const resync = useLive((s) => s.resync);
  const connected = useLive((s) => s.connected);
  const households = useLive((s) => s.households);
  const requests = useLive((s) => s.requests);
  const assignments = useLive((s) => s.assignments);
  const vehicles = useLive((s) => s.vehicles);
  const plan = useLive((s) => s.plan);

  const [now, setNow] = useState(() => Date.now());
  const [selected, setSelected] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [standIns, setStandIns] = useState<StandIns | null>(null);

  useEffect(() => connect(), [connect]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    api.simControl().then((r) => setStandIns(r.standIns)).catch(() => setStandIns(null));
  }, []);

  const hh = Object.values(households);
  const counts = {
    homes: hh.length,
    reached: hh.filter((h) => h.reach === "answered").length,
    needRide: hh.filter((h) => h.role === "needs_ride").length,
    onVan: Object.values(requests).filter((r) => ON_A_VAN.has(String(r.status))).length,
    out: hh.filter((h) => h.role === "left").length,
  };

  const openRequests = useMemo(
    () =>
      Object.values(requests)
        .filter((r) => OPEN.has(String(r.status)) && !r.dupOf)
        .sort((a, b) => {
          const ra = a.status === "reassigning" ? 0 : 1;
          const rb = b.status === "reassigning" ? 0 : 1;
          if (ra !== rb) return ra - rb;
          return (minutesLeft(a.deadlineAt, 0) ?? Infinity) - (minutesLeft(b.deadlineAt, 0) ?? Infinity);
        }),
    [requests],
  );

  const offers = useMemo(
    () =>
      Object.values(assignments)
        .filter((a) => a.status === "proposed" || a.status === "offered")
        .sort((a, b) => Number(a.etaMinutes ?? 0) - Number(b.etaMinutes ?? 0)),
    [assignments],
  );

  const run = useCallback(
    async (label: string, fn: () => Promise<unknown>, done?: (r: unknown) => string) => {
      setBusy(label);
      setNote(null);
      try {
        const r = await fn();
        if (done) setNote(done(r));
        await resync();
      } catch (e) {
        setNote(`${label} failed: ${(e as Error).message}`);
      } finally {
        setBusy(null);
      }
    },
    [resync],
  );

  const approve = useCallback(
    (a: Doc | undefined) => {
      if (!a || a.status !== "proposed") return;
      void run("Approve", () => api.approve(a.id));
    },
    [run],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey) return;
      const k = e.key.toLowerCase();
      if (k === "j") setSelected((i) => Math.min(i + 1, Math.max(0, offers.length - 1)));
      if (k === "k") setSelected((i) => Math.max(0, i - 1));
      if (k === "a") approve(offers[selected]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [offers, selected, approve]);

  const addressOf = (r: Doc) =>
    String(
      (r.household as Doc | undefined)?.address ??
        (households[String(r.householdId)] as Doc | undefined)?.address ??
        r.householdId,
    );
  const requestOf = (a: Doc) => requests[String(a.requestId)];
  const vehicleOf = (a: Doc) => vehicles[String(a.vehicleId)];

  return (
    <main className="flex min-h-dvh flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-panel px-4 py-2">
        <div className="flex items-center gap-3">
          <span className="font-semibold">Way Out</span>
          <span className="text-muted">/ Dispatcher</span>
          <span className={`h-2 w-2 rounded-full ${connected ? "bg-out" : "bg-unknown"}`} title="live" />
        </div>
        <div className="flex">
          <Counter label="homes" value={counts.homes} />
          <Counter label="reached" value={counts.reached} />
          <Counter label="need ride" value={counts.needRide} tone="text-fire" />
          <Counter label="on a van" value={counts.onVan} tone="text-vehicle" />
          <Counter label="out" value={counts.out} tone="text-out" />
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <SimBadge />
          <button className={BTN} disabled={!!busy} onClick={() => run("Seed", () => api.seed(), () => "Seeded 200 homes (SIM)")}>
            Seed
          </button>
          <button
            className={BTN}
            disabled={!!busy}
            onClick={() => run("Census", () => api.census(), (r) => `${(r as { requests: number }).requests} ride requests (SIM)`)}
          >
            Instant census
          </button>
          <button
            className={BTN}
            disabled={!!busy}
            onClick={() =>
              run("Solve", () => api.solve(), (r) => {
                const s = r as { proposals: number; unservable: number; solveMs: number };
                return `${s.proposals} offers, ${s.unservable} unservable · ${s.solveMs} ms`;
              })
            }
          >
            Solve now
          </button>
          <label className="flex items-center gap-1 text-muted">
            <input
              type="checkbox"
              checked={!!standIns?.approval}
              onChange={(e) =>
                run("Auto-approve", async () => setStandIns((await api.simControl({ approval: e.target.checked })).standIns))
              }
            />
            auto-approve
          </label>
        </div>
      </header>

      {note && <div className="border-b border-line bg-panel/60 px-4 py-1.5 text-xs text-muted">{note}</div>}

      <div className="grid flex-1 grid-cols-1 gap-px bg-line lg:grid-cols-[1fr_1fr_18rem]">
        <section className="bg-bg p-3">
          <h2 className="mb-2 text-sm font-semibold">
            Open requests <span className="text-muted">({openRequests.length})</span>
          </h2>
          {openRequests.length === 0 && <p className="text-sm text-muted">No ride requests yet.</p>}
          <ul className="flex flex-col gap-1">
            {openRequests.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 rounded bg-panel px-3 py-2">
                <div className="min-w-0">
                  <div className="truncate text-sm">{addressOf(r)}</div>
                  <div className="flex items-center gap-2">
                    <NeedIcons need={r.need as Need} />
                    <span className="text-[10px] uppercase tracking-wider text-muted">{String(r.status)}</span>
                    {!!r.escalation && (
                      <span className="rounded bg-fire/15 px-1 text-[10px] font-semibold uppercase text-fire">
                        {String(r.escalation)}
                      </span>
                    )}
                  </div>
                </div>
                <TimeLeft min={minutesLeft(r.deadlineAt, now)} />
              </li>
            ))}
          </ul>
        </section>

        <section className="bg-bg p-3">
          <h2 className="mb-2 flex items-center justify-between text-sm font-semibold">
            <span>
              Plan {plan ? <span className="text-muted">v{String(plan.version)}</span> : null}
              <span className="ml-2 text-xs font-normal text-muted">A approve · J/K move</span>
            </span>
            {plan && <span className="text-xs font-normal text-muted">{String(plan.solveMs)} ms · greedy</span>}
          </h2>
          {offers.length === 0 && <p className="text-sm text-muted">Nothing to approve.</p>}
          <ul className="flex flex-col gap-1">
            {offers.map((a, i) => {
              const r = requestOf(a);
              const v = vehicleOf(a);
              return (
                <li
                  key={a.id}
                  onClick={() => setSelected(i)}
                  className={`flex items-center justify-between gap-2 rounded px-3 py-2 ${
                    i === selected ? "bg-vehicle/15 ring-1 ring-vehicle/50" : "bg-panel"
                  }`}
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm">{r ? addressOf(r) : String(a.requestId)}</div>
                    <div className="flex items-center gap-2 text-xs text-muted">
                      <span className="text-vehicle">{String(v?.driverName ?? a.vehicleId)}</span>
                      <span>stop {String(a.stopOrder)}</span>
                      <span className="tabular-nums">ETA {Math.round(Number(a.etaMinutes ?? 0))} min</span>
                      {!!a.late && <span className="font-semibold text-fire">LATE</span>}
                      <NeedIcons need={r?.need as Need} />
                    </div>
                  </div>
                  {a.status === "proposed" ? (
                    <button className={BTN_PRIMARY} disabled={!!busy} onClick={() => approve(a)}>
                      Approve
                    </button>
                  ) : (
                    <span className="text-xs text-help">offered · waiting for driver</span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        <aside className="bg-bg p-3">
          <h2 className="mb-2 text-sm font-semibold">Fleet</h2>
          <ul className="flex flex-col gap-1 text-sm">
            {Object.values(vehicles).map((v) => (
              <li key={v.id} className="flex items-center justify-between rounded bg-panel px-3 py-1.5">
                <span>
                  {String(v.driverName)} <span className="text-xs text-muted">{String(v.kind)}</span>
                </span>
                <span className="flex items-center gap-2 text-xs text-muted">
                  {String(v.status)}
                  {!!v.simulated && <SimBadge />}
                </span>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </main>
  );
}
