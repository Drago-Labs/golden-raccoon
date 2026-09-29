"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { KeyRound } from "lucide-react";
import { useWalletSession } from "@/hooks/useWalletSession";
import type { AuthorityHistoryReport } from "@/server/research/authority-history/schema";
import { AuthorityTimeline } from "./AuthorityTimeline";
import { CoverageNotice } from "./CoverageNotice";
import { EvidenceDrawer } from "./EvidenceDrawer";
import { RoleMatrix } from "./RoleMatrix";
import { ScanRangeForm } from "./ScanRangeForm";

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

/**
 * Read-only authority history workspace.
 *
 * Keyed by wallet + network so switching either discards results. Late
 * responses whose generation no longer matches are ignored.
 */
export function AuthorityHistory() {
  const wallet = useWalletSession();
  const address = wallet.family === "evm" ? wallet.address : undefined;
  const [network, setNetwork] = useState("ethereum");
  const [contractAddress, setContractAddress] = useState("");
  const [fromBlock, setFromBlock] = useState("0");
  const [toBlock, setToBlock] = useState("1000");
  const [view, setView] = useState<{
    scope: string;
    report: AuthorityHistoryReport | null;
    error: string | null;
    busy: boolean;
  }>({ scope: "", report: null, error: null, busy: false });
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const generation = useRef(0);
  const scope = `${address ?? "disconnected"}:${network}`;

  useEffect(() => {
    generation.current += 1;
    setSelectedIndex(null);
  }, [address, network]);

  const report = view.scope === scope ? view.report : null;
  const error = view.scope === scope ? view.error : null;
  const busy = view.scope === scope && view.busy;
  const connected = Boolean(address && wallet.family === "evm" && wallet.isConnected);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!address || wallet.family !== "evm") {
      setView({
        scope,
        report: null,
        error: "Connect an authenticated EVM wallet to trace authority history.",
        busy: false,
      });
      return;
    }
    if (!ADDRESS.test(contractAddress)) {
      setView({ scope, report: null, error: "Enter a valid contract address.", busy: false });
      return;
    }

    const requestGeneration = ++generation.current;
    setSelectedIndex(null);
    setView({ scope, report: null, error: null, busy: true });

    try {
      const response = await fetch("/api/insights/authority-history", {
        method: "POST",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          walletAddress: address,
          network,
          contractAddress,
          fromBlock,
          toBlock,
        }),
      });
      const payload = (await response.json()) as {
        report?: AuthorityHistoryReport;
        error?: string;
        message?: string;
      };
      if (requestGeneration !== generation.current) return;
      if (!response.ok || !payload.report) {
        throw new Error(payload.message ?? payload.error ?? `Authority history failed (${response.status})`);
      }
      if (
        payload.report.walletAddress.toLowerCase() !== address.toLowerCase() ||
        payload.report.network !== network
      ) {
        return;
      }
      setView({ scope, report: payload.report, error: null, busy: false });
    } catch (caught) {
      if (requestGeneration === generation.current) {
        setView({
          scope,
          report: null,
          error: caught instanceof Error ? caught.message : "Authority history request failed",
          busy: false,
        });
      }
    } finally {
      if (requestGeneration === generation.current) {
        setView((current) => (current.scope === scope ? { ...current, busy: false } : current));
      }
    }
  }

  const selectedEvent =
    report && selectedIndex !== null && selectedIndex >= 0 && selectedIndex < report.timeline.length
      ? report.timeline[selectedIndex]
      : null;

  return (
    <div className="space-y-6">
      <header className="flex items-start gap-4 border-b border-white/10 pb-5">
        <div className="rounded-2xl border border-[#d9a441]/35 bg-[#d9a441]/10 p-3 text-[#f2c86d]">
          <KeyRound aria-hidden className="h-6 w-6" />
        </div>
        <div>
          <div className="text-xs uppercase tracking-[0.18em] text-[#d9a441]">EVM insight</div>
          <h1 className="mt-1 text-3xl font-semibold">Contract authority history</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/55">
            Trace Ownable and AccessControl changes at explicit blocks, with ERC-1967 proxy administration kept separate.
            Missing history never proves that no authority exists. This view is read-only — it cannot grant, revoke, or
            upgrade.
          </p>
        </div>
      </header>

      {!connected ? (
        <div role="status" className="rounded-2xl border border-white/10 px-4 py-3 text-sm text-white/60">
          Connect an authenticated EVM wallet to run a bounded authority scan.
        </div>
      ) : null}

      {error ? (
        <div role="alert" data-testid="authority-error" className="glass-panel rounded-2xl p-5 text-sm text-red-200">
          <p className="font-semibold">The authority history could not be completed.</p>
          <p className="mt-1 text-white/70">{error}</p>
        </div>
      ) : null}

      <ScanRangeForm
        network={network}
        contractAddress={contractAddress}
        fromBlock={fromBlock}
        toBlock={toBlock}
        busy={busy || !connected}
        onNetwork={(value) => {
          generation.current += 1;
          setNetwork(value);
        }}
        onContractAddress={setContractAddress}
        onFromBlock={setFromBlock}
        onToBlock={setToBlock}
        onSubmit={submit}
      />

      <div aria-live="polite" className="sr-only">
        {busy
          ? "Authority history loading"
          : report
            ? `Authority history ${report.coverage.state}`
            : error ?? ""}
      </div>

      {busy ? (
        <p data-testid="authority-loading" className="text-sm text-white/54">
          Reading authority logs…
        </p>
      ) : null}

      {report ? (
        <>
          <CoverageNotice coverage={report.coverage} />
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
            <AuthorityTimeline
              events={report.timeline}
              selectedIndex={selectedIndex}
              onSelect={setSelectedIndex}
            />
            <EvidenceDrawer event={selectedEvent} onClose={() => setSelectedIndex(null)} />
          </div>
          <RoleMatrix
            holders={report.roleMatrix}
            admins={report.roleAdmins}
            owners={report.observedOwners}
            reconstructionValid={report.coverage.reconstructionValid}
          />
        </>
      ) : null}
    </div>
  );
}
