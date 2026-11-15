"use client";

import { SimBadge } from "@/components/Shell";
import type { CallSummary } from "@/lib/api";
import { ESCALATION_LABEL, STAGE_LABEL, ago } from "./format";

const LIFE_THREATS = new Set(["medical", "flames"]);

export function CallList({
  calls,
  selected,
  onSelect,
  now,
}: {
  calls: CallSummary[];
  selected: string | null;
  onSelect: (id: string) => void;
  now: number;
}) {
  if (!calls.length) {
    return <p className="p-4 text-sm text-muted">No calls yet. They appear here the moment one connects.</p>;
  }
  return (
    <ul className="divide-y divide-line">
      {calls.map((c) => {
        const needsRide = c.household?.role === "needs_ride";
        const threat = c.escalations.find((e) => LIFE_THREATS.has(e));
        return (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => onSelect(c.id)}
              className={`block w-full px-3 py-2.5 text-left transition-colors hover:bg-ink/5 ${
                selected === c.id ? "bg-ink/[0.07]" : ""
              }`}
            >
              {/* Remount on each new turn so the row flashes once. */}
              <div key={c.updatedAt ?? c.id} className="-mx-3 -my-2.5 animate-flash px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <span
                    title={needsRide ? "Needs a ride" : c.done ? "Call ended" : "In call"}
                    className={`h-2 w-2 shrink-0 rounded-full ${
                      needsRide ? "bg-fire" : c.done ? "bg-unknown" : "bg-vehicle animate-pulse"
                    }`}
                  />
                  <span className="truncate text-sm font-medium">{c.household?.address ?? c.householdId}</span>
                  {c.household?.simulated && <SimBadge />}
                  <span className="ml-auto shrink-0 text-xs tabular-nums text-muted">{ago(c.updatedAt, now)}</span>
                </div>
                <div className="mt-1 flex items-center gap-1.5 text-xs text-muted">
                  <span>{c.done ? "Ended" : (STAGE_LABEL[c.stage ?? ""] ?? c.stage ?? "")}</span>
                  {c.direction !== "outbound" && <span>· {c.direction}</span>}
                  {c.language === "es" && <span>· ES</span>}
                  {threat && (
                    <span className="rounded bg-fire/15 px-1.5 font-semibold text-fire">{ESCALATION_LABEL[threat]}</span>
                  )}
                  {c.escalations
                    .filter((e) => !LIFE_THREATS.has(e))
                    .map((e) => (
                      <span key={e} className="rounded border border-help/40 px-1.5 text-help">
                        {ESCALATION_LABEL[e] ?? e}
                      </span>
                    ))}
                </div>
                {c.lastText && (
                  <p className="mt-1 truncate text-xs text-muted/80">
                    {c.lastSpeaker === "resident" ? "“" : ""}
                    {c.lastText}
                    {c.lastSpeaker === "resident" ? "”" : ""}
                  </p>
                )}
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
