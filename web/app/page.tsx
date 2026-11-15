"use client";

/**
 * Kiosk: a visitor picks a house, enters their phone number, and Way Out calls them as that
 * resident. The call is the real agent; the transcript and record fill in here as they talk.
 * The map is the console's real map (MapLibre + deck.gl); the page layout is the kiosk's own.
 */
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { SimBadge } from "@/components/Shell";
import { AppHeader, Arrow } from "@/components/ui";
import { ApiError, api, type HouseholdRecord } from "@/lib/api";
import { useLive } from "@/lib/live";
import { useTheme } from "@/lib/theme";
import { recordRows } from "./calls/format";

const MapView = dynamic(() => import("./console/MapView"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-bg" />,
});

type Doc = { id: string } & Record<string, unknown>;
type Home = { id: string; address?: string; role?: string; simulated?: boolean };

type Turn = { callId: string; speaker: "agent" | "resident"; text: string; at?: string };

function Step({ n, done, active, children }: { n: number; done: boolean; active: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3">
      <span
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold transition-colors ${
          done
            ? "bg-out text-white"
            : active
              ? "bg-accent text-white shadow-[0_0_0_4px_color-mix(in_srgb,var(--color-accent)_18%,transparent)]"
              : "border border-line text-muted"
        }`}
      >
        {done ? (
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden>
            <path d="M5 12.5l4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          n
        )}
      </span>
      <span className={`text-sm ${active ? "font-medium text-ink" : "text-muted"}`}>{children}</span>
    </li>
  );
}

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

  // Static map layers (shelters, zone outlines, closures): same source as the console.
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

  const homes = useMemo(() => Object.values(households) as Doc[], [households]);
  const [selected, setSelected] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [callId, setCallId] = useState<string | null>(null);

  const home = selected ? (households[selected] as unknown as Home & { record?: Record<string, unknown> }) : null;
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
    <main className="flex h-dvh flex-col">
      <AppHeader />
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <section className="relative min-h-64 flex-1 bg-bg">
          <MapView
            households={homes}
            requests={requests}
            vehicles={Object.values(vehicles)}
            assignments={Object.values(assignments).filter((a) => a.status === "accepted")} // runs only
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
            padding={{ top: 30, bottom: 30, left: 30, right: 30 }}
          />
          <div className="pointer-events-none absolute top-4 left-4 flex items-center gap-2">
            <span className="glass flex items-center gap-2 rounded-full! px-3 py-1.5 text-xs text-muted">
              <SimBadge /> Oak Creek Canyon · other homes are simulated
            </span>
          </div>
        </section>

        <aside className="scroll-soft flex w-full flex-col gap-6 overflow-y-auto border-t border-line bg-panel px-6 py-7 md:w-[26rem] md:border-t-0 md:border-l">
          {!callId ? (
            <>
              <div className="flex flex-col gap-3">
                <span className="eyebrow">Try it · real call, real agent</span>
                <h1 className="display text-[2.15rem]">
                  Be the resident.
                  <br />
                  <span className="text-muted">Hear what they hear.</span>
                </h1>
                <p className="text-[15px] leading-relaxed text-muted">
                  Way Out calls every home in the canyon at once. Pick one and take the call yourself.
                </p>
              </div>

              <ol className="flex flex-col gap-3">
                <Step n={1} done={!!selected} active={!selected}>
                  Tap a house on the map
                </Step>
                <Step n={2} done={!!selected && valid} active={!!selected && !valid}>
                  Enter your phone number
                </Step>
                <Step n={3} done={false} active={!!selected && valid}>
                  Answer as the person who lives there
                </Step>
              </ol>

              <div className="flex flex-col gap-3">
                <div className={`rounded-2xl border px-4 py-3 transition-colors ${home ? "border-accent/40 bg-accent/[0.05]" : "border-dashed border-line"}`}>
                  <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">Your house</p>
                  <p className={`mt-0.5 font-medium ${home ? "text-ink" : "text-muted"}`}>{home?.address ?? "None picked yet"}</p>
                </div>
                <label className="flex flex-col gap-1.5 text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
                  Your phone number (US)
                  <span className="flex min-h-12 items-center rounded-2xl border border-line bg-panel-2 px-4 focus-within:border-accent focus-within:ring-4 focus-within:ring-accent/15">
                    <span className="mr-2 font-mono text-sm normal-case tracking-normal text-muted">+1</span>
                    <input
                      inputMode="tel"
                      autoComplete="tel"
                      placeholder="(480) 555-1234"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="min-w-0 flex-1 bg-transparent text-base font-normal normal-case tracking-normal text-ink outline-none placeholder:text-muted/60"
                    />
                  </span>
                </label>
                <button type="button" disabled={!selected || !valid || busy} onClick={callMe} className="btn btn-primary btn-lg w-full">
                  {busy ? "Calling…" : "Call me"}
                  {!busy && <Arrow />}
                </button>
                {error && <p className="rounded-xl bg-help/10 px-3 py-2 text-sm text-help">{error}</p>}
              </div>

              <div className="rounded-2xl bg-panel-2 p-4">
                <span className="eyebrow" style={{ "--eyebrow-dot": "var(--color-sim)" } as React.CSSProperties}>
                  Try playing Rosa, 81
                </span>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  Say it&apos;s just you, then &ldquo;no wait, my husband is here, he&apos;s in a power chair&rdquo;. Then ask
                  &ldquo;is someone coming?&rdquo; It won&apos;t promise a ride until a driver says yes.
                </p>
              </div>

              <p className="flex items-start gap-2 text-xs text-muted">
                <svg viewBox="0 0 24 24" className="mt-px h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <path d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6z" strokeLinejoin="round" />
                </svg>
                Your number is used for this demo call and its callbacks only.
              </p>
            </>
          ) : (
            <>
              <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-night to-night-2 p-5 text-white shadow-[var(--shadow-float)]">
                <span className="eyebrow text-white/60" style={{ "--eyebrow-dot": "var(--color-out)" } as React.CSSProperties}>
                  On the call
                </span>
                <div className="mt-3 flex items-center gap-4">
                  <span className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/10">
                    <span className="absolute inset-0 animate-ping-slow rounded-full bg-white/15" />
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                      <path
                        d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm text-white/70">{turns.length ? "You're talking to Way Out" : "Your phone should ring now"}</p>
                    <p className="truncate text-lg font-semibold tracking-[-0.02em]">{home?.address}</p>
                  </div>
                </div>
              </div>

              <section className="flex flex-col gap-2">
                <span className="eyebrow">Transcript</span>
                <ol className="flex flex-col gap-2">
                  {turns.map((t, i) => (
                    <li
                      key={`${t.at}|${i}`}
                      className={`max-w-[88%] animate-rise rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
                        t.speaker === "agent"
                          ? "self-start rounded-tl-md bg-panel-2"
                          : "self-end rounded-tr-md bg-accent text-white"
                      }`}
                    >
                      {t.text}
                    </li>
                  ))}
                  {!turns.length && (
                    <li className="flex items-center gap-2 text-sm text-muted">
                      <span className="flex gap-1">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted" />
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted [animation-delay:150ms]" />
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted [animation-delay:300ms]" />
                      </span>
                      Waiting for you to pick up
                    </li>
                  )}
                </ol>
              </section>

              <section className="flex flex-col gap-2">
                <span className="eyebrow">What Way Out heard</span>
                <dl className="card flex flex-col px-4 py-2">
                  {recordRows(home?.record as HouseholdRecord | undefined).map((row) => (
                    <div key={row.key} className="flex justify-between gap-3 border-b border-line/70 py-2 text-sm last:border-0">
                      <dt className="text-muted">{row.label}</dt>
                      <dd key={row.value ?? "—"} className={`animate-flash rounded px-1 font-medium ${row.value ? "" : "text-muted/50"}`}>
                        {row.value ?? "—"}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>

              <button
                type="button"
                onClick={() => {
                  setCallId(null);
                  setSelected(null);
                }}
                className="btn btn-lg w-full"
              >
                Done
              </button>
            </>
          )}
        </aside>
      </div>
    </main>
  );
}
