import type { NetworkId } from "@/server/research/network-settings/networkIdentity";
import type { SettingChange, UpgradeView } from "@/server/research/network-settings/schema";

const DIRECTION_LABEL = {
  increase: "Increase",
  decrease: "Decrease",
  changed: "Changed",
} as const;

export function SnapshotDiff(props: {
  network: NetworkId;
  upgrades: UpgradeView[];
  beforeLedger: number | null;
  afterLedger: number | null;
  changes: SettingChange[] | null;
  onBefore: (ledger: number) => void;
  onAfter: (ledger: number) => void;
}) {
  return (
    <section className="min-w-0 space-y-3" aria-labelledby="snapshot-diff-heading">
      <h2 id="snapshot-diff-heading" className="text-lg font-semibold">
        Snapshot diff
      </h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex min-w-0 flex-col gap-2 text-sm" htmlFor="snapshot-before">
          <span className="font-medium">Earlier snapshot</span>
          <select
            id="snapshot-before"
            className="w-full rounded-xl border border-foreground/20 bg-background px-3 py-2 text-base"
            value={props.beforeLedger ?? ""}
            onChange={(event) => props.onBefore(Number(event.target.value))}
          >
            {props.upgrades.map((upgrade) => (
              <option key={upgrade.ledger} value={upgrade.ledger}>
                Ledger {upgrade.ledger} · protocol {upgrade.protocolVersion}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-0 flex-col gap-2 text-sm" htmlFor="snapshot-after">
          <span className="font-medium">Later snapshot</span>
          <select
            id="snapshot-after"
            className="w-full rounded-xl border border-foreground/20 bg-background px-3 py-2 text-base"
            value={props.afterLedger ?? ""}
            onChange={(event) => props.onAfter(Number(event.target.value))}
          >
            {props.upgrades.map((upgrade) => (
              <option key={upgrade.ledger} value={upgrade.ledger}>
                Ledger {upgrade.ledger} · protocol {upgrade.protocolVersion}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="w-full max-w-full overflow-x-auto rounded-2xl border border-foreground/15">
        <table aria-label="Snapshot diff" className="w-full min-w-[18rem] border-collapse text-left text-sm">
          <thead className="bg-foreground/5">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">Setting</th>
              <th scope="col" className="px-3 py-2 font-medium">Before</th>
              <th scope="col" className="px-3 py-2 font-medium">After</th>
              <th scope="col" className="px-3 py-2 font-medium">Direction</th>
            </tr>
          </thead>
          <tbody>
            {props.changes === null || props.changes.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-4 text-foreground/70">
                  {props.upgrades.length < 2
                    ? "Two recorded snapshots on this network are required."
                    : "No setting changed between these snapshots."}
                </td>
              </tr>
            ) : (
              props.changes.map((change) => (
                <tr key={change.key} className="border-t border-foreground/10">
                  <th scope="row" className="px-3 py-2 font-medium">
                    {change.name}
                    <span className="mt-1 block text-xs font-normal text-foreground/70">{change.unit}</span>
                  </th>
                  <td className="px-3 py-2 font-mono break-all">{change.before ?? "—"}</td>
                  <td className="px-3 py-2 font-mono break-all">{change.after ?? "—"}</td>
                  <td className="px-3 py-2">{DIRECTION_LABEL[change.direction]}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-foreground/70">Diff is limited to {props.network}. Unchanged settings are omitted.</p>
    </section>
  );
}
