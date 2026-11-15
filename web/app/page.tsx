"use client";

/**
 * Kiosk (D1-08): a judge picks a house, enters their phone number, and Way Out calls them as that
 * resident. The call is the real agent; the transcript and record fill in here as they talk.
 * The map is the console's real map (MapLibre + deck.gl): homes by status, vans, zones, shelters.
 */
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { MapLegend } from "@/components/MapLegend";
import { SimBadge } from "@/components/Shell";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ApiError, api, type HouseholdRecord } from "@/lib/api";
import { useLive } from "@/lib/live";
import { useTheme } from "@/lib/theme";
import { recordRows } from "./calls/format";

const MapView = dynamic(() => import("./console/MapView"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-bg" />,
});

type Doc = { id: string } & Record<string, unknown>;
type Turn = { callId: string; speaker: "agent" | "resident"; text: string; at?: string };
type Home = { id: string; address?: string; role?: string; simulated?: boolean; record?: Record<string, unknown> };

const PANEL = "rounded-2xl border border-line bg-panel/95 shadow-2xl backdrop-blur";

export default function Kiosk() {
  const connect = useLive((s) => s.connect);
  useEffect(() => connect(), [connect]);
  const households = useLive((s) => s.households);
  const requests = useLive((s) => s.requests);
  const vehicles = useLive((s) => s.vehicles);
  const assignments = useLive((s) => s.assignments);
  const liveZones = useLive((s) => s.zones);
  const liveTurns = useLive((s) => s.turns);
  const { theme } = useTheme();

  // Static layers (shelters, zone outlines, closures): same source as the console.
  const [statics, setStatics] = useState<{ closures: Doc[]; shelters: Doc[]; zones: Doc[]; hazards: Doc[] }>({
    closures: [],
    shelters: [],
    zones: [],
    hazards: [],
  });
  useEffect(() => {
    api
      .hazards()
      .then((h) => setStatics({ closures: h.closures, shelters: h.shelters ?? [], zones: h.zones ?? [], hazards: h.hazards }))
      .catch(() => undefined);
  }, []);
  const zones = useMemo(
    () => statics.zones.map((z) => ({ ...z, ...(liveZones[z.id] ? { status: liveZones[z.id].status } : {}) })),
    [statics.zones, liveZones],
  );

  // Phones: the card is a bottom sheet, so frame the canyon in the top half.
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const on = () => setNarrow(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  const homes = useMemo(() => Object.values(households) as Doc[], [households]);
  const [selected, setSelected] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [callId, setCallId] = useState<string | null>(null);

  const home = selected ? (households[selected] as unknown as Home | undefined) : undefined;
  const e164 = `+1${phone.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "")}`;
  const valid = /^\+1\d{10}$/.test(e164);
  const turns = useMemo(
    () => liveTurns.map((e) => e.data as unknown as Turn).filter((t) => t.callId === callId),
    [liveTurns, callId],
  );

  async function callMe() {
    if (!selected || !valid) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.kiosk(selected, e164);
      setCallId(res.callId);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Something went wrong";
      setError(e instanceof ApiError && e.status === 503 ? "The phone line isn't set up yet." : msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="relative h-dvh overflow-hidden">
      <div className="absolute inset-x-0 top-0 bottom-[52dvh] md:bottom-0">
        <MapView
          key={narrow ? "narrow" : "wide"} // re-frame the canyon when the layout changes
          households={homes}
          requests={requests}
          vehicles={Object.values(vehicles)}
          assignments={Object.values(assignments).filter((a) => a.status === "accepted")} // runs only: calmer for visitors
          closures={statics.closures}
          hazards={statics.hazards}
          shelters={statics.shelters}
          zones={zones}
          selectedHouseholdId={selected}
          highlightAssignmentId={null}
          drawing={null}
          onSelectHousehold={(id) => {
            if (!callId) setSelected(id);
          }}
          onMapClick={() => undefined}
          theme={theme}
          padding={
            narrow ? { top: 70, bottom: 20, left: 20, right: 20 } : { top: 90, bottom: 60, left: 40, right: 440 }
          }
        />
      </div>

      <header className={`${PANEL} absolute inset-x-3 top-3 z-10 flex items-center gap-3 px-4 py-2.5`}>
        <span className="font-semibold">Way Out</span>
        <span className="hidden text-muted sm:inline">/ Try it: get a call as a resident</span>
        <span className="ml-auto hidden items-center gap-2 text-xs text-muted lg:flex">
          <SimBadge /> other homes are simulated
        </span>
        <span className="ml-auto lg:ml-0">
          <ThemeToggle labels="wide" />
        </span>
      </header>

      <aside
        className={`${PANEL} absolute inset-x-0 bottom-0 z-10 flex h-[52dvh] flex-col gap-4 overflow-y-auto rounded-b-none p-5 md:inset-x-auto md:top-20 md:right-3 md:bottom-3 md:h-auto md:w-[26rem] md:rounded-b-2xl`}
      >
        {!callId ? (
          <>
            <div>
              <h1 className="text-xl font-semibold">Get a call as a resident</h1>
              <p className="mt-1 text-sm text-muted">The fire is moving. Way Out is calling every home in the zone.</p>
            </div>
            <ol className="flex flex-col gap-1.5 text-sm">
              {["Tap a house on the map.", "Enter your phone number.", "Answer as the person who lives there."].map(
                (t, i) => (
                  <li key={t} className="flex items-center gap-2.5">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-vehicle/15 text-xs font-semibold text-vehicle">
                      {i + 1}
                    </span>
                    {t}
                  </li>
                ),
              )}
            </ol>
            <div className={`rounded-xl border p-3 ${home ? "border-vehicle/50 bg-vehicle/5" : "border-line"}`}>
              <p className="text-xs text-muted">House</p>
              <p className="font-medium">{home?.address ?? "None picked yet: tap a dot on the map"}</p>
            </div>
            <label className="flex flex-col gap-1 text-sm">
              Your phone number (US)
              <input
                inputMode="tel"
                autoComplete="tel"
                placeholder="(480) 555-1234"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="min-h-12 rounded-xl border border-line bg-bg px-3 text-base text-ink outline-none focus:border-vehicle"
              />
            </label>
            <button
              type="button"
              disabled={!selected || !valid || busy}
              onClick={callMe}
              className="min-h-12 rounded-xl bg-vehicle text-base font-semibold text-bg hover:brightness-110 disabled:opacity-40"
            >
              {busy ? "Calling…" : "Call me"}
            </button>
            {error && <p className="text-sm text-help">{error}</p>}
            <p className="text-xs text-muted">
              Your number is used for this demo call and its callbacks only. Try playing Rosa, 81: say it&apos;s just
              you, then &quot;no wait, my husband is here, he&apos;s in a power chair&quot;, and ask &quot;is someone
              coming?&quot;
            </p>
          </>
        ) : (
          <>
            <div>
              <p className="text-sm text-muted">Your phone should ring now. You live at</p>
              <p className="font-medium">{home?.address}</p>
            </div>
            <ol className="flex flex-col gap-2">
              {turns.map((t, i) => (
                <li
                  key={`${t.at}|${i}`}
                  className={`max-w-[90%] rounded-xl px-3 py-2 text-sm ${
                    t.speaker === "agent" ? "bg-ink/5" : "self-end bg-vehicle/15"
                  }`}
                >
                  {t.text}
                </li>
              ))}
              {!turns.length && <li className="text-sm text-muted">Waiting for you to pick up…</li>}
            </ol>
            <dl className="flex flex-col rounded-xl border border-line p-3">
              {recordRows(home?.record as HouseholdRecord | undefined).map((row) => (
                <div key={row.key} className="flex justify-between py-0.5 text-sm">
                  <dt className="text-muted">{row.label}</dt>
                  <dd key={row.value ?? "—"} className="animate-flash rounded px-1">
                    {row.value ?? "—"}
                  </dd>
                </div>
              ))}
            </dl>
            <button
              type="button"
              onClick={() => {
                setCallId(null);
                setSelected(null);
              }}
              className="min-h-12 rounded-xl border border-line hover:bg-ink/5"
            >
              Done
            </button>
          </>
        )}
      </aside>

      <div className="absolute bottom-3 left-3 z-10 hidden md:block">
        <MapLegend className={PANEL} />
      </div>
    </main>
  );
}
