import type { UpgradeView } from "@/server/research/network-settings/schema";

export function UpgradeTimeline(props: { upgrades: UpgradeView[] }) {
  return (
    <section className="min-w-0 space-y-3" aria-labelledby="upgrade-timeline-heading">
      <h2 id="upgrade-timeline-heading" className="text-lg font-semibold">
        Upgrade timeline
      </h2>
      {props.upgrades.length === 0 ? (
        <p className="text-sm text-foreground/70">No recorded upgrades for this network.</p>
      ) : (
        <ol aria-label="Upgrade timeline" className="flex flex-col gap-3">
          {props.upgrades.map((upgrade) => (
            <li key={`${upgrade.network}-${upgrade.ledger}`} className="rounded-2xl border border-foreground/15 px-3 py-3">
              <p className="font-medium">
                Ledger {upgrade.ledger}
              </p>
              <p className="text-sm text-foreground/70">
                Protocol {upgrade.protocolVersion}
                {upgrade.upgradeType ? ` · ${upgrade.upgradeType}` : ""}
                {upgrade.upgradeValue ? ` ${upgrade.upgradeValue}` : ""}
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
