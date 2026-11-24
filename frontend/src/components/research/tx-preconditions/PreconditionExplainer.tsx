"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { PreconditionsReport } from "@/server/research/tx-preconditions/schema";
import { CoverageNotice } from "./CoverageNotice";
import { EnvelopeInput } from "./EnvelopeInput";
import { PreconditionTable } from "./PreconditionTable";
import { SignerRequirements } from "./SignerRequirements";
import { useWorkbenchState } from "./useWorkbenchState";
import { ValidityTimeline } from "./ValidityTimeline";

type Network = "stellar-testnet" | "stellar-pubnet";

export function PreconditionExplainer({ initialNetwork = "stellar-testnet" }: { initialNetwork?: Network }) {
  const [envelopeXdr, setEnvelopeXdr] = useState("");
  const [network, setNetwork] = useState<Network>(initialNetwork);
  const networkRef = useRef(network);
  const { view, setView } = useWorkbenchState(network);

  useEffect(() => {
    networkRef.current = network;
  }, [network]);

  async function explain(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submittedNetwork = network;
    setView({ status: "loading" });

    const response = await fetch("/api/insights/tx-preconditions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ envelopeXdr, network: submittedNetwork }),
    });
    const body = (await response.json()) as { report?: PreconditionsReport; message?: string; error?: string };
    if (networkRef.current !== submittedNetwork) return;
    if (!body.report) {
      setView({ status: "error", message: body.message ?? body.error ?? "Precondition evaluation failed." });
      return;
    }
    setView({ status: "ready", report: body.report });
  }

  return (
    <div className="flex flex-col gap-4">
      <form
        aria-label="Transaction preconditions"
        className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/4 p-4"
        onSubmit={explain}
      >
        <EnvelopeInput
          envelopeXdr={envelopeXdr}
          network={network}
          disabled={view.status === "loading"}
          onEnvelope={setEnvelopeXdr}
          onNetwork={setNetwork}
        />
        <button
          type="submit"
          disabled={view.status === "loading"}
          className="inline-flex w-fit rounded-full border border-[#d9a441]/35 bg-[#d9a441]/10 px-4 py-2 text-sm font-semibold text-[#f2c86d] disabled:opacity-50"
        >
          Explain preconditions
        </button>
        <p data-testid="tx-preconditions-idle" className="text-sm text-muted">
          This page only decodes the envelope and compares CAP-21 preconditions to the current ledger. It does not
          submit, sign, or build a transaction.
        </p>
      </form>

      {view.status === "error" ? (
        <p role="alert" className="rounded-2xl border border-red-300/25 bg-red-400/8 p-4 text-sm text-red-100">
          {view.message}
        </p>
      ) : null}

      {view.status === "ready" ? (
        <div className="flex flex-col gap-4">
          {view.report.envelope ? (
            <section className="rounded-2xl border border-white/10 bg-white/4 p-4 text-sm" data-testid="envelope-summary">
              <h2 className="text-lg font-semibold">Envelope</h2>
              <p className="mt-2 text-muted">
                Source {view.report.envelope.sourceAccount}
                {view.report.envelope.isFeeBump ? ` · fee source ${view.report.envelope.feeSource}` : ""}. Sequence{" "}
                {view.report.envelope.sequence}. Signatures {view.report.envelope.signatureCount}.
              </p>
            </section>
          ) : null}
          <PreconditionTable rows={view.report.preconditions} />
          <ValidityTimeline window={view.report.validityWindow} />
          <SignerRequirements signers={view.report.extraSigners} />
          <CoverageNotice notice={view.report.coverageNotice} state={view.report.state} />
        </div>
      ) : null}
    </div>
  );
}
