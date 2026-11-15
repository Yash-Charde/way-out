"use client";

/**
 * Dispatcher console. Map first: the canyon fills the screen; requests (left) and the
 * plan + fleet (right) sit on top of it. Approve with the button or `A` (`J`/`K` move). "Close a road":
 * click two points on SR 89A → POST /roads/closures → the solver re-plans at once.
 * Everything live comes from /live through lib/live.ts; static layers come from GET /hazards.
 */
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { MapLegend } from "@/components/MapLegend";
import { SimBadge } from "@/components/Shell";
import { FireReplay } from "./FireReplay";
import type { FireView } from "@/lib/api";
import { AnimatedNumber, AppHeader, CloseButton } from "@/components/ui";
import { api, type StandIns } from "@/lib/api";
import { useLive } from "@/lib/live";
import { useTheme } from "@/lib/theme";

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
const PANEL = "glass z-10";

function minutesLeft(iso: unknown, now: number): number | null {
  if (typeof iso !== "string") return null;
  return (new Date(/[zZ]|[+-]\d\d:\d\d$/.test(iso) ? iso : `${iso}Z`).getTime() - now) / 60_000;
}

const STATUS_STYLE: Record<string, string> = {
  received: "text-fire bg-fire/10",
  reassigning: "text-fire bg-fire/10",
  approved: "text-muted bg-ink/5",
  driver_accepted: "text-vehicle bg-vehicle/10",
  en_route: "text-vehicle bg-vehicle/10",
  arrived: "text-out bg-out/10",
};

function StatusTag({ status }: { status: string }) {
  return (
    <span
      key={status}
      className={`animate-flash rounded-full px-1.5 py-px text-[10px] font-semibold uppercase tracking-[0.06em] ${
        STATUS_STYLE[status] ?? "bg-ink/5 text-muted"
      }`}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}

function PersonIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3 w-3" fill="currentColor" aria-hidden>
      <circle cx="12" cy="7" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0z" />
    </svg>
  );
}
function WheelchairIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
      <circle cx="11" cy="4" r="1.6" fill="currentColor" stroke="none" />
      <path d="M11 7v6h6l2 5M11 10h5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 11a6 6 0 1 0 7.5 7.5" strokeLinecap="round" />
    </svg>
  );
}

function NeedIcons({ need }: { need?: Need }) {
  if (!need) return null;
  return (
    <span className="flex items-center gap-2 text-[11px] text-muted">
      <span title="people" className="flex items-center gap-0.5">
        <PersonIcon />
        {need.seats ?? 1}
      </span>
      {!!need.wheelchair && (
        <span title="wheelchair" className="flex items-center gap-0.5">
          <WheelchairIcon />
          {need.wheelchair}
        </span>
      )}
      {!!need.stretcher && <span title="stretcher">stretcher</span>}
      {(need.crew ?? 1) > 1 && <span title="crew">crew {need.crew}</span>}
      {need.lift && <span title="lift">lift</span>}
    </span>
  );
}

function TimeLeft({ min }: { min: number | null }) {
  if (min === null) return <span className="text-[11px] text-muted">no deadline</span>;
  const pct = Math.max(0, Math.min(100, (min / HORIZON_MIN) * 100));
  const urgent = min < 30;
  return (
    <div className="flex flex-col items-end gap-1">
      <span className={`font-mono text-xs font-medium tabular-nums ${urgent ? "text-fire" : "text-ink"}`}>
        {min <= 0 ? "past" : `${Math.round(min)}m`}
      </span>
      <div className="h-1 w-14 overflow-hidden rounded-full bg-line">
        <div
          className={`h-full rounded-full transition-[width] duration-700 ${urgent ? "bg-fire" : "bg-help"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function Stat({ label, value, tone = "text-ink" }: { label: string; value: number; tone?: string }) {
  return (
    <div className="flex min-w-0 flex-col items-center px-2 py-1 min-[1200px]:min-w-[4.5rem] min-[1200px]:px-3">
      <span className={`text-[1.4rem] font-semibold leading-none tracking-[-0.03em] tabular-nums ${tone}`}>
        <AnimatedNumber value={value} />
      </span>
      <span className="mt-1 text-[10px] font-medium uppercase tracking-[0.12em] text-muted">{label}</span>
    </div>
  );
}

function Initials({ name }: { name: string }) {
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-vehicle to-accent-2 text-[11px] font-semibold text-white shadow-sm">
      {name.slice(0, 2).toUpperCase()}
    </span>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer select-none items-center gap-2 whitespace-nowrap text-xs text-muted">
      <input type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="relative h-4 w-7 rounded-full bg-line transition-colors peer-checked:bg-accent peer-focus-visible:ring-2 peer-focus-visible:ring-accent/40 after:absolute after:top-0.5 after:left-0.5 after:h-3 after:w-3 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-3" />
      {label}
    </label>
  );
}

function PanelTitle({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <h2 className="flex items-center justify-between gap-2 px-4 pt-3.5 pb-2.5">
      <span className="flex items-center gap-2 text-[13px] font-semibold tracking-[-0.01em]">{children}</span>
      {aside}
    </h2>
  );
}

export function Console() {
  const connect = useLive((s) => s.connect);
  const resync = useLive((s) => s.resync);
  const households = useLive((s) => s.households);
  const requests = useLive((s) => s.requests);
  const assignments = useLive((s) => s.assignments);
  const vehicles = useLive((s) => s.vehicles);
  const liveZones = useLive((s) => s.zones);
  const liveHazards = useLive((s) => s.hazards);
  // A new seed writes a new fire run (hazards/fire_run); its store flips to "tiger" once Tiger has it.
  const fireRun = liveHazards["fire_run"] as Doc | undefined;
  const fireRunKey = `${String(fireRun?.runId ?? "")}:${String(fireRun?.store ?? "")}`;
  const plan = useLive((s) => s.plan);
  const { theme } = useTheme();
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
  const [fireView, setFireView] = useState<FireView | null>(null);

  const loadStatics = useCallback(async () => {
    try {
      const h = await api.hazards();
      setStatics({ hazards: h.hazards, closures: h.closures, shelters: h.shelters ?? [], zones: h.zones ?? [] });
    } catch {
      /* the map still draws everything live */
    }
  }, []);

  useEffect(() => connect(), [connect]);
  // Driver safety alerts: SOS / man-down from the driver app arrive on /live as vehicle.safety.
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
    <main className="relative h-dvh overflow-hidden bg-bg">
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
        theme={theme}
        fire={fireView}
      />

      <div className="absolute inset-x-3 top-3 z-20">
        <AppHeader floating />
      </div>

      {/* KPI strip: the census at a glance, between the two panels. */}
      <div
        className={`${PANEL} absolute top-[4.6rem] left-1/2 hidden -translate-x-1/2 items-center divide-x divide-line px-1.5 py-1.5 min-[1200px]:flex`}
      >
        <span className="eyebrow hidden px-3 xl:inline-flex">Oak Creek Canyon</span>
        <Stat label="homes" value={counts.homes} />
        <Stat label="reached" value={counts.reached} />
        <Stat label="need ride" value={counts.needRide} tone="text-fire" />
        <Stat label="on a van" value={counts.onVan} tone="text-vehicle" />
        <Stat label="out" value={counts.out} tone="text-out" />
      </div>

      {alert && (
        <div
          role="alert"
          className="absolute top-[9.25rem] left-1/2 z-30 flex -translate-x-1/2 animate-rise items-center gap-3 rounded-full border border-fire/50 bg-panel py-1.5 pr-1.5 pl-4 text-sm font-semibold text-fire shadow-[var(--shadow-float)]"
        >
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inset-0 animate-ping-slow rounded-full bg-fire" />
            <span className="relative h-2.5 w-2.5 rounded-full bg-fire" />
          </span>
          {alert.text}
          <CloseButton onClick={() => setAlert(null)} />
        </div>
      )}

      {note && (
        <div
          role="status"
          className={`${PANEL} absolute top-[9.25rem] left-1/2 flex -translate-x-1/2 animate-rise items-center gap-3 rounded-full! py-1.5 pr-1.5 pl-4 text-sm ${
            alert ? "mt-12" : ""
          }`}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          {note}
          <CloseButton onClick={() => setNote(null)} />
        </div>
      )}

      {panels && (
        <section className={`${PANEL} absolute top-[4.6rem] bottom-[4.25rem] left-3 flex w-[22rem] flex-col`}>
          {/* Narrow screens: the census strip lives here instead of between the panels. */}
          <div className="grid grid-cols-5 border-b border-line py-2 min-[1200px]:hidden">
            <Stat label="homes" value={counts.homes} />
            <Stat label="reached" value={counts.reached} />
            <Stat label="need" value={counts.needRide} tone="text-fire" />
            <Stat label="on van" value={counts.onVan} tone="text-vehicle" />
            <Stat label="out" value={counts.out} tone="text-out" />
          </div>
          <PanelTitle aside={<span className="chip">by deadline</span>}>
            Open requests
            <span className="rounded-full bg-fire/10 px-2 py-px text-[11px] font-semibold text-fire tabular-nums">
              <AnimatedNumber value={openRequests.length} />
            </span>
          </PanelTitle>
          <ul className="scroll-soft flex flex-1 flex-col gap-1.5 overflow-y-auto px-2.5 pb-2.5">
            {openRequests.length === 0 && (
              <li className="m-2 rounded-2xl border border-dashed border-line p-5 text-center text-sm text-muted">
                No ride requests yet.
                <span className="mt-1 block text-xs">Run an instant census from the dock below.</span>
              </li>
            )}
            {openRequests.map((r) => {
              const min = minutesLeft(r.deadlineAt, now);
              const urgent = min !== null && min < 30;
              const active = selectedHome === r.householdId;
              return (
                <li
                  key={r.id}
                  onClick={() => setSelectedHome(String(r.householdId))}
                  className={`group relative flex cursor-pointer items-center justify-between gap-3 overflow-hidden rounded-2xl border py-2.5 pr-3 pl-4 transition-all ${
                    active
                      ? "border-accent/50 bg-accent/[0.07] shadow-sm"
                      : "border-transparent bg-panel-2/70 hover:border-line hover:bg-panel"
                  }`}
                >
                  <span
                    aria-hidden
                    className={`absolute top-2 bottom-2 left-1.5 w-[3px] rounded-full ${urgent ? "bg-fire" : "bg-help/70"}`}
                  />
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-medium">{addressOf(r)}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <NeedIcons need={r.need as Need} />
                      <StatusTag status={String(r.status)} />
                      {!!r.escalation && (
                        <span className="rounded-full bg-fire px-1.5 py-px text-[10px] font-semibold uppercase text-white">
                          {String(r.escalation).replace(/_/g, " ")}
                        </span>
                      )}
                    </div>
                  </div>
                  <TimeLeft min={min} />
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {panels && (
        <aside className="absolute top-[4.6rem] right-3 bottom-[4.25rem] z-10 flex w-[24rem] flex-col gap-3">
          <section className={`${PANEL} flex min-h-0 flex-1 flex-col`}>
            <PanelTitle
              aside={
                plan ? (
                  <span className="font-mono text-[11px] text-muted">
                    v{String(plan.version)} · {String(plan.solveMs)} ms
                  </span>
                ) : undefined
              }
            >
              Plan to approve
              <span className="hidden items-center gap-1 text-[11px] font-normal text-muted sm:flex">
                <span className="kbd">A</span> approve <span className="kbd">J</span>
                <span className="kbd">K</span> move
              </span>
            </PanelTitle>
            <ul className="scroll-soft flex flex-1 flex-col gap-1.5 overflow-y-auto px-2.5 pb-2.5">
              {offers.length === 0 && (
                <li className="m-2 rounded-2xl border border-dashed border-line p-5 text-center text-sm text-muted">
                  Nothing to approve.
                  <span className="mt-1 block text-xs">New offers appear here as the solver plans.</span>
                </li>
              )}
              {offers.map((a, i) => {
                const r = requests[String(a.requestId)];
                const v = vehicles[String(a.vehicleId)];
                const name = String(v?.driverName ?? a.vehicleId);
                return (
                  <li
                    key={a.id}
                    onClick={() => {
                      setSelected(i);
                      if (r) setSelectedHome(String(r.householdId));
                    }}
                    className={`flex cursor-pointer items-center justify-between gap-3 rounded-2xl border px-2.5 py-2 transition-all ${
                      i === selected
                        ? "border-accent/50 bg-accent/[0.07] shadow-sm"
                        : "border-transparent bg-panel-2/70 hover:border-line hover:bg-panel"
                    }`}
                  >
                    <Initials name={name} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-medium">{r ? addressOf(r) : String(a.requestId)}</div>
                      <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted">
                        <span className="font-medium text-vehicle">{name}</span>
                        <span>stop {String(a.stopOrder)}</span>
                        <span className="font-mono tabular-nums">ETA {Math.round(Number(a.etaMinutes ?? 0))}m</span>
                        {!!a.late && <span className="font-semibold text-fire">LATE</span>}
                      </div>
                    </div>
                    {a.status === "proposed" ? (
                      <button
                        className="btn btn-primary min-h-8 px-3.5"
                        disabled={!!busy}
                        onClick={(e) => {
                          e.stopPropagation();
                          approve(a);
                        }}
                      >
                        Approve
                      </button>
                    ) : (
                      <span className="chip border-help/40 text-help">offered</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
          <section className={`${PANEL} scroll-soft max-h-[32%] overflow-y-auto`}>
            <PanelTitle aside={<span className="text-[11px] text-muted">{Object.keys(vehicles).length} vehicles</span>}>
              Fleet
            </PanelTitle>
            <ul className="flex flex-col gap-1 px-2.5 pb-2.5 text-sm">
              {Object.values(vehicles).map((v) => {
                const sos = ["sos", "man_down"].includes(String((v.safety as { state?: string } | undefined)?.state));
                const busyVan = String(v.status) !== "idle";
                return (
                  <li
                    key={v.id}
                    className={`flex items-center justify-between rounded-xl px-2.5 py-1.5 ${sos ? "bg-fire/15" : "hover:bg-panel-2"}`}
                  >
                    <span className="flex items-center gap-2">
                      <span className={`h-1.5 w-1.5 rounded-full ${sos ? "bg-fire" : busyVan ? "bg-vehicle" : "bg-unknown"}`} />
                      <span className="text-[13px] font-medium">{String(v.driverName)}</span>
                      <span className="text-[11px] text-muted">{String(v.kind).replace(/_/g, " ")}</span>
                    </span>
                    <span className="flex items-center gap-2 text-[11px] text-muted">
                      {sos ? <span className="font-semibold text-fire">SOS</span> : String(v.status).replace(/_/g, " ")}
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
        <section
          className={`${PANEL} absolute bottom-[13rem] left-1/2 z-20 w-[27rem] max-w-[calc(100vw-1.5rem)] -translate-x-1/2 animate-rise p-4`}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className="eyebrow" style={{ "--eyebrow-dot": home.role === "needs_ride" ? "var(--color-fire)" : undefined } as React.CSSProperties}>
                {String(home.role).replace(/_/g, " ")}
              </span>
              <div className="mt-1 text-[15px] font-semibold tracking-[-0.01em]">{String(home.address)}</div>
              <div className="text-xs text-muted">
                reach {String(home.reach).replace(/_/g, " ")}
                {home.simulated ? " · simulated" : ""}
              </div>
            </div>
            <CloseButton onClick={() => setSelectedHome(null)} label="Close home details" />
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
            {(["peopleCount", "mobility", "assistance", "canLeave", "hasCar", "pets"] as const).map((k) =>
              record[k] === undefined || record[k] === null ? null : (
                <div key={k} className="rounded-xl bg-panel-2 px-3 py-1.5">
                  <dt className="text-[10px] uppercase tracking-[0.1em] text-muted">{k.replace(/([A-Z])/g, " $1")}</dt>
                  <dd className="text-[13px] font-medium">{String(record[k]).replace(/_/g, " ")}</dd>
                </div>
              ),
            )}
          </dl>
          {homeRequest && (
            <div className="mt-3 flex items-center justify-between border-t border-line pt-3 text-sm">
              <span className="flex items-center gap-2">
                <span className="text-muted">Ride</span>
                <StatusTag status={String(homeRequest.status)} />
                {homeRequest.escalation ? (
                  <span className="text-xs font-semibold text-fire">{String(homeRequest.escalation).replace(/_/g, " ")}</span>
                ) : null}
              </span>
              <TimeLeft min={minutesLeft(homeRequest.deadlineAt, now)} />
            </div>
          )}
        </section>
      )}

      {/* Bottom dock: the map tool + simulation controls. */}
      <div className={`${PANEL} absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full! px-2 py-1.5`}>
        <button
          className={`btn min-h-8 ${drawing ? "border-fire/60 text-fire" : ""}`}
          onClick={() => setDrawing((d) => (d ? null : []))}
          title="Click two points on the road. Esc cancels."
        >
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M4 20 20 4M9 4l11 11" strokeLinecap="round" />
          </svg>
          {drawing ? (drawing.length ? "Click the second point…" : "Click the first point…") : "Close a road"}
        </button>
        <span className="h-5 w-px bg-line" />
        <SimBadge />
        <button
          className="btn min-h-8"
          disabled={!!busy}
          onClick={() =>
            run(
              "Seed",
              async () => {
                const r = await api.seed();
                await resync(); // the old world's homes, requests and offers leave the screen
                return r;
              },
              () => "Seeded 200 homes (SIM)",
            )
          }
        >
          {busy === "Seed" ? "Seeding…" : "Seed"}
        </button>
        <button
          className="btn min-h-8"
          disabled={!!busy}
          onClick={() =>
            run(
              "Census",
              async () => {
                const r = await api.census();
                await resync();
                return r;
              },
              (r) => `${(r as { requests: number }).requests} ride requests (SIM)`,
            )
          }
        >
          {busy === "Census" ? "Calling…" : "Instant census"}
        </button>
        <button
          className="btn min-h-8"
          disabled={!!busy}
          onClick={() =>
            run("Solve", () => api.solve(), (r) => {
              const s = r as { proposals: number; unservable: number; solveMs: number };
              return `${s.proposals} offers, ${s.unservable} unservable · ${s.solveMs} ms`;
            })
          }
        >
          {busy === "Solve" ? "Solving…" : "Solve now"}
        </button>
        <span className="h-5 w-px bg-line" />
        <Toggle
          label="auto-approve"
          checked={!!standIns?.approval}
          onChange={(v) => run("Auto-approve", async () => setStandIns((await api.simControl({ approval: v })).standIns))}
        />
        <Toggle
          label="stand-in drivers"
          checked={!!standIns?.drivers}
          onChange={(v) => run("Stand-in drivers", async () => setStandIns((await api.simControl({ drivers: v })).standIns))}
        />
        <span className="h-5 w-px bg-line" />
        <button className="btn min-h-8" onClick={() => setPanels((v) => !v)}>
          {panels ? "Hide lists" : "Show lists"}
        </button>
      </div>

      {/* Fire replay: above the legend, between the side panels. */}
      <div
        className={`pointer-events-none absolute bottom-[7rem] z-10 flex justify-center ${
          panels ? "right-[25.5rem] left-[23.5rem]" : "right-3 left-3"
        }`}
      >
        <FireReplay runKey={fireRunKey} onFire={setFireView} className="pointer-events-auto w-full max-w-[40rem]" />
      </div>

      {!panels && (
        <div className="absolute bottom-[4.25rem] left-3 z-10">
          <MapLegend className={`${PANEL} rounded-full!`} />
        </div>
      )}
      {panels && (
        <div className="pointer-events-none absolute right-[25.5rem] bottom-[4.25rem] left-[23.5rem] z-10 flex justify-center">
          <MapLegend className={`${PANEL} pointer-events-auto rounded-full!`} />
        </div>
      )}
    </main>
  );
}
