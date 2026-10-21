"use client";

import { useCallback, useRef, useState } from "react";
import type { PolicyChangeReport, PolicySnapshot } from "@/server/research/policy-changes/schema";

export type WorkbenchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; report: PolicyChangeReport }
  | { status: "error"; code: string; message: string };

/**
 * Prior snapshots stay in session state — nothing is written server-side.
 * Keyed per project so switching projects does not mix their histories.
 */
export function useWorkbenchState(endpoint: string) {
  const [state, setState] = useState<WorkbenchState>({ status: "idle" });
  const historyByProject = useRef(new Map<string, PolicySnapshot[]>());
  const generation = useRef(0);

  const check = useCallback(
    (projectId: string) => {
      generation.current += 1;
      const requestGeneration = generation.current;
      const priorSnapshots = historyByProject.current.get(projectId) ?? [];

      setState({ status: "loading" });

      fetch(endpoint, {
        method: "POST",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId, priorSnapshots, evaluatedAt: new Date().toISOString() }),
      })
        .then(async (response) => {
          const body = await response.json();
          if (requestGeneration !== generation.current) return;

          if (!response.ok) {
            setState({
              status: "error",
              code: typeof body?.error === "string" ? body.error : "policy_change_tracking_failed",
              message: typeof body?.message === "string" ? body.message : "The policy-change check could not be completed.",
            });
            return;
          }

          const report = body.report as PolicyChangeReport;
          historyByProject.current.set(projectId, report.timeline);
          setState({ status: "ready", report });
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
