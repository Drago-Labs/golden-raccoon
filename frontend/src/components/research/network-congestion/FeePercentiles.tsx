import type { FeeDistribution, FeeSummary } from "@/server/research/network-congestion/schema";

function unitLabel(unit: FeeDistribution["unit"]): string {
  return unit === "stroops_per_operation" ? "stroops/op" : "stroops";
}

function DistributionTable({
  testId,
  caption,
  distribution,
  extra,
}: {
  testId: string;
  caption: string;
  distribution: FeeDistribution;
  extra?: string;
}) {
  if (distribution.sampleCount === 0) {
    return (
      <p data-testid={testId} className="text-sm text-white/54">
        No {caption.toLowerCase()} sample was observed in the ledgers that were present. Missing ledgers are not treated as zero.
      </p>
    );
  }

  const unit = unitLabel(distribution.unit);
  const rows = [
    ["Minimum", distribution.min],
    ["p50", distribution.p50],
    ["p90", distribution.p90],
    ["p99", distribution.p99],
    ["Maximum", distribution.max],
  ] as const;

  return (
    <div data-testid={testId} className="overflow-x-auto" tabIndex={0} role="region" aria-label={caption}>
      <table className="w-full min-w-[22rem] border-collapse text-left text-sm">
        <caption className="mb-2 text-left text-sm font-medium text-white/80">
          {caption} · {distribution.sampleCount} transaction{distribution.sampleCount === 1 ? "" : "s"}
        </caption>
        <thead>
          <tr className="text-xs uppercase tracking-[0.12em] text-white/42">
            <th scope="col" className="py-2 pr-4 font-medium">
              Statistic
            </th>
            <th scope="col" className="py-2 font-medium">
              Value
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, value]) => (
            <tr key={label} className="border-t border-white/8">
              <th scope="row" className="py-2 pr-4 font-medium">
                {label}
              </th>
              <td className="py-2 font-mono tabular-nums">
                {value} {unit}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {extra ? <p className="mt-2 text-xs leading-5 text-white/54">{extra}</p> : null}
    </div>
  );
}

/**
 * Three distributions, in three regions. Nothing on this screen adds a classic
 * inclusion figure to a Soroban resource figure.
 */
export function FeePercentiles({ fees }: { fees: FeeSummary }) {
  return (
    <div className="flex flex-col gap-6">
      <DistributionTable testId="fee-classic" caption="Classic inclusion fees" distribution={fees.classicInclusion} />
      <DistributionTable testId="fee-soroban-inclusion" caption="Soroban inclusion fees" distribution={fees.sorobanInclusion} />
      <DistributionTable
        testId="fee-soroban-resource"
        caption="Soroban resource fees"
        distribution={fees.sorobanResource}
        extra={`Rent of ${fees.sorobanResource.rentStroopsIncluded} stroops is already inside the resource fee. It is not an additional charge and it is not added to classic inclusion.`}
      />
    </div>
  );
}
