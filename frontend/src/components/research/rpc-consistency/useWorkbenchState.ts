"use client";

import { useCallback, useRef, useState } from "react";
import type { ConsistencyReport, NetworkId } from "@/server/research/rpc-consistency/schema";

export type WorkbenchRequest = {
  network: NetworkId;
  target: string;
  contractDataKeys: string[];
};

export type WorkbenchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; report: ConsistencyReport }
  | { status: "error"; code: string; message: string };

/**
 * Posts one comparison and ignores a response that belongs to an older submit.
 * The hook does not cache a previous target's numbers onto the next one.
 */
export function useWorkbenchState(endpoint: string) {
  const [state, setState] = useState<WorkbenchState>({ status: "idle" });
  const generation = useRef(0);

  const compare = useCallback(
    (request: WorkbenchRequest) => {
      const target = request.target.trim();

      if (!target) {
        setState({ status: "error", code: "invalid_target", message: "Enter a Stellar account or contract id." });
        return;
      }

      generation.current += 1;
      const requestGeneration = generation.current;
      setState({ status: "loading" });

      fetch(endpoint, {
        method: "POST",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          network: request.network,
          target,
          contractDataKeys: request.contractDataKeys,
        }),
      })
        .then(async (response) => {
          const body = (await response.json()) as { report?: ConsistencyReport; error?: string; message?: string };

          if (requestGeneration !== generation.current) return;

          if (!response.ok || !body.report) {
            setState({
              status: "error",
              code: typeof body.error === "string" ? body.error : "rpc_consistency_failed",
              message: typeof body.message === "string" ? body.message : "The comparison could not be completed.",
            });
            return;
          }

          setState({ status: "ready", report: body.report });
        })
        .catch(() => {
          if (requestGeneration !== generation.current) return;
          setState({ status: "error", code: "network_error", message: "The comparison request could not be completed." });
        });
    },
    [endpoint],
  );

  return { state, compare };
}
