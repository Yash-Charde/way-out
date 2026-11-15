"use client";

/**
 * Console map: MapLibre basemap + deck.gl layers.
 * Red = fire or a person who needs help, nothing else. Blue = our vehicles and their routes.
 * If the basemap can't load (venue Wi-Fi), the map falls back to a plain dark background: every
 * deck.gl layer still draws.
 */
import "maplibre-gl/dist/maplibre-gl.css";

import { MapboxOverlay, type MapboxOverlayProps } from "@deck.gl/mapbox";
import { PathLayer, PolygonLayer, ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import type { PickingInfo } from "@deck.gl/core";
import { setWorkerUrl, type StyleSpecification } from "maplibre-gl";
import type { Theme } from "@/lib/theme";
import { useMemo, useState } from "react";
import MapGL, { useControl, type MapLayerMouseEvent } from "react-map-gl/maplibre";

type Doc = { id: string } & Record<string, unknown>;
type LonLat = [number, number];
type RGBA = [number, number, number, number];

export const COLORS: Record<string, RGBA> = {
  fire: [255, 77, 61, 255],
  help: [245, 165, 36, 255],
  out: [34, 197, 94, 255],
  unknown: [107, 114, 128, 255],
  vehicle: [77, 163, 255, 255],
  shelter: [167, 139, 250, 255],
  ink: [230, 233, 239, 255],
};

const ROLE_COLOR: Record<string, RGBA> = {
  needs_ride: COLORS.fire,
  can_help: COLORS.help,
  left: COLORS.out,
  stay: [190, 120, 110, 255],
  unknown: COLORS.unknown,
};

// OpenFreeMap's Dark Matter fork: free, no API key (CARTO's basemaps now need one). Override with
// NEXT_PUBLIC_MAP_STYLE, e.g. a CARTO style URL with ?key=… if we get a key.
const STYLE_URL: Record<Theme, string> = {
  dark: process.env.NEXT_PUBLIC_MAP_STYLE || "https://tiles.openfreemap.org/styles/dark",
  light: process.env.NEXT_PUBLIC_MAP_STYLE_LIGHT || "https://tiles.openfreemap.org/styles/positron",
};
const fallbackStyle = (theme: Theme): StyleSpecification => ({
  version: 8,
  sources: {},
  layers: [{ id: "bg", type: "background", paint: { "background-color": theme === "dark" ? "#0b0e13" : "#eef0f3" } }],
});
// Halo around labels/lines (the page background) and label ink, per theme.
const HALO: Record<Theme, RGBA> = { dark: [11, 14, 19, 255], light: [255, 255, 255, 255] };
const INK: Record<Theme, RGBA> = { dark: [230, 233, 239, 255], light: [18, 22, 29, 255] };
const SHELTER_INK: Record<Theme, RGBA> = { dark: [167, 139, 250, 255], light: [109, 40, 217, 255] };
const FONT = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

// Served from /public by scripts/copy-maplibre-worker.mjs (the bundler can't resolve MapLibre's own URL).
setWorkerUrl("/maplibre-gl-worker.mjs");

// The canyon tract + the Red Rock HS shelter, framed in the gap between the console's side panels.
export type Padding = { top: number; bottom: number; left: number; right: number };
export const CANYON_BOUNDS: [[number, number], [number, number]] = [
  [-111.835, 34.845],
  [-111.715, 35.02],
];
// The console's default: the canyon in the gap between its two side panels.
const CONSOLE_PADDING: Padding = { top: 100, bottom: 70, left: 390, right: 420 };

function lonlat(doc: unknown): LonLat | null {
  const c = (doc as { location?: { coordinates?: number[] } } | undefined)?.location?.coordinates;
  return c && c.length >= 2 ? [Number(c[0]), Number(c[1])] : null;
}

function DeckOverlay(props: MapboxOverlayProps) {
  const overlay = useControl<MapboxOverlay>(() => new MapboxOverlay(props));
  overlay.setProps(props);
  return null;
}

export type MapViewProps = {
  households: Doc[];
  requests: Record<string, Doc>;
  vehicles: Doc[];
  assignments: Doc[];
  closures: Doc[];
  hazards: Doc[];
  shelters: Doc[];
  zones: Doc[];
  selectedHouseholdId: string | null;
  highlightAssignmentId: string | null;
  drawing: LonLat[] | null; // road-closure tool: points so far (null = tool off)
  onSelectHousehold: (id: string | null) => void;
  onMapClick: (p: LonLat) => void;
  theme?: Theme;
  padding?: Padding; // keeps the canyon clear of the page's panels
};

export default function MapView(p: MapViewProps) {
  const theme: Theme = p.theme ?? "dark";
  const [failed, setFailed] = useState(false); // basemap unreachable: plain background, layers still draw
  const [loaded, setLoaded] = useState(false);
  const style = failed ? fallbackStyle(theme) : STYLE_URL[theme];
  const halo = HALO[theme];
  const ink = INK[theme];

  const requestByHousehold = useMemo(() => {
    const m: Record<string, Doc> = {};
    for (const r of Object.values(p.requests)) if (r.status !== "closed") m[String(r.householdId)] = r;
    return m;
  }, [p.requests]);

  const homeById = useMemo(() => Object.fromEntries(p.households.map((h) => [h.id, h])), [p.households]);
  const vehicleById = useMemo(() => Object.fromEntries(p.vehicles.map((v) => [v.id, v])), [p.vehicles]);

  // Lines: proposed/offered = vehicle → home; accepted = the vehicle's run in stop order.
  const lines = useMemo(() => {
    const out: { path: LonLat[]; status: string; id: string }[] = [];
    const runs: Record<string, Doc[]> = {};
    for (const a of p.assignments) {
      const req = p.requests[String(a.requestId)];
      const home = req ? lonlat(homeById[String(req.householdId)]) : null;
      const veh = lonlat(vehicleById[String(a.vehicleId)]);
      if (!home || !veh) continue;
      if (a.status === "accepted") (runs[String(a.vehicleId)] ??= []).push(a);
      else if (a.status === "proposed" || a.status === "offered") out.push({ path: [veh, home], status: String(a.status), id: a.id });
    }
    for (const [vid, stops] of Object.entries(runs)) {
      const veh = lonlat(vehicleById[vid]);
      const pts = stops
        .filter((a) => {
          const st = p.requests[String(a.requestId)]?.status;
          return st === "driver_accepted" || st === "en_route";
        })
        .sort((a, b) => Number(a.stopOrder ?? 0) - Number(b.stopOrder ?? 0))
        .map((a) => lonlat(homeById[String(p.requests[String(a.requestId)]?.householdId)]))
        .filter((x): x is LonLat => !!x);
      if (veh && pts.length) out.push({ path: [veh, ...pts], status: "accepted", id: `run-${vid}` });
    }
    return out;
  }, [p.assignments, p.requests, homeById, vehicleById]);

  const layers = [
    new PolygonLayer<Doc>({
      id: "zones",
      data: p.zones.filter((z) => (z.polygon as { coordinates?: unknown })?.coordinates),
      getPolygon: (z) => (z.polygon as { coordinates: LonLat[][] }).coordinates[0],
      getFillColor: (z) =>
        z.status === "go" ? [255, 77, 61, 28] : z.status === "set" ? [245, 165, 36, 22] : ([...ink.slice(0, 3), 10] as RGBA),
      getLineColor: (z) =>
        z.status === "go" ? COLORS.fire : z.status === "set" ? COLORS.help : ([...ink.slice(0, 3), 110] as RGBA),
      getLineWidth: 2,
      lineWidthUnits: "pixels",
      updateTriggers: {
        getFillColor: [theme, p.zones.map((z) => z.status)],
        getLineColor: [theme, p.zones.map((z) => z.status)],
      },
    }),
    new PolygonLayer<Doc>({
      id: "fire",
      data: p.hazards.filter((h) => (h.geometry as { type?: string })?.type === "Polygon"),
      getPolygon: (h) => (h.geometry as { coordinates: LonLat[][] }).coordinates[0],
      getFillColor: [255, 77, 61, 70],
      getLineColor: COLORS.fire,
      getLineWidth: 2,
      lineWidthUnits: "pixels",
    }),
    new ScatterplotLayer<Doc>({
      id: "fire-points",
      data: p.hazards.filter((h) => (h.geometry as { type?: string })?.type === "Point"),
      getPosition: (h) => (h.geometry as { coordinates: LonLat }).coordinates,
      getRadius: 6,
      radiusUnits: "pixels",
      getFillColor: COLORS.fire,
    }),
    new PathLayer<Doc>({
      id: "closures-halo",
      data: p.closures,
      getPath: (c) => (c.geometry as { coordinates: LonLat[] }).coordinates,
      getColor: halo,
      getWidth: 13,
      widthUnits: "pixels",
      capRounded: true,
    }),
    new PathLayer<Doc>({
      id: "closures",
      data: p.closures,
      getPath: (c) => (c.geometry as { coordinates: LonLat[] }).coordinates,
      getColor: COLORS.fire,
      getWidth: 8,
      widthUnits: "pixels",
      capRounded: true,
    }),
    new PathLayer<{ path: LonLat[]; status: string; id: string }>({
      id: "routes",
      data: lines,
      getPath: (l) => l.path,
      getColor: (l) =>
        l.id === p.highlightAssignmentId
          ? ink
          : l.status === "accepted"
            ? COLORS.vehicle
            : l.status === "offered"
              ? [77, 163, 255, 170]
              : [77, 163, 255, 90],
      getWidth: (l) => (l.id === p.highlightAssignmentId ? 4 : l.status === "accepted" ? 3 : 1.5),
      widthUnits: "pixels",
      updateTriggers: { getColor: [theme, p.highlightAssignmentId], getWidth: p.highlightAssignmentId },
    }),
    new ScatterplotLayer<Doc>({
      id: "homes",
      data: p.households.filter((h) => lonlat(h)),
      getPosition: (h) => lonlat(h)!,
      getRadius: (h) => (h.role === "needs_ride" ? 6 : 3.5),
      radiusUnits: "pixels",
      getFillColor: (h) => ROLE_COLOR[String(h.role)] ?? COLORS.unknown,
      stroked: true,
      getLineColor: (h) =>
        h.id === p.selectedHouseholdId
          ? ink
          : requestByHousehold[h.id]?.escalation
            ? ink
            : h.simulated === false
              ? COLORS.vehicle // a real household (a kiosk visitor)
              : halo,
      getLineWidth: (h) =>
        h.id === p.selectedHouseholdId ? 3 : requestByHousehold[h.id]?.escalation || h.simulated === false ? 2 : 1,
      lineWidthUnits: "pixels",
      pickable: true,
      updateTriggers: {
        getFillColor: p.households.map((h) => h.role),
        getRadius: p.households.map((h) => h.role),
        getLineColor: [theme, p.selectedHouseholdId, requestByHousehold, p.households.map((h) => h.simulated)],
        getLineWidth: [p.selectedHouseholdId, requestByHousehold, p.households.map((h) => h.simulated)],
      },
    }),
    new ScatterplotLayer<Doc>({
      id: "shelters",
      data: p.shelters.filter((s) => lonlat(s)),
      getPosition: (s) => lonlat(s)!,
      getRadius: 8,
      radiusUnits: "pixels",
      getFillColor: COLORS.shelter,
      stroked: true,
      getLineColor: ink,
      getLineWidth: 1.5,
      lineWidthUnits: "pixels",
    }),
    new ScatterplotLayer<Doc>({
      id: "vehicles",
      data: p.vehicles.filter((v) => lonlat(v)),
      getPosition: (v) => lonlat(v)!,
      getRadius: 8,
      radiusUnits: "pixels",
      getFillColor: (v) =>
        (v.safety as { state?: string } | undefined)?.state === "sos" ||
        (v.safety as { state?: string } | undefined)?.state === "man_down"
          ? COLORS.fire
          : COLORS.vehicle,
      stroked: true,
      getLineColor: (v) => (v.status === "offered" ? COLORS.help : ink),
      getLineWidth: 2,
      lineWidthUnits: "pixels",
      pickable: true,
      transitions: { getPosition: 900 },
      updateTriggers: {
        getFillColor: p.vehicles.map((v) => (v.safety as { state?: string } | undefined)?.state),
        getLineColor: [theme, p.vehicles.map((v) => v.status)],
      },
    }),
    new TextLayer<Doc>({
      id: "vehicle-names",
      data: p.vehicles.filter((v) => lonlat(v)),
      getPosition: (v) => lonlat(v)!,
      getText: (v) => String(v.driverName ?? v.id),
      getSize: 12,
      getColor: ink,
      getPixelOffset: [0, -18],
      fontWeight: 600,
      outlineWidth: 3,
      outlineColor: halo,
      fontFamily: FONT,
      fontSettings: { sdf: true },
      transitions: { getPosition: 900 },
    }),
    new TextLayer<Doc>({
      id: "closure-labels",
      data: p.closures,
      getPosition: (c) => {
        const pts = (c.geometry as { coordinates: LonLat[] }).coordinates;
        return pts[Math.floor(pts.length / 2)] ?? pts[0];
      },
      getText: () => "CLOSED",
      getSize: 11,
      getColor: COLORS.fire,
      getPixelOffset: [24, 0],
      getTextAnchor: "start",
      fontWeight: 700,
      outlineWidth: 3,
      outlineColor: halo,
      fontFamily: FONT,
      fontSettings: { sdf: true },
    }),
    new TextLayer<Doc>({
      id: "shelter-names",
      data: p.shelters.filter((s) => lonlat(s)),
      getPosition: (s) => lonlat(s)!,
      getText: (s) => String(s.name ?? "Shelter").split(",")[0],
      getSize: 11,
      getColor: SHELTER_INK[theme],
      getPixelOffset: [0, 18],
      outlineWidth: 3,
      outlineColor: halo,
      fontFamily: FONT,
      fontSettings: { sdf: true },
    }),
    new PathLayer<{ path: LonLat[] }>({
      id: "drawing",
      data: p.drawing && p.drawing.length ? [{ path: p.drawing.length === 1 ? [p.drawing[0], p.drawing[0]] : p.drawing }] : [],
      getPath: (d) => d.path,
      getColor: [255, 77, 61, 160],
      getWidth: 7,
      widthUnits: "pixels",
      capRounded: true,
    }),
  ];

  const onClick = (e: MapLayerMouseEvent) => p.onMapClick([e.lngLat.lng, e.lngLat.lat]);

  return (
    <MapGL
      initialViewState={{ bounds: CANYON_BOUNDS, fitBoundsOptions: { padding: p.padding ?? CONSOLE_PADDING } }}
      mapStyle={style}
      style={{ position: "absolute", inset: 0 }}
      onLoad={() => setLoaded(true)}
      onError={() => {
        if (!loaded) setFailed(true); // basemap unreachable: keep going on a plain background
      }}
      onClick={onClick}
      cursor={p.drawing ? "crosshair" : undefined}
      attributionControl={{ compact: true }}
    >
      <DeckOverlay
        interleaved={false}
        layers={layers}
        pickingRadius={10} // small dots, big fingers
        onClick={(info: PickingInfo) => {
          if (p.drawing) return false; // the map click handles the tool
          if (info.layer?.id === "homes" && info.object) {
            p.onSelectHousehold((info.object as Doc).id);
            return true;
          }
          return false;
        }}
        getTooltip={(info: PickingInfo) => {
          const o = info.object as Doc | undefined;
          if (!o) return null;
          if (info.layer?.id === "vehicles") return `${o.driverName} · ${o.kind} · ${o.status}`;
          if (info.layer?.id === "homes") {
            const r = requestByHousehold[o.id];
            return `${o.address}\n${String(o.role).replace("_", " ")}${r ? ` · ${r.status}` : ""}`;
          }
          return null;
        }}
      />
    </MapGL>
  );
}
