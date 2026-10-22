import type { RoundingSample, RoundingSampleDirection } from "@/server/research/vault-accounting";

function directionLabel(direction: RoundingSampleDirection): string {
  if (direction === "favors_vault") return "Favors vault (depositor gets back slightly less)";
  if (direction === "favors_depositor") return "Favors depositor";
  if (direction === "exact") return "Exact round trip";
  return "Unavailable";
}

export function RoundingTable(props: { samples: RoundingSample[] }) {
  if (props.samples.length === 0) {
    return <p className="text-xs text-white/55">No sample amounts were supplied — add one to see rounding behavior.</p>;
  }

  return (
    <table className="w-full text-left text-sm">
      <caption className="sr-only">Deposit rounding, computed with exact integer arithmetic</caption>
      <thead>
        <tr className="text-xs uppercase tracking-wide text-white/50">
          <th scope="col" className="pb-2">
            Deposit amount
          </th>
          <th scope="col" className="pb-2">
            Shares minted
          </th>
          <th scope="col" className="pb-2">
            Assets round-trip
          </th>
          <th scope="col" className="pb-2">
            Loss
          </th>
          <th scope="col" className="pb-2">
            Direction
          </th>
        </tr>
      </thead>
      <tbody>
        {props.samples.map((sample, index) => (
          <tr key={`${sample.amount}-${index}`} className="border-t border-white/10">
            <td className="py-2 font-mono text-xs">{sample.amount}</td>
            <td className="py-2 font-mono text-xs">{sample.sharesFromDeposit ?? "unavailable"}</td>
            <td className="py-2 font-mono text-xs">{sample.assetsRoundTrip ?? "unavailable"}</td>
            <td className="py-2 font-mono text-xs">{sample.lossRaw ?? "unavailable"}</td>
            <td className="py-2 text-xs">{directionLabel(sample.direction)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
