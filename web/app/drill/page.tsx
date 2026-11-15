import { API_URL } from "@/lib/api";
import { DrillControls, type DrillView } from "./DrillControls";

/**
 * Way Out drill page (D1-07). Plainly labeled; it must never look like a real county site.
 * The "Zone status" line is rendered on the server so TinyFish Fetch reads it as plain text,
 * exactly the way it would read a county Ready/Set/Go page.
 */
export const dynamic = "force-dynamic";

async function load(zone: string): Promise<DrillView | null> {
  try {
    const res = await fetch(`${API_URL}/zones/${encodeURIComponent(zone)}/drill`, { cache: "no-store" });
    return res.ok ? ((await res.json()) as DrillView) : null;
  } catch {
    return null;
  }
}

export default async function Page({ searchParams }: { searchParams: Promise<{ zone?: string }> }) {
  const { zone = "zone_oak_creek_14" } = await searchParams;
  const view = await load(zone);
  const published = (view?.published ?? "ready").toUpperCase();

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-6 px-5 py-8">
      <p className="rounded border-2 border-dashed border-help px-3 py-2 text-center text-sm font-bold tracking-wide text-help">
        WAY OUT DRILL PAGE · NOT AN OFFICIAL COUNTY SITE · FOR TESTING ONLY
      </p>

      <section className="flex flex-col gap-1">
        <p className="text-sm text-muted">Way Out evacuation drill</p>
        <h1 className="text-2xl font-semibold">{view?.name ?? zone}</h1>
        {/* TinyFish parses this exact line. Keep the words "Zone status:" and the status word together. */}
        <p className="mt-3 text-3xl">
          Zone status: <strong className={published === "READY" || published === "CLEAR" ? "" : "text-help"}>{published}</strong>
        </p>
        <p className="text-sm text-muted">
          Ready means be ready. Set means get set to leave. Go means leave now. This page only publishes a drill status.
        </p>
      </section>

      {view ? (
        <DrillControls zoneId={zone} initial={view} />
      ) : (
        <p className="rounded border border-line p-3 text-sm text-muted">
          Can&apos;t load zone <code>{zone}</code> from the API. Seed the world first (<code>POST /sim/seed</code>) and check
          that the API is reachable.
        </p>
      )}
    </main>
  );
}
