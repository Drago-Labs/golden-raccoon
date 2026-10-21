"use client";

import { useCallback, useRef, useState } from "react";
import { CONGESTION_ERROR_CODES, type CongestionErrorCode, type CongestionViewState } from "@/server/research/network-congestion/errors";
import type { CongestionReport, CongestionRequest } from "@/server/research/network-congestion/schema";

function errorCode(value: unknown): CongestionErrorCode {
  return typeof value === "string" && CONGESTION_ERROR_CODES.includes(value as CongestionErrorCode) ? (value as CongestionErrorCode) : "provider_unavailable";
}

/**
 * Loads one congestion report and drops a response that belongs to an older submit.
 */
export function useWorkbenchState(endpoint = "/api/insights/network-congestion") {
  const [state, setState] = useState<CongestionViewState<CongestionReport>>({ status: "idle" });
  const generation = useRef(0);

  const submit = useCallback(
    (request: CongestionRequest) => {
      generation.current += 1;
      const requestGeneration = generation.current;

      setState({ status: "loading" });

      fetch(endpoint, {
        method: "POST",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request),
      })
        .then(async (response) => {
          const body = (await response.json()) as { report?: CongestionReport; error?: string; message?: string };

          if (requestGeneration !== generation.current) return;

          if (!response.ok || !body.report) {
            setState({
              status: "error",
              code: errorCode(body.error),
              message: typeof body.message === "string" ? body.message : "The ledger window could not be read.",
            });
            return;
          }

          setState({ status: "ready", report: body.report });
        })
        .catch(() => {
          if (requestGeneration !== generation.current) return;

          setState({ status: "error", code: "provider_unavailable", message: "The ledger window could not be read." });
        });
    },
    [endpoint],
  );

  return { state, submit };
}
