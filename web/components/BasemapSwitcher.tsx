"use client";

import { BASEMAPS, type Basemap } from "@/lib/basemaps";

/** Segmented "Map · Terrain · Topo · Satellite" control, used on the console map and the house picker. */
export function BasemapSwitcher({
  value,
  onChange,
  className = "",
  vertical = false,
}: {
  value: Basemap;
  onChange: (b: Basemap) => void;
  className?: string;
  vertical?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Map layer"
      className={`glass flex gap-0.5 p-1 ${vertical ? "flex-col items-stretch rounded-2xl!" : "items-center rounded-full!"} ${className}`}
    >
      {BASEMAPS.map((b) => {
        const on = b.id === value;
        return (
          <button
            key={b.id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(b.id)}
            className={`rounded-full px-3 py-1 text-left text-[12px] transition-colors ${
              on ? "bg-accent font-medium text-white shadow-sm" : "text-muted hover:bg-ink/5 hover:text-ink"
            }`}
          >
            {b.label}
          </button>
        );
      })}
    </div>
  );
}
