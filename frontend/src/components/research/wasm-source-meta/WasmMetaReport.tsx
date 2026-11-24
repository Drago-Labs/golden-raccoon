"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { WasmSourceMetaReport as Report } from "@/server/research/wasm-source-meta/schema";
import { ComparisonTable } from "./ComparisonTable";
import { CompatibilityPanel } from "./CompatibilityPanel";
import { ContractInput } from "./ContractInput";
import { CoverageNotice } from "./CoverageNotice";
import { MetadataTable } from "./MetadataTable";
import { useWorkbenchState } from "./useWorkbenchState";

type Network = "stellar-testnet" | "stellar-pubnet";

export function WasmMetaReport({ initialNetwork = "stellar-testnet" }: { initialNetwork?: Network }) {
  const [contractId, setContractId] = useState("");
  const [network, setNetwork] = useState<Network>(initialNetwork);
  const networkRef = useRef(network);
  const { view, setView } = useWorkbenchState(network);

  useEffect(() => {
    networkRef.current = network;
  }, [network]);

  async function inspect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submittedNetwork = network;
    setView({ status: "loading" });

    const response = await fetch("/api/insights/wasm-source-meta", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contractId,
        network: submittedNetwork,
      }),
    });

    const body = (await response.json()) as { report?: Report; message?: string; error?: string };
    if (networkRef.current !== submittedNetwork) return;

    if (!body.report) {
      setView({ status: "error", message: body.message ?? body.error ?? "Inspection failed." });
      return;
    }

    setView({ status: "ready", report: body.report });
  }

  return (
    <div className="flex flex-col gap-4">
      <form
        aria-label="Wasm source metadata inspector"
        className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/4 p-4"
        onSubmit={inspect}
      >
        <ContractInput
          contractId={contractId}
          network={network}
          disabled={view.status === "loading"}
          onContractId={setContractId}
          onNetwork={(value) => setNetwork(value as Network)}
        />
        <button
          type="submit"
          disabled={view.status === "loading"}
          className="inline-flex w-fit rounded-full border border-[#d9a441]/35 bg-[#d9a441]/10 px-4 py-2 text-sm font-semibold text-[#f2c86d] disabled:opacity-50"
        >
          Inspect metadata
        </button>
        <p data-testid="wasm-source-meta-idle" className="text-sm text-muted">
          Reads Wasm custom sections and compares them with published source references. Does not build or execute
          contracts.
        </p>
      </form>

      {view.status === "error" ? (
        <p role="alert" className="rounded-2xl border border-red-300/25 bg-red-400/8 p-4 text-sm text-red-100">
          {view.message}
        </p>
      ) : null}

      {view.status === "ready" ? (
        <div className="flex flex-col gap-4">
          <MetadataTable
            metadata={view.report.metadata}
            envMeta={view.report.envMeta}
            specMeta={view.report.specMeta}
            wasmHash={view.report.wasmHash}
          />
          <ComparisonTable comparisons={view.report.comparisons} />
          <CompatibilityPanel compatibility={view.report.compatibility} />
          <CoverageNotice notice={view.report.coverageNotice} state={view.report.state} />
        </div>
      ) : null}
    </div>
  );
}
