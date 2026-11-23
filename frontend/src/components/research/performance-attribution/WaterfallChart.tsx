import type { AttributionReport } from "@/server/research/performance-attribution/schema";

type Step = { label: string; value: string | null };

/**
 * A waterfall from the start value to the end value: external flows, then
 * price effect, then residual. The chart is decorative — the table beneath it
 * carries every figure, including the ones that are unavailable.
 */
export function WaterfallChart({ totals, startValueUsd, endValueUsd }: {
  totals: AttributionReport["totals"];
  startValueUsd: string | null;
  endValueUsd: string | null;
}) {
  const steps: Step[] = [
    { label: "Start value", value: startValueUsd },
    { label: "External flows", value: totals.externalFlowUsd },
    { label: "Price effect", value: totals.priceEffectUsd },
    { label: "Residual", value: totals.residualUsd },
    { label: "End value", value: endValueUsd },
  ];
  const numeric = steps.map((step) => (step.value === null ? null : Number(step.value)));
  const scale = Math.max(...numeric.map((value) => Math.abs(value ?? 0)), 1);

  return (
    <section className="space-y-3" aria-label="Attribution waterfall">
      <h2 className="text-lg font-semibold">From start value to end value</h2>
      <svg viewBox="0 0 320 140" role="img" aria-labelledby="waterfall-title" className="max-h-64 w-full">
        <title id="waterfall-title">
          Waterfall from the start value through external flows, price effect and residual to the end value. The table
          below this chart carries every figure, and an unavailable step is drawn as no bar at all.
        </title>
        <line x1="0" x2="320" y1="120" y2="120" stroke="currentColor" strokeWidth="0.5" />
        {steps.map((step, index) => {
          const value = numeric[index];
          if (value === null) return null;
          const height = Math.max((Math.abs(value) / scale) * 100, 1);
          return (
            <rect
              key={step.label}
              x={index * 64 + 16}
              y={120 - height}
              width={32}
              height={height}
              fill="currentColor"
              opacity={value < 0 ? 0.45 : 0.9}
            />
          );
        })}
      </svg>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="pb-2 text-left">Text alternative: each step of the waterfall in USD</caption>
          <thead>
            <tr>
              <th scope="col" className="p-2">
                Step
              </th>
              <th scope="col" className="p-2">
                USD
              </th>
            </tr>
          </thead>
          <tbody>
            {steps.map((step) => (
              <tr key={step.label}>
                <th scope="row" className="p-2">
                  {step.label}
                </th>
                <td className="p-2 tabular-nums">{step.value ?? "Unavailable"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
