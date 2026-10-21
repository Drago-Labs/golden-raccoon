"use client";

import { useCallback, useRef, useState } from "react";
import type { PackageProvenanceReport, PackageRegistryName } from "@/server/research/package-provenance/schema";

export type WorkbenchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; report: PackageProvenanceReport }
  | { status: "error"; code: string; message: string };

/**
 * Unlike the diff-against-history features in this app, this inspector
 * needs no caller-held session state: the registry already returns the
 * full release history on every request, so each check is a fresh,
 * self-contained report.
 */
export function useWorkbenchState(endpoint: string) {
  const [state, setState] = useState<WorkbenchState>({ status: "idle" });
  const generation = useRef(0);

  const check = useCallback(
    (registry: PackageRegistryName, packageName: string) => {
      generation.current += 1;
      const requestGeneration = generation.current;

      setState({ status: "loading" });

      fetch(endpoint, {
        method: "POST",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ registry, packageName, evaluatedAt: new Date().toISOString() }),
      })
        .then(async (response) => {
          const body = await response.json();
          if (requestGeneration !== generation.current) return;

          if (!response.ok) {
            setState({
              status: "error",
              code: typeof body?.error === "string" ? body.error : "package_provenance_inspection_failed",
              message: typeof body?.message === "string" ? body.message : "The package provenance check could not be completed.",
            });
            return;
          }

          setState({ status: "ready", report: body.report as PackageProvenanceReport });
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
