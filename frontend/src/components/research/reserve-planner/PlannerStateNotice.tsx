import type { ReservePlannerResult } from "@/server/research/reserve-planner/schema";

export function PlannerStateNotice({ result, error, connected }: { result: ReservePlannerResult | null; error: string | null; connected: boolean }) {
  if (!connected) return <div role="status" className="rounded-2xl border border-amber-300/25 bg-amber-500/8 p-4 text-sm">Connect an authenticated Stellar wallet to inspect reserve obligations.</div>;
  if (error) return <div role="alert" className="rounded-2xl border border-red-300/25 bg-red-500/8 p-4 text-sm text-red-100">{error}</div>;
  if (!result || result.state === "complete") return null;
  return <div role="alert" className="rounded-2xl border border-amber-300/25 bg-amber-500/8 p-4 text-sm"><strong>{result.state}</strong><ul className="mt-2 list-disc pl-5">{result.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></div>;
}
