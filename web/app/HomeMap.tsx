"use client";

/**
 * Homes as dots, projected from lon/lat. Lightweight on purpose: the kiosk only needs to pick a house.
 * Red = a person who needs a ride (the only use of red besides fire).
 */
import { useMemo } from "react";

export type Home = {
  id: string;
  address: string;
  role?: string;
  simulated?: boolean;
  reach?: string;
  location?: { coordinates?: [number, number] };
};

const FILL: Record<string, string> = {
  needs_ride: "var(--color-fire)",
  can_help: "var(--color-help)",
  left: "var(--color-out)",
  stay: "var(--color-help)",
};

export function HomeMap({
  homes,
  selected,
  onSelect,
}: {
  homes: Home[];
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const view = useMemo(() => {
    const pts = homes.filter((h) => h.location?.coordinates?.length === 2);
    if (!pts.length) return null;
    const lons = pts.map((h) => h.location!.coordinates![0]);
    const lats = pts.map((h) => h.location!.coordinates![1]);
    const [minLon, maxLon, minLat, maxLat] = [Math.min(...lons), Math.max(...lons), Math.min(...lats), Math.max(...lats)];
    const k = Math.cos(((minLat + maxLat) / 2) * (Math.PI / 180)); // squash longitude to keep shapes true
    const w = Math.max((maxLon - minLon) * k, 1e-4);
    const h = Math.max(maxLat - minLat, 1e-4);
    const pad = 0.06 * Math.max(w, h);
    const x = (lon: number) => (lon - minLon) * k + pad;
    const y = (lat: number) => maxLat - lat + pad;
    return { pts, x, y, vw: w + 2 * pad, vh: h + 2 * pad, r: 0.012 * Math.max(w, h) };
  }, [homes]);

  if (!view) {
    return <p className="m-auto p-6 text-sm text-muted">No homes yet. Seed the scenario first (POST /sim/seed).</p>;
  }
  const { pts, x, y, vw, vh, r } = view;
  return (
    <svg viewBox={`0 0 ${vw} ${vh}`} className="h-full w-full" role="group" aria-label="Homes in the zone">
      {pts.map((h) => {
        const [lon, lat] = h.location!.coordinates!;
        const isSel = h.id === selected;
        return (
          <g key={h.id} onClick={() => onSelect(h.id)} className="cursor-pointer">
            {/* large invisible hit area: easy to tap */}
            <circle cx={x(lon)} cy={y(lat)} r={r * 2.6} fill="transparent" />
            <circle
              cx={x(lon)}
              cy={y(lat)}
              r={isSel ? r * 1.6 : r}
              fill={FILL[h.role ?? ""] ?? "var(--color-unknown)"}
              stroke={isSel ? "var(--color-ink)" : h.simulated === false ? "var(--color-vehicle)" : "none"}
              strokeWidth={r * 0.45}
            >
              <title>{h.address}</title>
            </circle>
          </g>
        );
      })}
    </svg>
  );
}
