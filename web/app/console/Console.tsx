"use client";

/**
 * Dispatcher console (D2-03 + D2-04). Map first: the canyon fills the screen; requests (left) and the
 * plan + fleet (right) sit on top of it. Approve with the button or `A` (`J`/`K` move). "Close a road":
 * click two points on SR 89A → POST /roads/closures → the solver re-plans at once.
 * Everything live comes from /live through lib/live.ts; static layers come from GET /hazards.
 */
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { SimBadge } from "@/components/Shell";
import { api, type StandIns } from "@/lib/api";
import { useLive } from "@/lib/live";

const MapView = dynamic(() => import("./MapView"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-bg" />,
});

type Doc = { id: string } & Record<string, unknown>;
type Need = { seats?: number; wheelchair?: number; stretcher?: number; crew?: number; lift?: boolean };
type LonLat = [number, number];
type Statics = { hazards: Doc[]; closures: Doc[]; shelters: Doc[]; zones: Doc[] };

const OPEN = new Set(["received", "approved", "driver_accepted", "en_route", "arrived", "reassigning"]);
const ON_A_VAN = new Set(["driver_accepted", "en_route", "arrived"]);
const HORIZON_MIN = 180; // full time-left bar
const PANEL = "z-10 rounded-xl border border-line bg-panel/92 shadow-2xl backdrop-blur";
const BTN = "rounded border border-line bg-panel px-2.5 py-1 text-ink hover:border-muted disabled:opacity-50";
const BTN_PRIMARY =
  "min-h-9 rounded bg-vehicle px-3 py-1 text-sm font-semibold text-bg hover:brightness-110 disabled:opacity-50";

function minutesLeft(iso: unknown, now: number): number | null {
  if (typeof iso !== "string") return null;
  return (new Date(/[zZ]|[+-]\d\d:\d\d$/.test(iso) ? iso : `${iso}Z`).getTime() - now) / 60_000;
}

function NeedIcons({ need }: { need?: Need }) {
  if (!need) return null;
  return (
    <span className="flex gap-1.5 text-xs text-muted">
      <span title="people">👤×{need.seats ?? 1}</span>
      {!!need.wheelchair && <span title="wheelchair">♿×{need.wheelchair}</span>}
      {!!need.stretcher && <span title="stretcher">stretcher</span>}
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
      <div className="h-1.5 w-16 overflow-hidden rounded bg-line">
        <div className={`h-full ${urgent ? "bg-fire" : "bg-help"}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`w-12 text-right text-xs tabular-nums ${urgent ? "text-fire" : "text-muted"}`}>
        {min <= 0 ? "past" : `${Math.round(min)}m`}
      </span>
    </div>
  );
}

function Counter({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="flex flex-col items-center px-3">
      <span key={value} className={`text-lg font-semibold tabular-nums ${tone ?? ""}`}>
        {value}
      </span>
      <span className="text-[10px] uppercase tracking-wider text-muted">{label}</span>
    </div>
  );
}

function Legend() {
  const dot = (cls: string, label: string) => (
    <span className="flex items-center gap-1.5">
      <span className={`inline-block h-2.5 w-2.5 rounded-full ${cls}`} />
      {label}
    </span>
  );
  return (
    <div className={`${PANEL} flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 text-xs text-muted`}>
      {dot("bg-fire", "needs a ride")}
      {dot("bg-help", "can help")}
      {dot("bg-out", "left")}
      {dot("bg-unknown", "not reached")}
      {dot("bg-vehicle ring-2 ring-ink", "vehicle")}
      {dot("bg-sim", "shelter")}
      <span className="flex items-center gap-1.5">
        <span className="inline-block h-1 w-5 rounded bg-fire" />
        road closed
      </span>
      <SimBadge />
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
  const liveZones = useLive((s) => s.zones);
  const liveHazards = useLive((s) => s.hazards);
  const plan = useLive((s) => s.plan);
  const lastSafety = useLive((s) => s.safety[s.safety.length - 1]);

  const [now, setNow] = useState(() => Date.now());
  const [selected, setSelected] = useState(0);
  const [selectedHome, setSelectedHome] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [alert, setAlert] = useState<{ id: string; text: string } | null>(null);
  const [standIns, setStandIns] = useState<StandIns | null>(null);
  const [statics, setStatics] = useState<Statics>({ hazards: [], closures: [], shelters: [], zones: [] });
  const [drawing, setDrawing] = useState<LonLat[] | null>(null);
  const [panels, setPanels] = useState(true);

  const loadStatics = useCallback(async () => {
    try {
      const h = await api.hazards();
      setStatics({ hazards: h.hazards, closures: h.closures, shelters: h.shelters ?? [], zones: h.zones ?? [] });
    } catch {
      /* the map still draws everything live */
    }
  }, []);

  useEffect(() => connect(), [connect]);
  // Driver safety alerts (D2-08): SOS / man-down from the driver app arrive on /live as vehicle.safety.
  useEffect(() => {
    if (!lastSafety) return;
    const { id, state, lon, lat } = lastSafety.data as { id: string; state: string; lon?: number; lat?: number };
    if (state === "sos" || state === "man_down") {
      const name = String(useLive.getState().vehicles[id]?.driverName ?? id);
      const where = typeof lat === "number" && typeof lon === "number" ? ` at ${lat.toFixed(4)}, ${lon.toFixed(4)}` : "";
      setAlert({ id, text: `${state === "sos" ? "SOS" : "MAN DOWN"}: ${name}${where}` });
    } else {
      setAlert((a) => (a?.id === id ? null : a));
    }
  }, [lastSafety]);
  useEffect(() => {
    void loadStatics();
  }, [loadStatics]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    api.simControl().then((r) => setStandIns(r.standIns)).catch(() => setStandIns(null));
  }, []);

  const hh = useMemo(() => Object.values(households), [households]);
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

  // Zones: outlines from /hazards, status from /live.
  const zones = useMemo(
    () => statics.zones.map((z) => ({ ...z, ...(liveZones[z.id] ? { status: liveZones[z.id].status } : {}) })),
    [statics.zones, liveZones],
  );
  const hazards = useMemo(
    () => Object.values({ ...Object.fromEntries(statics.hazards.map((h) => [h.id, h])), ...liveHazards }),
    [statics.hazards, liveHazards],
  );

  const run = useCallback(
    async (label: string, fn: () => Promise<unknown>, done?: (r: unknown) => string) => {
      setBusy(label);
      setNote(null);
      try {
        const r = await fn();
        if (done) setNote(done(r));
        await Promise.all([resync(), loadStatics()]);
      } catch (e) {
        setNote(`${label} failed: ${(e as Error).message}`);
      } finally {
        setBusy(null);
      }
    },
    [resync, loadStatics],
  );

  const approve = useCallback(
    (a: Doc | undefined) => {
      if (!a || a.status !== "proposed") return;
      void run("Approve", () => api.approve(a.id));
    },
    [run],
  );

  const onMapClick = useCallback(
    (p: LonLat) => {
      if (!drawing) {
        setSelectedHome(null);
        return;
      }
      const pts = [...drawing, p];
      if (pts.length < 2) {
        setDrawing(pts);
        return;
      }
      setDrawing(null);
      void run("Close road", () => api.closeRoad(pts), () => "Road closed. Re-planning now.");
    },
    [drawing, run],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey) return;
      const k = e.key.toLowerCase();
      if (k === "escape") setDrawing(null);
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
  const home = selectedHome ? (households[selectedHome] as Doc | undefined) : undefined;
  const homeRequest = home ? Object.values(requests).find((r) => r.householdId === home.id && r.status !== "closed") : undefined;
  const record = (home?.record ?? {}) as Record<string, unknown>;

  return (
    <main className="relative h-dvh overflow-hidden">
      <MapView
        households={hh}
        requests={requests}
        vehicles={Object.values(vehicles)}
        assignments={Object.values(assignments)}
        closures={statics.closures}
        hazards={hazards}
        shelters={statics.shelters}
        zones={zones}
        selectedHouseholdId={selectedHome}
        highlightAssignmentId={offers[selected]?.id ?? null}
        drawing={drawing}
        onSelectHousehold={setSelectedHome}
        onMapClick={onMapClick}
      />

      <header
        className={`${PANEL} absolute inset-x-3 top-3 flex flex-wrap items-center justify-between gap-3 px-4 py-2`}
      >
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
          <button
            className={`${BTN} ${drawing ? "border-fire text-fire" : ""}`}
            onClick={() => setDrawing((d) => (d ? null : []))}
            title="Click two points on the road. Esc cancels."
          >
            {drawing ? (drawing.length ? "Click the second point…" : "Click the first point…") : "Close a road"}
          </button>
          <button className={BTN} onClick={() => setPanels((v) => !v)}>
            {panels ? "Hide lists" : "Show lists"}
          </button>
          <span className="mx-1 h-5 w-px bg-line" />
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
          <label className="flex items-center gap-1 text-muted">
            <input
              type="checkbox"
              checked={!!standIns?.drivers}
              onChange={(e) =>
                run("Stand-in drivers", async () => setStandIns((await api.simControl({ drivers: e.target.checked })).standIns))
              }
            />
            stand-in drivers
          </label>
        </div>
      </header>

      {alert && (
        <div
          role="alert"
          className="absolute left-1/2 top-32 z-20 -translate-x-1/2 rounded-lg border border-fire bg-fire/20 px-4 py-2 text-sm font-semibold text-fire"
        >
          {alert.text}
          <button className="ml-3 text-muted" onClick={() => setAlert(null)}>
            ×
          </button>
        </div>
      )}

      {note && (
        <div className={`${PANEL} absolute left-1/2 top-20 -translate-x-1/2 px-4 py-2 text-sm`}>
          {note}
          <button className="ml-3 text-muted" onClick={() => setNote(null)}>
            ×
          </button>
        </div>
      )}

      {panels && (
        <section className={`${PANEL} absolute bottom-14 left-3 top-[5.5rem] flex w-[22rem] flex-col`}>
          <h2 className="border-b border-line px-3 py-2 text-sm font-semibold">
            Open requests <span className="text-muted">({openRequests.length})</span>
          </h2>
          <ul className="flex flex-1 flex-col gap-1 overflow-y-auto p-2">
            {openRequests.length === 0 && <li className="p-2 text-sm text-muted">No ride requests yet.</li>}
            {openRequests.map((r) => (
              <li
                key={r.id}
                onClick={() => setSelectedHome(String(r.householdId))}
                className={`flex cursor-pointer items-center justify-between gap-2 rounded px-2.5 py-2 ${
                  selectedHome === r.householdId ? "bg-vehicle/15 ring-1 ring-vehicle/50" : "bg-bg/60 hover:bg-bg"
                }`}
              >
                <div className="min-w-0">
                  <div className="truncate text-sm">{addressOf(r)}</div>
                  <div className="flex items-center gap-2">
                    <NeedIcons need={r.need as Need} />
                    <span className="text-[10px] uppercase tracking-wider text-muted">{String(r.status).replace("_", " ")}</span>
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
      )}

      {panels && (
        <aside className="absolute bottom-14 right-3 top-[5.5rem] z-10 flex w-[24rem] flex-col gap-3">
          <section className={`${PANEL} flex min-h-0 flex-1 flex-col`}>
            <h2 className="flex items-center justify-between border-b border-line px-3 py-2 text-sm font-semibold">
              <span>
                Plan {plan ? <span className="text-muted">v{String(plan.version)}</span> : null}
                <span className="ml-2 text-xs font-normal text-muted">A approve · J/K move</span>
              </span>
              {plan && <span className="text-xs font-normal text-muted">{String(plan.solveMs)} ms</span>}
            </h2>
            <ul className="flex flex-1 flex-col gap-1 overflow-y-auto p-2">
              {offers.length === 0 && <li className="p-2 text-sm text-muted">Nothing to approve.</li>}
              {offers.map((a, i) => {
                const r = requests[String(a.requestId)];
                const v = vehicles[String(a.vehicleId)];
                return (
                  <li
                    key={a.id}
                    onClick={() => {
                      setSelected(i);
                      if (r) setSelectedHome(String(r.householdId));
                    }}
                    className={`flex cursor-pointer items-center justify-between gap-2 rounded px-2.5 py-2 ${
                      i === selected ? "bg-vehicle/15 ring-1 ring-vehicle/50" : "bg-bg/60 hover:bg-bg"
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm">{r ? addressOf(r) : String(a.requestId)}</div>
                      <div className="flex items-center gap-2 text-xs text-muted">
                        <span className="text-vehicle">{String(v?.driverName ?? a.vehicleId)}</span>
                        <span>stop {String(a.stopOrder)}</span>
                        <span className="tabular-nums">ETA {Math.round(Number(a.etaMinutes ?? 0))}m</span>
                        {!!a.late && <span className="font-semibold text-fire">LATE</span>}
                      </div>
                    </div>
                    {a.status === "proposed" ? (
                      <button
                        className={BTN_PRIMARY}
                        disabled={!!busy}
                        onClick={(e) => {
                          e.stopPropagation();
                          approve(a);
                        }}
                      >
                        Approve
                      </button>
                    ) : (
                      <span className="text-xs text-help">offered</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
          <section className={`${PANEL} max-h-[30%] overflow-y-auto`}>
            <h2 className="border-b border-line px-3 py-2 text-sm font-semibold">Fleet</h2>
            <ul className="flex flex-col gap-1 p-2 text-sm">
              {Object.values(vehicles).map((v) => {
                const sos = ["sos", "man_down"].includes(String((v.safety as { state?: string } | undefined)?.state));
                return (
                  <li key={v.id} className={`flex items-center justify-between rounded px-2.5 py-1.5 ${sos ? "bg-fire/20" : "bg-bg/60"}`}>
                    <span>
                      {String(v.driverName)} <span className="text-xs text-muted">{String(v.kind)}</span>
                    </span>
                    <span className="flex items-center gap-2 text-xs text-muted">
                      {sos ? <span className="font-semibold text-fire">SOS</span> : String(v.status)}
                      {!!v.simulated && <SimBadge />}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        </aside>
      )}

      {home && (
        <section className={`${PANEL} absolute bottom-14 left-1/2 w-[26rem] -translate-x-1/2 p-4`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-semibold">{String(home.address)}</div>
              <div className="text-xs text-muted">
                {String(home.role).replace("_", " ")} · reach {String(home.reach).replace("_", " ")}
                {home.simulated ? " · SIM" : ""}
              </div>
            </div>
            <button className="text-muted" onClick={() => setSelectedHome(null)}>
              ×
            </button>
          </div>
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            {(["peopleCount", "mobility", "assistance", "canLeave", "hasCar", "pets"] as const).map((k) =>
              record[k] === undefined || record[k] === null ? null : (
                <div key={k} className="flex justify-between gap-2">
                  <dt className="text-muted">{k}</dt>
                  <dd>{String(record[k]).replace(/_/g, " ")}</dd>
                </div>
              ),
            )}
          </dl>
          {homeRequest && (
            <div className="mt-2 flex items-center justify-between border-t border-line pt-2 text-sm">
              <span>
                ride: <span className="font-semibold">{String(homeRequest.status).replace("_", " ")}</span>
                {homeRequest.escalation ? <span className="ml-2 text-fire">{String(homeRequest.escalation)}</span> : null}
              </span>
              <TimeLeft min={minutesLeft(homeRequest.deadlineAt, now)} />
            </div>
          )}
        </section>
      )}

      <div className="absolute bottom-3 left-3 z-10">
        <Legend />
      </div>
    </main>
  );
}
