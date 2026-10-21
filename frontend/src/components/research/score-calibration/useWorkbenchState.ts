"use client";

import { useCallback, useRef, useState } from "react";
import type { CalibrationReport, HorizonDays, OutcomeType } from "@/server/research/score-calibration/schema";

export type WorkbenchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; report: CalibrationReport }
  | { status: "error"; code: string; message: string };

export function useWorkbenchState(endpoint: string) {
  const [state, setState] = useState<WorkbenchState>({ status: "idle" });
  const generation = useRef(0);

  const check = useCallback(
    (outcomeType: OutcomeType, horizonDays: HorizonDays, network: "testnet" | "pubnet") => {
      generation.current += 1;
      const requestGeneration = generation.current;

      setState({ status: "loading" });

      fetch(endpoint, {
        method: "POST",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ outcomeType, horizonDays, network, evaluatedAt: new Date().toISOString() }),
      })
        .then(async (response) => {
          const body = await response.json();
          if (requestGeneration !== generation.current) return;

          if (!response.ok) {
            setState({
              status: "error",
              code: typeof body?.error === "string" ? body.error : "score_calibration_failed",
              message: typeof body?.message === "string" ? body.message : "The calibration report could not be built.",
            });
            return;
          }

          setState({ status: "ready", report: body.report as CalibrationReport });
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
