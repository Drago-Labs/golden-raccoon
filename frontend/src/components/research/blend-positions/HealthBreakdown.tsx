import type { HealthFactorBreakdown } from "@/server/research/blend-positions";

export function HealthBreakdown(props: { health: HealthFactorBreakdown }) {
  const { health } = props;
  return (
    <div data-testid="health-breakdown" className="space-y-2 rounded-lg border border-white/10 p-4 text-xs">
      <h3 className="text-sm font-medium text-white">Health factor breakdown</h3>
      {!health.available ? (
        <p className="text-amber-200">
          Health factor unavailable: {health.unavailableReason ?? "Missing oracle valuation."}
        </p>
      ) : (
        <dl className="grid gap-3 sm:grid-cols-4">
          <div>
            <dt className="text-white/50">Effective collateral</dt>
            <dd className="text-sm font-semibold text-white">
              ${health.effectiveCollateralUsd?.toFixed(2) ?? "0.00"}
            </dd>
          </div>
          <div>
            <dt className="text-white/50">Effective liability</dt>
            <dd className="text-sm font-semibold text-white">
              ${health.effectiveLiabilityUsd?.toFixed(2) ?? "0.00"}
            </dd>
          </div>
          <div>
            <dt className="text-white/50">Health factor</dt>
            <dd className="text-sm font-semibold text-white">
              {health.healthFactor !== null ? health.healthFactor.toFixed(4) : "No debt"}
            </dd>
          </div>
          <div>
            <dt className="text-white/50">Status</dt>
            <dd className="text-sm font-semibold text-white">{health.status}</dd>
          </div>
        </dl>
      )}
    </div>
  );
}
