import type { InventoryReport } from "@/server/research/privileged-keys";

export function CustodySummary({ summary }: { summary: InventoryReport["summary"] }) {
  return (
    <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
      <div><dt>Multisigs</dt><dd>{summary.multisig}</dd></div>
      <div><dt>Timelocks</dt><dd>{summary.timelock}</dd></div>
      <div><dt>Single keys</dt><dd>{summary.singleKey}</dd></div>
      <div><dt>Unknown</dt><dd>{summary.unknown}</dd></div>
    </dl>
  );
}
