import { useState } from "react";
import type { CounterpartyFlowReport } from "@/server/research/counterparty-flows/schema";

export type WorkbenchView =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; report: CounterpartyFlowReport };

export function useWorkbenchState(_network: string) {
  const [view, setView] = useState<WorkbenchView>({ status: "idle" });
  return { view, setView };
}
