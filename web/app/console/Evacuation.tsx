"use client";

/**
 * Play evacuation: the whole night on the console map, from the warning until the last rider is at a
 * shelter. Data: GET /sim/evacuation (planned with the live planner and travel model, simulated).
 *
 * - Fire: the burned area grows (same detections as the fire replay).
 * - Red dots: households waiting for a ride. At pickup the dot disappears into the vehicle.
 * - Vehicles drive their real runs with a trail (white = responders, orange = neighbors with a seat); the
 *   number next to a vehicle is the seats in use. They drop off at a shelter whenever the next rider
 *   wouldn't fit and end at a shelter outside the area.
 * - Green trails: households driving out on their own.
 * - Counters are counted from the same timelines, so they can't disagree with the map.
 */
import { PathLayer, PolygonLayer, ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import type { Layer } from "@deck.gl/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { create } from "zustand";
import { api, type Evacuation } from "@/lib/api";
import { SimBadge } from "@/components/Shell";

type P3 = [number, number, number];

/** The map reads the evacuation layers from here, so a frame re-renders the map only, not the console. */
export const useEvacLayers = create<{ layers: Layer[] | null; set: (l: Layer[] | null) => void }>((set) => ({
  layers: null,
  set: (layers) => set({ layers }),
}));

const SPEEDS = [2, 5, 10]; // scenario minutes per real second
const TRAIL_MIN = 6; // vehicle trail length
const SELF_TRAIL_MIN = 0.8; // short streaks: thousands of cars at once

function at(path: P3[], m: number): [number, number] {
  if (m <= path[0][2]) return [path[0][0], path[0][1]];
  const last = path[path.length - 1];
  if (m >= last[2]) return [last[0], last[1]];
  let lo = 0;
  let hi = path.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (path[mid][2] <= m) lo = mid;
    else hi = mid;
  }
  const a = path[lo];
  const b = path[hi];
  const f = b[2] > a[2] ? (m - a[2]) / (b[2] - a[2]) : 1;
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
}

/** The stretch of `path` driven between minutes m0 and m1 (corners included). */
function slice(path: P3[], m0: number, m1: number): [number, number][] {
  const out: [number, number][] = [at(path, m0)];
  for (const p of path) if (p[2] > m0 && p[2] < m1) out.push([p[0], p[1]]);
  out.push(at(path, m1));
  return out;
}

function hm(min: number): string {
  const m = Math.max(0, Math.round(min));
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}

export function EvacuationPlayer({ onClose, className = "" }: { onClose: () => void; className?: string }) {
  const [data, setData] = useState<Evacuation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [minute, setMinute] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(SPEEDS[1]);
  const setLayers = useEvacLayers((s) => s.set);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    let off = false;
    api
      .evacuation()
      .then((d) => {
        if (off) return;
        if (d.error) setError(d.error);
        else {
          setData(d);
          setPlaying(true);
        }
      })
      .catch((e: unknown) => !off && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      off = true;
      setLayers(null);
    };
  }, [setLayers]);

  // Paths in a shape the frame loop can use without re-parsing.
  const prep = useMemo(() => {
    if (!data) return null;
    const self = data.selfEvac.map(([lon, lat, leave, flat, fire]) => {
      const path: P3[] = [[lon, lat, leave]];
      for (let i = 0; i + 2 < flat.length; i += 3) path.push([flat[i], flat[i + 1], flat[i + 2]]);
      return { path, leave, arrive: path[path.length - 1][2], fire };
    });
    const vehicles = data.vehicles.map((v) => ({ ...v, neighbor: v.kind === "neighbor" }));
    return { self, vehicles };
  }, [data]);

  // Clock: advance `speed` scenario minutes per real second while playing.
  useEffect(() => {
    if (!playing || !data) return;
    let last = performance.now();
    const step = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setMinute((m) => {
        const next = Math.min(data.endMin, m + dt * speed);
        if (next >= data.endMin) setPlaying(false);
        return next;
      });
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [playing, speed, data]);

  // Counts at this minute, from the same timelines the map draws.
  const counts = useMemo(() => {
    if (!data || !prep) return null;
    const m = minute;
    let waiting = 0,
      inVehicle = 0,
      ridersSafe = 0,
      lateRiders = 0;
    for (const [, , pick, drop, , fire] of data.riders) {
      if (pick == null || pick > m) {
        waiting++;
        if (fire != null && fire <= m) lateRiders++;
      } else if (drop == null || drop > m) inVehicle++;
      else ridersSafe++;
    }
    let driving = 0,
      selfSafe = 0;
    for (const s of prep.self) {
      if (s.arrive <= m) selfSafe++;
      else if (s.leave <= m) driving++;
    }
    const stayedHit = data.stayed.filter((s) => s[2] != null && s[2] <= m).length;
    const canLeave = data.riders.length + prep.self.length;
    return { waiting, inVehicle, ridersSafe, lateRiders, driving, selfSafe, safe: ridersSafe + selfSafe, canLeave, stayedHit };
  }, [data, prep, minute]);

  // Layers for this minute.
  useEffect(() => {
    if (!data || !prep) return;
    const m = minute;
    const frame = data.fire[Math.min(data.fire.length - 1, Math.max(0, Math.floor(m / 5)))];
    const movers: { path: [number, number][] }[] = [];
    const parked: [number, number][] = [];
    for (const s of prep.self) {
      if (m < s.leave) parked.push([s.path[0][0], s.path[0][1]]);
      else if (m < s.arrive) movers.push({ path: slice(s.path, Math.max(s.leave, m - SELF_TRAIL_MIN), m) });
    }
    const waiting = data.riders.filter((r) => r[2] == null || r[2] > m);
    const vehicles = prep.vehicles.map((v) => {
      let load = 0;
      for (const [t, n] of v.loads) if (t <= m) load = n;
      return {
        pos: at(v.path, m),
        trail: slice(v.path, Math.max(v.path[0][2], m - TRAIL_MIN), m),
        load,
        neighbor: v.neighbor,
        name: v.name,
      };
    });
    const layers: Layer[] = [
      new PolygonLayer<{ ring: [number, number][] }>({
        id: "evac-fire",
        data: frame?.ring?.length ? [{ ring: frame.ring }] : [],
        getPolygon: (d) => d.ring,
        getFillColor: [255, 92, 40, 110],
        getLineColor: [255, 140, 60, 230],
        lineWidthMinPixels: 2,
        stroked: true,
        filled: true,
      }),
      new ScatterplotLayer<[number, number]>({
        id: "evac-parked",
        data: parked,
        getPosition: (d) => d,
        getRadius: 1.6,
        radiusUnits: "pixels",
        getFillColor: [148, 163, 184, 140],
      }),
      new ScatterplotLayer<[number, number, number, number, number, number | null][][number]>({
        id: "evac-stayed",
        data: [...data.stayed, ...data.unreached],
        getPosition: (d) => [d[0], d[1]],
        getRadius: 1.8,
        radiusUnits: "pixels",
        getFillColor: (d) => (d[2] != null && d[2] <= m ? [120, 20, 20, 220] : [100, 116, 139, 160]),
        updateTriggers: { getFillColor: Math.floor(m) },
      }),
      new PathLayer<{ path: [number, number][] }>({
        id: "evac-self",
        data: movers,
        getPath: (d) => d.path,
        getColor: [52, 211, 153, 170],
        getWidth: 1.5,
        widthUnits: "pixels",
        capRounded: true,
      }),
      new ScatterplotLayer<Evacuation["riders"][number]>({
        id: "evac-waiting",
        data: waiting,
        getPosition: (d) => [d[0], d[1]],
        getRadius: 3.2,
        radiusUnits: "pixels",
        getFillColor: (d) => (d[5] != null && d[5] <= m ? [127, 29, 29, 255] : [244, 63, 94, 235]),
        getLineColor: [255, 255, 255, 160],
        lineWidthMinPixels: 0.5,
        stroked: true,
        updateTriggers: { getFillColor: Math.floor(m) },
      }),
      new PathLayer<(typeof vehicles)[number]>({
        id: "evac-vehicle-trails",
        data: vehicles,
        getPath: (d) => d.trail,
        getColor: (d) => (d.neighbor ? [251, 146, 60, 230] : [241, 245, 249, 230]),
        getWidth: 3,
        widthUnits: "pixels",
        capRounded: true,
        jointRounded: true,
      }),
      new ScatterplotLayer<(typeof vehicles)[number]>({
        id: "evac-vehicles",
        data: vehicles,
        getPosition: (d) => d.pos,
        getRadius: (d) => (d.load > 0 ? 5.5 : 4),
        radiusUnits: "pixels",
        getFillColor: (d) => (d.neighbor ? [251, 146, 60, 255] : [241, 245, 249, 255]),
        getLineColor: [15, 23, 42, 255],
        lineWidthMinPixels: 1.5,
        stroked: true,
      }),
      new TextLayer<(typeof vehicles)[number]>({
        id: "evac-loads",
        data: vehicles.filter((v) => v.load > 0),
        getPosition: (d) => d.pos,
        getText: (d) => String(d.load),
        getSize: 11,
        getColor: [255, 255, 255, 255],
        getPixelOffset: [10, -10],
        fontWeight: 700,
        outlineWidth: 2,
        outlineColor: [15, 23, 42, 255],
        fontSettings: { sdf: true },
      }),
    ];
    setLayers(layers);
  }, [data, prep, minute, setLayers]);

  const restart = useCallback(() => {
    setMinute(0);
    setPlaying(true);
  }, []);

  const s = data?.summary;
  const done = data && minute >= data.endMin;
  return (
    <section className={`glass rounded-3xl! p-4 ${className}`} aria-label="Evacuation replay">
      <div className="flex items-center gap-3">
        <span className="eyebrow">Evacuation, start to finish</span>
        <SimBadge />
        <span className="ml-auto font-mono text-sm tabular-nums">{data ? `T+${hm(minute)}` : ""}</span>
        <button className="btn min-h-8" onClick={onClose} aria-label="Close the evacuation replay">
          Close
        </button>
      </div>

      {error && <p className="mt-2 text-sm text-fire">{error}</p>}
      {!data && !error && <p className="mt-2 text-sm text-muted">Planning the whole night…</p>}

      {data && counts && (
        <>
          <div className="mt-3 grid grid-cols-5 gap-2 text-center">
            <Big label="safe at a shelter or out" value={counts.safe} of={counts.canLeave} tone="text-out" />
            <Big label="driving out on their own" value={counts.driving} tone="text-out" />
            <Big label="in a vehicle" value={counts.inVehicle} tone="text-vehicle" />
            <Big label="waiting for a ride" value={counts.waiting} tone="text-fire" />
            <Big label="fire reached before pickup" value={counts.lateRiders} tone={counts.lateRiders ? "text-fire" : "text-muted"} />
          </div>
          <div className="mt-3 flex items-center gap-2">
            <button className="btn min-h-9" onClick={() => (done ? restart() : setPlaying((v) => !v))}>
              {done ? "Replay" : playing ? "Pause" : "Play"}
            </button>
            <input
              type="range"
              min={0}
              max={data.endMin}
              step={0.5}
              value={minute}
              onChange={(e) => {
                setPlaying(false);
                setMinute(Number(e.target.value));
              }}
              className="flex-1 accent-[var(--color-accent)]"
              aria-label="Minutes since the warning"
            />
            <div className="flex gap-1" role="radiogroup" aria-label="Speed">
              {SPEEDS.map((x) => (
                <button
                  key={x}
                  role="radio"
                  aria-checked={speed === x}
                  className={`btn min-h-8 px-2! text-xs ${speed === x ? "border-accent! text-accent" : ""}`}
                  onClick={() => setSpeed(x)}
                >
                  {x} min/s
                </button>
              ))}
            </div>
          </div>
          <p className="mt-2 text-xs text-muted">
            {s?.riders} households need a ride and {s?.selfEvac} leave on their own. Riders out before the fire:{" "}
            <b className="text-ink">
              {s?.ridersOutBeforeFire} of {s?.riders}
            </b>
            {s?.ridersNoVehicle ? ` · ${s.ridersNoVehicle} no vehicle can carry` : ""}. Wheelchair and stretcher riders:{" "}
            <b className="text-ink">
              {s?.mobilityOutBeforeFire} of {s?.mobilityRiders}
            </b>
            . {s?.stayed} chose to stay and{" "}
            {s?.unreached} never answered (door-knock list). {s?.vehicles} vehicles; none ever over its seats.
          </p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
            <Key c="bg-[rgb(244,63,94)]" t="waiting for a ride" />
            <Key c="bg-[rgb(241,245,249)]" t="responders (number = seats in use)" />
            <Key c="bg-[rgb(251,146,60)]" t="neighbors with a seat" />
            <Key c="bg-[rgb(52,211,153)]" t="leaving on their own" />
            <Key c="bg-[rgb(255,92,40)]" t="fire (simulated)" />
          </div>
        </>
      )}
    </section>
  );
}

function Big({ label, value, of, tone = "" }: { label: string; value: number; of?: number; tone?: string }) {
  return (
    <div className="rounded-xl border border-line px-2 py-1.5">
      <div className={`font-mono text-xl font-semibold tabular-nums ${tone}`}>
        {value.toLocaleString()}
        {of != null && <span className="text-sm text-muted"> / {of.toLocaleString()}</span>}
      </div>
      <div className="text-[10px] leading-tight text-muted">{label}</div>
    </div>
  );
}

function Key({ c, t }: { c: string; t: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-2 w-2 rounded-full ${c}`} />
      {t}
    </span>
  );
}
