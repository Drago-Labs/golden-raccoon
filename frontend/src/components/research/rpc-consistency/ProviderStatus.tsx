import { StatusBadge } from "@/components/a11y/StatusBadge";
import type { ProviderStatus as ProviderStatusModel } from "@/server/research/rpc-consistency/schema";

function retention(provider: ProviderStatusModel): string {
  if (provider.retentionStartLedger == null || provider.retentionEndLedger == null) {
    return "Retention window not reported";
  }

  return `Ledgers ${provider.retentionStartLedger}–${provider.retentionEndLedger}`;
}

/** Latest ledger and retention window for one provider, including an explicit unavailable label. */
export function ProviderStatus({ providers }: { providers: ProviderStatusModel[] }) {
  return (
    <section aria-labelledby="provider-status-heading" data-testid="provider-status" className="min-w-0">
      <h2 id="provider-status-heading" className="text-lg font-semibold">
        Provider status
      </h2>
      <ul className="mt-4 flex flex-col gap-3">
        {providers.map((provider) => (
          <li key={provider.provider} data-testid={`provider-${provider.provider}`} className="rounded-2xl border border-white/10 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold">{provider.label}</h3>
              <StatusBadge tone={provider.availability === "available" ? "success" : "danger"}>{provider.availability}</StatusBadge>
            </div>
            <dl className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs uppercase tracking-[0.12em] text-white/45">Latest ledger</dt>
                <dd>{provider.latestLedger ?? "Not reported"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-[0.12em] text-white/45">Retention window</dt>
                <dd>{retention(provider)}</dd>
              </div>
            </dl>
            <p className="mt-2 break-words text-xs leading-5 text-white/60">{provider.detail}</p>
            <p className="mt-1 break-all text-xs text-white/40">{provider.endpoint}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
