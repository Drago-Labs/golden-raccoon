import type { RouteLatency } from "@/server/research/bridge-latency";
export function LatencyChart({ routes }: { routes: RouteLatency[] }) {
  const text = routes.map((route) => `${route.route} median ${route.p50} seconds, 95th ${route.p95} seconds`).join("; ") || "No delivered transfers.";
  return (
    <figure>
      <figcaption className="text-sm">{text}</figcaption>
      <div aria-hidden="true" className="mt-2 flex gap-2">
        {routes.map((route) => <div key={route.route} style={{ height: 8, width: Math.max(8, route.p50) }} className="bg-slate-400" />)}
      </div>
    </figure>
  );
}
