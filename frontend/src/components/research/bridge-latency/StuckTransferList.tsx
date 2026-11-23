import type { StuckTransfer } from "@/server/research/bridge-latency";
export function StuckTransferList({ stuck }: { stuck: StuckTransfer[] }) {
  return (
    <section>
      <h2 className="font-medium">Stuck transfers</h2>
      {stuck.length === 0 ? <p>None older than the threshold.</p> : (
        <ul>{stuck.map((row) => <li key={row.id}>{row.tx} on {row.route}, age {row.ageSeconds} seconds</li>)}</ul>
      )}
    </section>
  );
}
