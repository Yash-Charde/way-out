"use client";

/**
 * Driver app. Phone first: one big action at a time, tap targets ≥ 48 px, high contrast.
 *   /driver            → pick a vehicle
 *   /driver?v=vh_luis  → offers (2-min countdown) → Accept → run → On my way → Picked up → At shelter
 * Live GPS → /vehicles/{id}/position. Hold SOS for 2 s → /vehicles/{id}/safety.
 * While this page is open the vehicle belongs to the phone; stand-in drivers leave it alone.
 */
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { SimBadge } from "@/components/Shell";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LiveChip, Ring, Wordmark } from "@/components/ui";
import { api, type DriverRun, type RunStop } from "@/lib/api";
import { useLive } from "@/lib/live";

type Need = { seats?: number; wheelchair?: number; stretcher?: number; crew?: number; lift?: boolean };
type Gps = { lon: number; lat: number; heading?: number; speedMps?: number };

const ROAD_KMH = 35;
const OFFER_SECONDS = 120; // offers count down from 2 minutes
const PRIMARY = "btn btn-primary btn-lg min-h-14 w-full text-[17px]";
const SECONDARY = "btn btn-lg min-h-14 w-full text-[17px]";
const CARD = "card rounded-3xl! p-5";

function needText(n?: Need): string {
  if (!n) return "";
  const parts = [`${n.seats ?? 1} ${(n.seats ?? 1) === 1 ? "person" : "people"}`];
  if (n.wheelchair) parts.push("wheelchair");
  if (n.stretcher) parts.push("stretcher");
  if (n.lift) parts.push("lift");
  if ((n.crew ?? 1) > 1) parts.push(`${n.crew}-person crew`);
  return parts.join(" · ");
}

function directions(loc?: { coordinates: [number, number] }): string | null {
  if (!loc) return null;
  const [lon, lat] = loc.coordinates;
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`;
}

function etaFrom(gps: Gps | null, loc?: { coordinates: [number, number] }, fallback?: number): number {
  if (!gps || !loc) return Math.max(0, Math.round(fallback ?? 5));
  const [lon, lat] = loc.coordinates;
  const r = 6371;
  const dLat = ((lat - gps.lat) * Math.PI) / 180;
  const dLon = ((lon - gps.lon) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos((gps.lat * Math.PI) / 180) * Math.cos((lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  const km = 2 * r * Math.asin(Math.sqrt(a)) * 1.3; // roads aren't straight
  return Math.max(1, Math.round((km / ROAD_KMH) * 60));
}

function secondsLeft(iso: string | undefined, now: number): number {
  if (!iso) return 0;
  const t = new Date(/[zZ]|[+-]\d\d:\d\d$/.test(iso) ? iso : `${iso}Z`).getTime();
  return Math.max(0, Math.round((t - now) / 1000));
}

function Avatar({ name, size = "h-11 w-11 text-sm" }: { name: string; size?: string }) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-vehicle to-accent-2 font-semibold text-white shadow-sm ${size}`}
    >
      {name.slice(0, 2).toUpperCase()}
    </span>
  );
}

function DriverTopBar({ live = true }: { live?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <Wordmark href="/driver" />
      <div className="flex items-center gap-2">
        {live ? <LiveChip /> : <ThemeToggle />}
      </div>
    </div>
  );
}

const STEPS = ["Accepted", "On my way", "Picked up", "Shelter"];
function Stepper({ at }: { at: number }) {
  return (
    <ol className="flex items-center gap-1.5" aria-label="Pickup progress">
      {STEPS.map((s, i) => (
        <li key={s} className="flex flex-1 flex-col gap-1.5">
          <span className={`h-1.5 rounded-full transition-colors ${i <= at ? "bg-accent" : "bg-line"}`} />
          <span className={`text-[11px] ${i === at ? "font-semibold text-ink" : "text-muted"}`}>{s}</span>
        </li>
      ))}
    </ol>
  );
}

// ── vehicle picker ───────────────────────────────────────────────────────────
function Picker() {
  const [vehicles, setVehicles] = useState<DriverRun["vehicle"][] | null>(null);
  useEffect(() => {
    api.vehicles().then(setVehicles).catch(() => setVehicles([]));
  }, []);
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-5 pt-5 pb-10">
      <DriverTopBar live={false} />
      <div className="flex flex-col gap-3">
        <span className="eyebrow">Driver app</span>
        <h1 className="display text-[2.4rem]">
          Who&apos;s driving
          <br />
          <span className="text-muted">tonight?</span>
        </h1>
        <p className="text-muted">Pick your vehicle. Offers show up here the moment dispatch approves a pickup.</p>
      </div>
      {vehicles === null && <p className="text-muted">Loading…</p>}
      {vehicles?.length === 0 && (
        <p className="rounded-3xl border border-dashed border-line p-6 text-center text-muted">
          No vehicles yet. Seed the scenario from the console.
        </p>
      )}
      <ul className="flex flex-col gap-2.5">
        {vehicles?.map((v) => (
          <li key={v.id}>
            <Link
              href={`/driver?v=${encodeURIComponent(v.id)}`}
              className="card flex min-h-16 items-center gap-3 rounded-2xl! px-4 py-3 transition-colors hover:border-line-strong"
            >
              <Avatar name={String(v.driverName)} />
              <span className="flex-1">
                <span className="block text-[17px] font-semibold tracking-[-0.01em]">{String(v.driverName)}</span>
                <span className="block text-sm text-muted">{String(v.kind).replace(/_/g, " ")}</span>
              </span>
              {!!v.simulated && <SimBadge />}
              <svg viewBox="0 0 24 24" className="h-4 w-4 text-muted" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}

// ── SOS: hold 2 s ────────────────────────────────────────────────────────────
function SosButton({ vehicleId, gps }: { vehicleId: string; gps: Gps | null }) {
  const [holding, setHolding] = useState(false);
  const [sent, setSent] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const start = () => {
    setHolding(true);
    timer.current = setTimeout(async () => {
      setHolding(false);
      try {
        await api.safety(vehicleId, { state: "sos", lon: gps?.lon, lat: gps?.lat });
        setSent(true);
        navigator.vibrate?.(300);
      } catch {
        /* the console still sees the last position; retry by holding again */
      }
    }, 2000);
  };
  const stop = () => {
    setHolding(false);
    if (timer.current) clearTimeout(timer.current);
  };

  if (sent) {
    return (
      <div className="flex items-center gap-2">
        <span className="flex min-h-14 flex-1 items-center gap-2.5 rounded-full bg-fire px-5 font-semibold text-white">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inset-0 animate-ping-slow rounded-full bg-white" />
            <span className="relative h-2.5 w-2.5 rounded-full bg-white" />
          </span>
          SOS sent to dispatch
        </span>
        <button
          className="btn btn-lg min-h-14"
          onClick={async () => {
            await api.safety(vehicleId, { state: "ok" }).catch(() => undefined);
            setSent(false);
          }}
        >
          I&apos;m OK
        </button>
      </div>
    );
  }
  return (
    <button
      className="relative min-h-14 w-full touch-none overflow-hidden rounded-full border-2 border-fire/70 bg-panel font-semibold text-fire select-none"
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      onContextMenu={(e) => e.preventDefault()}
    >
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 bg-fire/20"
        style={{ width: holding ? "100%" : "0%", transition: holding ? "width 2s linear" : "width 0.2s ease-out" }}
      />
      <span className="relative">{holding ? "Keep holding…" : "Hold 2 s for SOS"}</span>
    </button>
  );
}

// ── the driver's screen ──────────────────────────────────────────────────────
function DriverScreen({ vehicleId }: { vehicleId: string }) {
  const connect = useLive((s) => s.connect);
  const connected = useLive((s) => s.connected);
  const assignments = useLive((s) => s.assignments);
  const requests = useLive((s) => s.requests);

  const [data, setData] = useState<DriverRun | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [gps, setGps] = useState<Gps | null>(null);
  const [gpsState, setGpsState] = useState<"off" | "on" | "denied">("off");
  const [gpsApplied, setGpsApplied] = useState(true); // false: phone is outside the scenario area (demo)
  const [changed, setChanged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const lastSent = useRef(0);

  useEffect(() => connect(), [connect]);

  const refresh = useCallback(async () => {
    try {
      setData(await api.run(vehicleId));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [vehicleId]);

  // Refetch on any live change (debounced); poll only while the socket is down.
  useEffect(() => {
    const t = setTimeout(refresh, 250);
    return () => clearTimeout(t);
  }, [refresh, assignments, requests]);
  useEffect(() => {
    if (connected) return;
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, [connected, refresh]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Presence: this phone owns the vehicle while the page is open.
  useEffect(() => {
    const ping = () => api.presence(vehicleId).catch(() => undefined);
    void ping();
    const t = setInterval(ping, 20_000);
    return () => clearInterval(t);
  }, [vehicleId]);

  // Live GPS, at most one post every 2 s.
  useEffect(() => {
    if (!("geolocation" in navigator)) return;
    const id = navigator.geolocation.watchPosition(
      (p) => {
        const g = {
          lon: p.coords.longitude,
          lat: p.coords.latitude,
          heading: p.coords.heading ?? undefined,
          speedMps: p.coords.speed ?? undefined,
        };
        setGps(g);
        setGpsState("on");
        if (Date.now() - lastSent.current > 2000) {
          lastSent.current = Date.now();
          void api
            .position(vehicleId, { ...g, heading: g.heading ?? 0, speedMps: g.speedMps ?? 0 })
            .then((r) => setGpsApplied((r as { applied?: boolean }).applied !== false))
            .catch(() => undefined);
        }
      },
      (err) => setGpsState(err.code === err.PERMISSION_DENIED ? "denied" : "off"),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [vehicleId]);

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const accept = (a: RunStop) =>
    act(async () => {
      const r = await api.accept(a.id);
      if (r.result === "changed") setChanged(true);
      else navigator.vibrate?.(80);
    });

  if (!data) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md items-center justify-center p-5 text-center text-muted">
        {error ? `Can't load this vehicle: ${error}` : "Loading…"}
      </main>
    );
  }

  const v = data.vehicle;
  const offer = data.offers.find((o) => secondsLeft(o.expiresAt, now) > 0);
  const current = data.run.find((s) => s.request.status === "driver_accepted" || s.request.status === "en_route");
  const later = data.run.filter((s) => s !== current && s.request.status !== "arrived");
  const onboard = data.run.filter((s) => s.request.status === "arrived");
  const people = onboard.reduce((n, s) => n + Number((s.request.need as Need | undefined)?.seats ?? 1), 0);
  const shelter = data.shelters[0] as (RunStop["household"] & { name?: string }) | undefined;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 px-5 pt-5 pb-32">
      <DriverTopBar />
      <header className="flex items-center gap-3">
        <Avatar name={String(v.driverName)} size="h-12 w-12 text-base" />
        <div className="min-w-0 flex-1">
          <div className="text-xl font-semibold tracking-[-0.02em]">{String(v.driverName)}</div>
          <div className="flex items-center gap-2 text-sm text-muted">
            {String(v.kind).replace(/_/g, " ")} {!!v.simulated && <SimBadge />}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 text-xs text-muted">
          <span
            className={`chip ${gpsState === "on" && gpsApplied ? "border-out/40 text-out" : gpsState === "off" ? "" : "border-help/40 text-help"}`}
          >
            GPS{" "}
            {gpsState === "denied"
              ? "blocked: allow location"
              : gpsState === "off"
                ? "off"
                : gpsApplied
                  ? "on"
                  : "on · outside canyon (demo)"}
          </span>
          {!connected && <span className="text-help">reconnecting</span>}
        </div>
      </header>

      {error && <div className="rounded-2xl bg-help/10 px-4 py-3 text-sm text-help">{error}</div>}

      {changed && (
        <section className={`${CARD} animate-rise border-help/50`}>
          <span className="eyebrow" style={{ "--eyebrow-dot": "var(--color-help)" } as React.CSSProperties}>
            Heads up
          </span>
          <h2 className="mt-2 text-lg font-semibold">Assignment changed</h2>
          <p className="mt-1 text-muted">This pickup moved to another plan. You don&apos;t need to do anything.</p>
          <button className={`${SECONDARY} mt-3`} onClick={() => setChanged(false)}>
            OK
          </button>
        </section>
      )}

      {offer && (
        <section className="animate-rise overflow-hidden rounded-[1.75rem] bg-gradient-to-br from-night to-night-2 p-5 text-white shadow-[var(--shadow-float)]">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <span className="eyebrow text-white/60" style={{ "--eyebrow-dot": "#8fa6ff" } as React.CSSProperties}>
                New pickup
              </span>
              <p className="mt-2 text-[1.45rem] leading-tight font-semibold tracking-[-0.02em]">{offer.household.address}</p>
              <p className="mt-2 text-white/75">{needText(offer.request.need as Need)}</p>
              <p className="mt-0.5 text-white/75">About {Math.round(Number(offer.etaMinutes ?? 0))} min away</p>
            </div>
            <Ring value={secondsLeft(offer.expiresAt, now)} max={OFFER_SECONDS} size={84} stroke={7} tone="#8fa6ff">
              <span className="font-mono text-base font-semibold tabular-nums">
                {Math.floor(secondsLeft(offer.expiresAt, now) / 60)}:{String(secondsLeft(offer.expiresAt, now) % 60).padStart(2, "0")}
              </span>
              <span className="text-[10px] text-white/60">left</span>
            </Ring>
          </div>
          <div className="mt-5 grid gap-2.5">
            <button className={PRIMARY} disabled={busy} onClick={() => accept(offer)}>
              Accept
            </button>
            <button
              className="btn btn-lg min-h-14 w-full border-white/20 bg-white/10 text-[17px] text-white hover:bg-white/15"
              disabled={busy}
              onClick={() => act(() => api.decline(offer.id))}
            >
              Decline
            </button>
          </div>
        </section>
      )}

      {current ? (
        <section className={CARD}>
          <Stepper at={current.request.status === "en_route" ? 1 : 0} />
          <span className="eyebrow mt-5">{current.request.status === "en_route" ? "On the way to" : "Next pickup"}</span>
          <p className="mt-1.5 text-[1.45rem] leading-tight font-semibold tracking-[-0.02em]">{current.household.address}</p>
          <p className="mt-1.5 text-muted">{needText(current.request.need as Need)}</p>
          {directions(current.household.location) && (
            <a className="btn mt-3 min-h-11" href={directions(current.household.location)!}>
              Directions
            </a>
          )}
          <div className="mt-4 grid gap-2">
            {current.request.status === "driver_accepted" ? (
              <button
                className={PRIMARY}
                disabled={busy}
                onClick={() =>
                  act(() =>
                    api.progress(
                      current.id,
                      "en_route",
                      etaFrom(gpsApplied ? gps : null, current.household.location, current.etaMinutes),
                    ),
                  )
                }
              >
                On my way
              </button>
            ) : (
              <button className={PRIMARY} disabled={busy} onClick={() => act(() => api.progress(current.id, "arrived"))}>
                Picked up
              </button>
            )}
            {confirmCancel ? (
              <div className="grid grid-cols-2 gap-2">
                <button
                  className={`${SECONDARY} border-help text-help`}
                  disabled={busy}
                  onClick={() =>
                    act(async () => {
                      await api.cancel(current.id);
                      setConfirmCancel(false);
                    })
                  }
                >
                  Yes, I can&apos;t
                </button>
                <button className={SECONDARY} onClick={() => setConfirmCancel(false)}>
                  Keep it
                </button>
              </div>
            ) : (
              <button className="min-h-12 text-sm text-muted underline-offset-4 hover:underline" onClick={() => setConfirmCancel(true)}>
                I can&apos;t make this pickup
              </button>
            )}
          </div>
        </section>
      ) : (
        !offer &&
        onboard.length === 0 && (
          <section className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-line px-6 py-10 text-center">
            <span className="relative flex h-3 w-3">
              <span className="absolute inset-0 animate-ping-slow rounded-full bg-accent" />
              <span className="relative h-3 w-3 rounded-full bg-accent" />
            </span>
            <p className="font-medium">Standing by</p>
            <p className="text-sm text-muted">No pickups right now. Keep this screen open; new ones appear here.</p>
          </section>
        )
      )}

      {onboard.length > 0 && !current && (
        <section className={CARD}>
          <Stepper at={2} />
          <span className="eyebrow mt-5" style={{ "--eyebrow-dot": "var(--color-out)" } as React.CSSProperties}>
            On board: {people} {people === 1 ? "person" : "people"}
          </span>
          <p className="mt-1.5 text-[1.45rem] leading-tight font-semibold tracking-[-0.02em]">{String(shelter?.name ?? "Shelter")}</p>
          {directions(shelter?.location) && (
            <a className="btn mt-3 min-h-11" href={directions(shelter?.location)!}>
              Directions
            </a>
          )}
          <button
            className={`${PRIMARY} mt-4`}
            disabled={busy}
            onClick={() =>
              act(async () => {
                for (const s of onboard) await api.progress(s.id, "completed");
              })
            }
          >
            Dropped at shelter
          </button>
        </section>
      )}

      {(later.length > 0 || (onboard.length > 0 && current)) && (
        <section>
          <h2 className="eyebrow mb-3">Your run</h2>
          <ol className="flex flex-col gap-2">
            {onboard.length > 0 && current && (
              <li className="rounded-2xl bg-out/10 px-4 py-3 text-sm font-medium text-out">
                On board: {people} {people === 1 ? "person" : "people"}
              </li>
            )}
            {later.map((s, i) => (
              <li key={s.id} className="flex items-start gap-3 rounded-2xl border border-line bg-panel px-4 py-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-panel-2 font-mono text-[11px] font-semibold text-muted">
                  {i + 2}
                </span>
                <div className="min-w-0">
                <div className="text-sm font-medium">{s.household.address}</div>
                <div className="text-xs text-muted">{needText(s.request.need as Need)}</div>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      <footer className="fixed inset-x-0 bottom-0 mx-auto max-w-md border-t border-line bg-bg/85 px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-xl">
        <SosButton vehicleId={vehicleId} gps={gps} />
      </footer>
    </main>
  );
}

export function Driver() {
  const v = useSearchParams().get("v");
  return v ? <DriverScreen vehicleId={v} /> : <Picker />;
}
