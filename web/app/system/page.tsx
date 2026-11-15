"use client";

/**
 * /system (D1-09): under the hood, for judges. Every number comes from GET /system/metrics:
 * live calls in the database, evals/run.py results, Yash's sim-results.json, the census and the audit log.
 * A missing source shows as "not measured yet", never as a made-up number.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { SimBadge } from "@/components/Shell";
import { api, type EvalSummary, type SystemMetrics } from "@/lib/api";
import { useLive } from "@/lib/live";

const FIELD_LABEL: Record<string, string> = {
  canLeave: "Can leave",
  peopleCount: "People",
  pets: "Pets",
  hasCar: "Car",
  mobility: "Mobility",
  medical: "Medical",
  assistance: "Help out",
};

const ms = (v: number | null | undefined) => (v == null ? "—" : v < 10 ? `${v.toFixed(1)} ms` : `${Math.round(v)} ms`);
const pct = (v: number | null | undefined) => (v == null ? "—" : `${Math.round(v * 100)}%`);

function Card({ title, sim, children }: { title: string; sim?: boolean; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-line bg-panel p-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold tracking-wider text-muted uppercase">
        {title} {sim && <SimBadge />}
      </h2>
      {children}
    </section>
  );
}

function Big({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col">
      <span key={value} className="animate-flash rounded text-2xl font-semibold tabular-nums">
        {value}
      </span>
      <span className="text-xs text-muted">{label}</span>
    </div>
  );
}

function Missing({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted">{children}</p>;
}

/** data/sim-results.json from Yash's impact simulation (D2-09). */
type SimResults = {
  label?: string;
  metric?: string;
  runs?: number;
  bars?: { key: string; label: string; available?: boolean; median?: number; min?: number; max?: number }[];
  headline?: { text?: string };
};

function Dispatch({ d }: { d: SimResults }) {
  const bars = (d.bars ?? []).filter((b) => b.available !== false && typeof b.median === "number");
  return (
    <>
      <ul className="flex flex-col gap-2">
        {bars.map((b) => (
          <li key={b.key} className="flex flex-col gap-1">
            <div className="flex justify-between text-sm">
              <span>{b.label}</span>
              <span className="tabular-nums">
                {Math.round(b.median!)}%
                {b.min != null && b.max != null && (
                  <span className="text-muted">
                    {" "}
                    ({Math.round(b.min)}–{Math.round(b.max)})
                  </span>
                )}
              </span>
            </div>
            <div className="relative h-2 overflow-hidden rounded bg-line">
              {b.min != null && b.max != null && (
                <div className="absolute h-full bg-vehicle/30" style={{ left: `${b.min}%`, width: `${b.max - b.min}%` }} />
              )}
              <div
                className={`absolute h-full ${b.key === "today" ? "bg-help" : "bg-vehicle"}`}
                style={{ width: `${b.median}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
      <p className="text-sm text-muted">
        {d.metric}
        {d.runs ? ` ${d.runs} simulated runs.` : ""} {d.label}
      </p>
    </>
  );
}

export default function SystemPage() {
  const connect = useLive((s) => s.connect);
  useEffect(() => connect(), [connect]);
  const connected = useLive((s) => s.connected);
  const turnCount = useLive((s) => s.turns.length);
  const [m, setM] = useState<SystemMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const last = useRef(0);

  const load = useCallback(async () => {
    last.current = Date.now();
    try {
      setM(await api.systemMetrics());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "API unreachable");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, connected]);

  // New call turns arrive over /live: refresh the numbers at most every 5 s (no polling).
  useEffect(() => {
    if (!turnCount) return;
    const wait = Math.max(0, 5000 - (Date.now() - last.current));
    const t = setTimeout(() => void load(), wait);
    return () => clearTimeout(t);
  }, [turnCount, load]);

  const script: EvalSummary | undefined = m?.evals?.modes?.script?.summary;
  const answers: EvalSummary | undefined = m?.evals?.modes?.answers?.summary;

  return (
    <main className="flex min-h-dvh flex-col">
      <header className="flex items-center gap-3 border-b border-line bg-panel px-4 py-3">
        <span className="font-semibold">Way Out</span>
        <span className="text-muted">/ System</span>
        <span className="ml-auto flex items-center gap-1.5 text-xs text-muted">
          <span className={`h-2 w-2 rounded-full ${connected ? "bg-out" : "bg-unknown"}`} />
          {connected ? "live" : "offline"}
        </span>
      </header>
      {error && <p className="border-b border-help/40 bg-help/10 px-4 py-2 text-sm text-help">Can&apos;t reach the API ({error}).</p>}

      <div className="grid gap-4 p-4 md:grid-cols-2 xl:grid-cols-3">
        <Card title="Honesty">
          {script ? (
            <>
              <div className="flex gap-8">
                <Big
                  value={`${script.honesty.turnsPassed}/${script.honesty.turnsJudged}`}
                  label="agent turns with no promise before a driver accepted"
                />
              </div>
              <p className="text-sm text-muted">
                Ride status comes only from fixed templates. The AI writes at most a 6-word acknowledgment, and the
                code guard dropped {m?.live.acks.blocked ?? 0} of {m?.live.acks.proposed ?? 0} on live calls.
              </p>
              <p className="text-sm text-muted">
                {m?.evals?.judge
                  ? `Claude judge (${m.evals.judge.model}): ${m.evals.judge.impliedPromises} implied promises in ${m.evals.judge.agentLinesJudged} lines.`
                  : "Graded by code checks. The Claude judge hasn't been run."}
              </p>
            </>
          ) : (
            <Missing>Not measured yet. Run evals/run.py.</Missing>
          )}
        </Card>

        <Card title="Voice turn latency">
          <div className="flex gap-8">
            <Big value={ms(m?.live.latencyMs.realPhone.p50)} label={`real phone p50 (${m?.live.latencyMs.realPhone.turns ?? 0} turns)`} />
            <Big value={ms(m?.live.latencyMs.realPhone.p95)} label="real phone p95" />
          </div>
          <div className="flex gap-8">
            <Big value={ms(m?.live.latencyMs.standIns.p50)} label={`stand-ins p50 (${m?.live.latencyMs.standIns.turns ?? 0} turns)`} />
            <Big value={ms(m?.live.latencyMs.standIns.p95)} label="stand-ins p95" />
          </div>
          <p className="text-sm text-muted">
            Measured inside the API, per turn. Interpreter:{" "}
            {Object.entries(m?.live.interpreter ?? {})
              .map(([k, v]) => `${k} ${v}`)
              .join(", ") || "—"}
            {m?.live.fallbacks ? ` · ${m.live.fallbacks} fallbacks` : ""}. Budget: interpreter ≤ 1,000 ms at p50.
          </p>
        </Card>

        <Card title="What the agent heard" sim>
          {script && answers ? (
            <>
              <table className="w-full text-sm">
                <thead className="text-xs text-muted">
                  <tr>
                    <th className="text-left font-normal">Field</th>
                    <th className="text-right font-normal">Own words</th>
                    <th className="text-right font-normal">Direct answers</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {Object.keys(answers.fieldAccuracy).map((f) => (
                    <tr key={f} className="border-t border-line/60">
                      <td className="py-1">{FIELD_LABEL[f] ?? f}</td>
                      <td className="text-right">{pct(script.fieldAccuracy[f])}</td>
                      <td className="text-right">{pct(answers.fieldAccuracy[f])}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-sm text-muted">
                {script.personas} fictional personas (EN + ES) through the real agent. &quot;Own words&quot;: each
                persona says its own lines whatever is asked. &quot;Direct answers&quot;: it answers each question.
                Corrections caught: {answers.correctionsCaught}. Interpreter: {m?.evals?.interpreterConfigured}.
              </p>
            </>
          ) : (
            <Missing>Not measured yet. Run evals/run.py.</Missing>
          )}
        </Card>

        <Card title="Dispatch vs. today" sim>
          {m?.dispatch ? (
            <Dispatch d={m.dispatch as unknown as SimResults} />
          ) : (
            <Missing>Waiting for the impact simulation (data/sim-results.json, D2-09).</Missing>
          )}
        </Card>

        <Card title="Census right now">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            {Object.entries(m?.census.reach ?? {}).map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-muted">{k.replace("_", " ")}</dt>
                <dd className="tabular-nums">{v}</dd>
              </div>
            ))}
            <dt className="text-muted">open ride requests</dt>
            <dd className="tabular-nums">{Object.values(m?.census.openRequests ?? {}).reduce((a, b) => a + b, 0)}</dd>
            <dt className="text-muted">duplicates merged</dt>
            <dd className="tabular-nums">{m?.census.duplicatesMerged ?? 0}</dd>
          </dl>
        </Card>

        <Card title="How a turn works">
          <ol className="flex flex-col gap-1 text-sm text-muted">
            <li>1. Cartesia turns speech into text and sends it to /agent/turn.</li>
            <li>2. Gemini turns the words into record fields (Claude if Gemini is slow).</li>
            <li>3. Code picks the next question. Templates write every ride sentence.</li>
            <li>4. The honesty guard drops any AI words that sound like a promise.</li>
            <li>5. Cartesia speaks the reply. The record and the map update live.</li>
          </ol>
        </Card>

        <Card title="Audit trail">
          <ol className="flex max-h-80 flex-col gap-1 overflow-y-auto text-xs">
            {(m?.audit ?? []).map((a) => (
              <li key={a.id} className="flex gap-2">
                <span className="shrink-0 text-muted tabular-nums">
                  {new Date(a.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </span>
                <span className="text-ink">{a.kind}</span>
                <span className="truncate text-muted">{a.message}</span>
              </li>
            ))}
          </ol>
        </Card>
      </div>
    </main>
  );
}
