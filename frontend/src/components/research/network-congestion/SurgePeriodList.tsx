import type { SurgePeriod } from "@/server/research/network-congestion/schema";

function floorText(value: string | null): string {
  return value === null ? "No inclusion sample" : `${value} stroops/op`;
}

/**
 * Each full run is its own card, stacked in one column so a narrow screen
 * does not have to scroll a comparison table of unrelated fees.
 */
export function SurgePeriodList({ surges }: { surges: SurgePeriod[] }) {
  if (surges.length === 0) {
    return (
      <p data-testid="surge-empty" className="text-sm text-white/54">
        No ledger in this window was at its operation capacity, so no surge period is listed.
      </p>
    );
  }

  return (
    <ol data-testid="surge-list" className="grid grid-cols-1 gap-3">
      {surges.map((period) => (
        <li key={`${period.fromSequence}-${period.toSequence}`} className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <h3 className="text-sm font-semibold">
            Ledgers {period.fromSequence}
            {period.toSequence === period.fromSequence ? "" : `–${period.toSequence}`}
            <span className="ml-2 font-normal text-white/54">
              {period.ledgerCount} ledger{period.ledgerCount === 1 ? "" : "s"}
            </span>
          </h3>
          <p className="mt-1 text-xs text-white/54">
            <time dateTime={period.startedAt}>{period.startedAt}</time>
            {period.endedAt === period.startedAt ? null : (
              <>
                {" "}
                to <time dateTime={period.endedAt}>{period.endedAt}</time>
              </>
            )}
          </p>
          <dl className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs uppercase tracking-[0.12em] text-white/42">Classic inclusion floor</dt>
              <dd className="mt-1 font-mono tabular-nums">{floorText(period.classicInclusionFloorStroops)}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.12em] text-white/42">Soroban inclusion floor</dt>
              <dd className="mt-1 font-mono tabular-nums">{floorText(period.sorobanInclusionFloorStroops)}</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs leading-5 text-white/60">
            {period.pricedAboveBase
              ? `An inclusion floor was above the ${period.baseFeeStroops} stroop base fee.`
              : `Capacity was full. The inclusion floor did not rise above the ${period.baseFeeStroops} stroop base fee.`}{" "}
            Soroban resource fees are not part of either floor.
          </p>
        </li>
      ))}
    </ol>
  );
}
