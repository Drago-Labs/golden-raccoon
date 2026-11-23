import { useState } from "react";
import type { PoolReturnsReport } from "@/server/research/pool-share-returns/schema";

export type WorkbenchView =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; report: PoolReturnsReport };

export function useWorkbenchState(network: string) {
  const [view, setView] = useState<WorkbenchView>({ status: "idle" });

  return { view, setView };
}
