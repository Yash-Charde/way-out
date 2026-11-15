"use client";

import { useEffect } from "react";
import { useLive } from "@/lib/live";

export function SimBadge() {
  return (
    <span className="rounded border border-sim/40 px-1.5 py-0.5 text-[10px] font-semibold tracking-wider text-sim">
      SIM
    </span>
  );
}

function ConnectionDot() {
  const connected = useLive((s) => s.connected);
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted">
      <span className={`h-2 w-2 rounded-full ${connected ? "bg-out" : "bg-unknown"}`} />
      {connected ? "live" : "offline"}
    </span>
  );
}

/** Placeholder page shell for screens that aren't built yet. Opens the /live socket. */
export function Shell({
  title,
  note = "Coming soon.",
  children,
}: {
  title: string;
  note?: string;
  children?: React.ReactNode;
}) {
  const connect = useLive((s) => s.connect);
  useEffect(() => connect(), [connect]);

  return (
    <main className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between border-b border-line bg-panel px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="font-semibold">Way Out</span>
          <span className="text-muted">/ {title}</span>
        </div>
        <ConnectionDot />
      </header>
      <section className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
        {children ?? (
          <>
            <h1 className="text-2xl font-semibold">{title}</h1>
            <p className="text-muted">{note}</p>
          </>
        )}
      </section>
    </main>
  );
}
