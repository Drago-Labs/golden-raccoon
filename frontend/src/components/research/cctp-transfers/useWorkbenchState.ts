"use client";

import { useCallback, useRef, useState } from "react";
import type { CctpTransferReport, NetworkMode } from "@/server/research/cctp-transfers/schema";

export type WorkbenchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; report: CctpTransferReport }
  | { status: "error"; code: string; message: string };

/** Every check is a fresh report — nothing is held in session state between checks. */
export function useWorkbenchState(endpoint: string) {
  const [state, setState] = useState<WorkbenchState>({ status: "idle" });
  const generation = useRef(0);

  const check = useCallback(
    (sourceChain: string, transactionHash: string, network: NetworkMode) => {
      generation.current += 1;
      const requestGeneration = generation.current;

      setState({ status: "loading" });

      fetch(endpoint, {
        method: "POST",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sourceChain, transactionHash, network, evaluatedAt: new Date().toISOString() }),
      })
        .then(async (response) => {
          const body = await response.json();
          if (requestGeneration !== generation.current) return;

          if (!response.ok) {
            setState({
              status: "error",
              code: typeof body?.error === "string" ? body.error : "cctp_transfer_tracking_failed",
              message: typeof body?.message === "string" ? body.message : "The transfer check could not be completed.",
            });
            return;
          }

          setState({ status: "ready", report: body.report as CctpTransferReport });
        })
        .catch(() => {
          if (requestGeneration !== generation.current) return;
          setState({ status: "error", code: "network_error", message: "The request could not be sent." });
        });
    },
    [endpoint],
  );

  return { state, check };
}
