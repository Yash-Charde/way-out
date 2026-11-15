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
import { api, type DriverRun, type RunStop } from "@/lib/api";
import { useLive } from "@/lib/live";

type Need = { seats?: number; wheelchair?: number; stretcher?: number; crew?: number; lift?: boolean };
type Gps = { lon: number; lat: number; heading?: number; speedMps?: number };

const ROAD_KMH = 35;
const BIG = "min-h-14 w-full rounded-xl px-4 text-lg font-semibold active:scale-[0.99] disabled:opacity-50";
const PRIMARY = `${BIG} bg-vehicle text-bg`;
const SECONDARY = `${BIG} border border-line bg-panel text-ink`;

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

// ── vehicle picker ───────────────────────────────────────────────────────────
function Picker() {
  const [vehicles, setVehicles] = useState<DriverRun["vehicle"][] | null>(null);
  useEffect(() => {
    api.vehicles().then(setVehicles).catch(() => setVehicles([]));
  }, []);
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-3 p-4">
      <h1 className="text-2xl font-semibold">Way Out · Driver</h1>
      <p className="text-muted">Which vehicle are you driving?</p>
      {vehicles === null && <p className="text-muted">Loading…</p>}
      {vehicles?.length === 0 && <p className="text-muted">No vehicles yet. Seed the scenario from the console.</p>}
      {vehicles?.map((v) => (
        <Link
          key={v.id}
          href={`/driver?v=${encodeURIComponent(v.id)}`}
          className="flex min-h-14 items-center justify-between rounded-xl border border-line bg-panel px-4"
        >
          <span className="text-lg">{String(v.driverName)}</span>
          <span className="flex items-center gap-2 text-sm text-muted">
            {String(v.kind)}
            {!!v.simulated && <SimBadge />}
          </span>
        </Link>
      ))}
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
        <span className="flex-1 rounded-xl bg-fire/20 px-4 py-3 font-semibold text-fire">SOS sent to dispatch</span>
        <button
          className="min-h-12 rounded-xl border border-line px-4"
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
      className={`min-h-12 w-full select-none rounded-xl border-2 border-fire/70 font-semibold text-fire transition ${
        holding ? "bg-fire/30" : "bg-transparent"
      }`}
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      onContextMenu={(e) => e.preventDefault()}
    >
      {holding ? "Keep holding…" : "Hold 2 s for SOS"}
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
      <main className="mx-auto flex min-h-dvh max-w-md items-center justify-center p-4 text-muted">
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
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 p-4 pb-28">
      <header className="flex items-center justify-between">
        <div>
          <div className="text-xl font-semibold">{String(v.driverName)}</div>
          <div className="flex items-center gap-2 text-sm text-muted">
            {String(v.kind)} {!!v.simulated && <SimBadge />}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 text-xs text-muted">
          <span className="flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${connected ? "bg-out" : "bg-unknown"}`} />
            {connected ? "live" : "reconnecting"}
          </span>
          <span className={gpsState === "on" && gpsApplied ? "text-out" : gpsState === "off" ? "" : "text-help"}>
            GPS{" "}
            {gpsState === "denied"
              ? "blocked: allow location"
              : gpsState === "off"
                ? "off"
                : gpsApplied
                  ? "on"
                  : "on · outside the canyon, van stays put (demo)"}
          </span>
        </div>
      </header>

      {error && <div className="rounded-lg border border-help/50 px-3 py-2 text-sm text-help">{error}</div>}

      {changed && (
        <section className="rounded-2xl border border-help/60 bg-panel p-4">
          <h2 className="text-lg font-semibold text-help">Assignment changed</h2>
          <p className="mt-1 text-muted">This pickup moved to another plan. You don&apos;t need to do anything.</p>
          <button className={`${SECONDARY} mt-3`} onClick={() => setChanged(false)}>
            OK
          </button>
        </section>
      )}

      {offer && (
        <section className="rounded-2xl border-2 border-vehicle bg-panel p-4">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-vehicle">New pickup</h2>
            <span className="tabular-nums text-muted">
              {Math.floor(secondsLeft(offer.expiresAt, now) / 60)}:
              {String(secondsLeft(offer.expiresAt, now) % 60).padStart(2, "0")} left
            </span>
          </div>
          <p className="mt-2 text-xl font-semibold">{offer.household.address}</p>
          <p className="mt-1 text-muted">{needText(offer.request.need as Need)}</p>
          <p className="mt-1 text-muted">About {Math.round(Number(offer.etaMinutes ?? 0))} min away</p>
          <div className="mt-4 grid gap-2">
            <button className={PRIMARY} disabled={busy} onClick={() => accept(offer)}>
              Accept
            </button>
            <button className={SECONDARY} disabled={busy} onClick={() => act(() => api.decline(offer.id))}>
              Decline
            </button>
          </div>
        </section>
      )}

      {current ? (
        <section className="rounded-2xl bg-panel p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">
            {current.request.status === "en_route" ? "On the way to" : "Next pickup"}
          </h2>
          <p className="mt-1 text-xl font-semibold">{current.household.address}</p>
          <p className="mt-1 text-muted">{needText(current.request.need as Need)}</p>
          {directions(current.household.location) && (
            <a className="mt-2 inline-block text-vehicle underline" href={directions(current.household.location)!}>
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
              <button className="min-h-12 text-muted underline" onClick={() => setConfirmCancel(true)}>
                I can&apos;t make this pickup
              </button>
            )}
          </div>
        </section>
      ) : (
        !offer &&
        onboard.length === 0 && (
          <section className="rounded-2xl border border-line p-6 text-center text-muted">
            No pickups right now. Keep this screen open; new ones appear here.
          </section>
        )
      )}

      {onboard.length > 0 && !current && (
        <section className="rounded-2xl bg-panel p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">On board: {people} {people === 1 ? "person" : "people"}</h2>
          <p className="mt-1 text-xl font-semibold">{String(shelter?.name ?? "Shelter")}</p>
          {directions(shelter?.location) && (
            <a className="mt-2 inline-block text-vehicle underline" href={directions(shelter?.location)!}>
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
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted">Your run</h2>
          <ol className="flex flex-col gap-1">
            {onboard.length > 0 && current && (
              <li className="rounded-lg border border-line px-3 py-2 text-sm text-out">
                On board: {people} {people === 1 ? "person" : "people"}
              </li>
            )}
            {later.map((s, i) => (
              <li key={s.id} className="rounded-lg border border-line px-3 py-2">
                <div className="text-sm">
                  {i + 2}. {s.household.address}
                </div>
                <div className="text-xs text-muted">{needText(s.request.need as Need)}</div>
              </li>
            ))}
          </ol>
        </section>
      )}

      <footer className="fixed inset-x-0 bottom-0 mx-auto max-w-md bg-bg/95 p-4 backdrop-blur">
        <SosButton vehicleId={vehicleId} gps={gps} />
      </footer>
    </main>
  );
}

export function Driver() {
  const v = useSearchParams().get("v");
  return v ? <DriverScreen vehicleId={v} /> : <Picker />;
}
