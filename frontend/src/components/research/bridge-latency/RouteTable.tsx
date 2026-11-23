import type { RouteLatency } from "@/server/research/bridge-latency";
export function RouteTable({ routes }: { routes: RouteLatency[] }) {
  return (
    <table className="w-full text-sm">
      <caption className="mb-2 text-left font-medium">Routes</caption>
      <thead><tr><th className="text-left">Route</th><th className="text-left">Transfers</th><th className="text-left">Median seconds</th><th className="text-left">95th seconds</th></tr></thead>
      <tbody>{routes.map((route) => <tr key={route.route}><td>{route.route}</td><td>{route.count}</td><td>{route.p50}</td><td>{route.p95}</td></tr>)}</tbody>
    </table>
  );
}
