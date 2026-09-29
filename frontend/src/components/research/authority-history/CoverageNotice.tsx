import { StatusBadge } from "@/components/a11y/StatusBadge";
import type { AuthorityCoverage } from "@/server/research/authority-history/schema";

const tones: Record<AuthorityCoverage["state"], "success" | "warning" | "danger" | "neutral"> = {
  complete: "success",
  partial: "warning",
  empty: "neutral",
  unavailable: "danger",
};

export function CoverageNotice({ coverage }: { coverage: AuthorityCoverage }) {
  return (
    <section
      data-testid="authority-coverage"
      aria-labelledby="authority-coverage-heading"
      className="glass-panel rounded-2xl border border-white/10 p-5"
    >
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="authority-coverage-heading" className="text-lg font-semibold">
          Coverage range
        </h2>
        <StatusBadge tone={tones[coverage.state]}>{coverage.state}</StatusBadge>
      </div>
      <p className="mt-3 text-sm leading-6 text-white/70">{coverage.message}</p>
      <dl className="mt-4 grid gap-3 text-xs text-white/55 sm:grid-cols-2">
        <div>
          <dt className="text-white/40">From block</dt>
          <dd className="font-mono">{coverage.fromBlock}</dd>
        </div>
        <div>
          <dt className="text-white/40">To block</dt>
          <dd className="font-mono">{coverage.toBlock ?? "unavailable"}</dd>
        </div>
        <div>
          <dt className="text-white/40">Snapshot block</dt>
          <dd className="font-mono">{coverage.snapshotBlock ?? "unavailable"}</dd>
        </div>
        <div>
          <dt className="text-white/40">Events retained</dt>
          <dd>{coverage.eventCount}{coverage.truncated ? " (truncated)" : ""}</dd>
        </div>
        <div>
          <dt className="text-white/40">Reconstruction</dt>
          <dd>{coverage.reconstructionValid ? "valid inside range" : "invalidated"}</dd>
        </div>
        <div>
          <dt className="text-white/40">Reorg / missing hashes</dt>
          <dd>
            {coverage.reorgDetected ? "reorg detected" : "no reorg"} · {coverage.missingBlockHashes} missing
          </dd>
        </div>
      </dl>
      {coverage.providerLimitations.length > 0 ? (
        <ul className="mt-4 list-disc space-y-1 pl-5 text-xs text-[#f2c86d]">
          {coverage.providerLimitations.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : null}
      {coverage.unsupportedModels.length > 0 ? (
        <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-white/55">
          {coverage.unsupportedModels.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
