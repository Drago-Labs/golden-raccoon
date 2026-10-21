"use client";

import { StatusBadge } from "@/components/a11y/StatusBadge";
import type { CctpTransferReport, StepState } from "@/server/research/cctp-transfers/schema";

const STEP_TONES: Record<StepState, "success" | "warning" | "danger" | "neutral"> = {
  completed: "success",
  pending: "warning",
  failed: "danger",
  unknown: "neutral",
};

function StepRow({ title, state, detail }: { title: string; state: StepState; detail: string }) {
  return (
    <li className="flex flex-col gap-1 border-b border-white/5 pb-3 last:border-none last:pb-0">
      <div className="flex items-center gap-2 text-sm">
        <span className="font-semibold">{title}</span>
        <StatusBadge tone={STEP_TONES[state]}>{state}</StatusBadge>
      </div>
      <p className="text-xs text-subtle">{detail}</p>
    </li>
  );
}

export function StepTimeline({ report }: { report: CctpTransferReport }) {
  return (
    <section data-testid="step-timeline" className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
      <h2 className="text-sm font-semibold text-muted">Transfer steps</h2>
      <ol className="flex flex-col gap-3">
        <StepRow
          title={`Burn on ${report.sourceChain}`}
          state={report.burn.state}
          detail={report.burn.issues[0] ?? `Burned ${report.burn.amountBaseUnits ?? "?"} base units, destined for ${report.burn.destinationChain}.`}
        />
        <StepRow
          title="Attestation"
          state={report.attestation.state}
          detail={report.attestation.issues[0] ?? `Status: ${report.attestation.status ?? "unknown"}.`}
        />
        <StepRow
          title={`Receipt on ${report.destination.destinationChain}`}
          state={report.destination.state}
          detail={report.destination.issues[0] ?? (report.destination.nonceUsed ? "The nonce has been consumed on the destination chain." : "The nonce has not been consumed on the destination chain yet.")}
        />
      </ol>
    </section>
  );
}
