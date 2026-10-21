"use client";

import type { CctpTransferReport } from "@/server/research/cctp-transfers/schema";

export function MessageDetail({ report }: { report: CctpTransferReport }) {
  return (
    <section data-testid="message-detail" className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-xs text-subtle sm:p-5">
      <h2 className="text-sm font-semibold text-muted">Message detail</h2>
      <p>
        Nonce: <span className="font-mono">{report.burn.nonce ?? "unknown"}</span>
      </p>
      <p>
        Mint recipient: <span className="font-mono">{report.burn.mintRecipientDisplay ?? "unknown"}</span>
      </p>
      <p>
        Depositor: <span className="font-mono">{report.burn.depositorAddress ?? "unknown"}</span>
      </p>
      <p>
        Min finality threshold: <span className="font-mono">{report.burn.minFinalityThreshold ?? "unknown"}</span>
      </p>
      {report.attestation.destinationMintTxHashReported ? (
        <p>
          Destination mint tx (as reported by Circle, not independently verified): <span className="font-mono">{report.attestation.destinationMintTxHashReported}</span>
        </p>
      ) : null}
    </section>
  );
}
