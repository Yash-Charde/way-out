import { SimBadge } from "@/components/Shell";

/** What the map's colors mean. Shared by the console and the home page. */
export function MapLegend({ className = "" }: { className?: string }) {
  const dot = (cls: string, label: string) => (
    <span className="flex items-center gap-1.5">
      <span className={`inline-block h-2.5 w-2.5 rounded-full ${cls}`} />
      {label}
    </span>
  );
  return (
    <div className={`flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 text-xs text-muted ${className}`}>
      {dot("bg-fire", "needs a ride")}
      {dot("bg-help", "can help")}
      {dot("bg-out", "left")}
      {dot("bg-unknown", "not reached")}
      {dot("bg-vehicle ring-2 ring-ink", "vehicle")}
      {dot("bg-sim", "shelter")}
      <span className="flex items-center gap-1.5">
        <span className="inline-block h-1 w-5 rounded bg-fire" />
        road closed
      </span>
      <SimBadge />
    </div>
  );
}
