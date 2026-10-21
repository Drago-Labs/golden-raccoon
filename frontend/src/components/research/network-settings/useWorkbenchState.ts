"use client";

import { useEffect, useMemo, useState } from "react";
import type { WorkbenchState } from "@/server/research/network-settings/errors";
import type { NetworkId } from "@/server/research/network-settings/networkIdentity";
import type { NetworkSettingsReport, SettingChange } from "@/server/research/network-settings/schema";
import { diffSnapshots } from "@/server/research/network-settings/snapshotDiff";

type LoadState =
  | { status: "loading"; network: NetworkId; report: null }
  | { status: "ready"; network: NetworkId; report: NetworkSettingsReport }
  | { status: "unavailable"; network: NetworkId; report: NetworkSettingsReport | null; message: string }
  | { status: "invalid"; network: NetworkId; report: null; message: string };

export function useWorkbenchState(endpoint = "/api/insights/network-settings") {
  const [network, setNetwork] = useState<NetworkId>("testnet");
  const [load, setLoad] = useState<LoadState>({ status: "loading", network: "testnet", report: null });
  const [beforeLedger, setBeforeLedger] = useState<number | null>(null);
  const [afterLedger, setAfterLedger] = useState<number | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoad({ status: "loading", network, report: null });
    setBeforeLedger(null);
    setAfterLedger(null);

    fetch(endpoint, {
      method: "POST",
      cache: "no-store",
      signal: controller.signal,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ network }),
    })
      .then(async (response) => {
        const payload = (await response.json()) as { report?: NetworkSettingsReport; error?: string; message?: string };

        if (payload.report && payload.report.network !== network) return;

        if (payload.report && response.ok) {
          const history = payload.report.history;
          setBeforeLedger(history.length > 1 ? history[0].ledger : history[0]?.ledger ?? null);
          setAfterLedger(history.length > 1 ? history[history.length - 1].ledger : null);
          setLoad({ status: "ready", network, report: payload.report });
          return;
        }

        if (payload.report && response.status === 503) {
          setLoad({
            status: "unavailable",
            network,
            report: payload.report,
            message: payload.report.coverage.message,
          });
          return;
        }

        setLoad({
          status: "invalid",
          network,
          report: null,
          message: payload.message ?? "Network settings could not be loaded.",
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;

        setLoad({
          status: "unavailable",
          network,
          report: null,
          message: error instanceof Error ? error.message : "Network settings could not be loaded.",
        });
      });

    return () => controller.abort();
  }, [endpoint, network]);

  const changes = useMemo<SettingChange[] | null>(() => {
    if (load.status !== "ready" || beforeLedger === null || afterLedger === null || beforeLedger === afterLedger) {
      return null;
    }

    const history = load.report.history;
    const before = history.find((upgrade) => upgrade.ledger === beforeLedger);
    const after = history.find((upgrade) => upgrade.ledger === afterLedger);

    if (!before || !after || before.network !== load.network || after.network !== load.network) return null;

    return diffSnapshots(
      { network: load.network, ledger: before.ledger, protocolVersion: before.protocolVersion, settings: before.settings },
      { network: load.network, ledger: after.ledger, protocolVersion: after.protocolVersion, settings: after.settings },
    );
  }, [afterLedger, beforeLedger, load]);

  const phase: WorkbenchState = load.status === "loading"
    ? { status: "loading", network: load.network }
    : load.status === "ready"
      ? { status: "ready", network: load.network }
      : load.status === "unavailable"
        ? { status: "unavailable", network: load.network, message: load.message }
        : { status: "invalid", message: load.message };

  return {
    network,
    setNetwork,
    phase,
    report: load.status === "ready" || load.status === "unavailable" ? load.report : null,
    beforeLedger,
    afterLedger,
    setBeforeLedger,
    setAfterLedger,
    changes,
  };
}
