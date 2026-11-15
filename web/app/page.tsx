"use client";

/**
 * Kiosk: a visitor picks a house, enters their phone number, and Way Out calls them as that
 * resident. The call is the real agent; the transcript and record fill in here as they talk.
 */
import { useEffect, useMemo, useState } from "react";
import { SimBadge } from "@/components/Shell";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ApiError, api, type HouseholdRecord } from "@/lib/api";
import { useLive } from "@/lib/live";
import { recordRows } from "./calls/format";
import { HomeMap, type Home } from "./HomeMap";

type Turn = { callId: string; speaker: "agent" | "resident"; text: string; at?: string };

export default function Kiosk() {
  const connect = useLive((s) => s.connect);
  useEffect(() => connect(), [connect]);
  const households = useLive((s) => s.households);
  const liveTurns = useLive((s) => s.turns);

  const homes = useMemo(() => Object.values(households) as unknown as Home[], [households]);
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
      <header className="flex items-center gap-3 border-b border-line bg-panel px-4 py-3">
        <span className="font-semibold">Way Out</span>
        <span className="text-muted">/ Try it: get a call as a resident</span>
        <span className="ml-auto flex items-center gap-2 text-xs text-muted">
          <SimBadge /> other homes are simulated
        </span>
        <ThemeToggle />
      </header>
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <section className="min-h-64 flex-1 bg-bg p-2">
          <HomeMap homes={homes} selected={selected} onSelect={(id) => (callId ? null : setSelected(id))} />
        </section>

        <aside className="flex w-full flex-col gap-4 overflow-y-auto border-t border-line p-4 md:w-96 md:border-t-0 md:border-l">
          {!callId ? (
            <>
              <ol className="flex flex-col gap-1 text-sm text-muted">
                <li>1. Tap a house on the map.</li>
                <li>2. Enter your phone number.</li>
                <li>3. Answer as the person who lives there.</li>
              </ol>
              <div className="rounded border border-line p-3">
                <p className="text-xs text-muted">House</p>
                <p className="font-medium">{home?.address ?? "None picked yet"}</p>
              </div>
              <label className="flex flex-col gap-1 text-sm">
                Your phone number (US)
                <input
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="(480) 555-1234"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="min-h-12 rounded border border-line bg-panel px-3 text-base text-ink"
                />
              </label>
              <button
                type="button"
                disabled={!selected || !valid || busy}
                onClick={callMe}
                className="min-h-12 rounded bg-vehicle text-base font-semibold text-bg hover:brightness-110 disabled:opacity-40"
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
                    className={`rounded px-3 py-2 text-sm ${t.speaker === "agent" ? "bg-panel" : "self-end bg-vehicle/15"}`}
                  >
                    {t.text}
                  </li>
                ))}
                {!turns.length && <li className="text-sm text-muted">Waiting for you to pick up…</li>}
              </ol>
              <dl className="flex flex-col rounded border border-line p-3">
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
                className="min-h-12 rounded border border-line hover:bg-ink/5"
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
