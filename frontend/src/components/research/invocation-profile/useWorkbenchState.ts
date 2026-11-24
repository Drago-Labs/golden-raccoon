import { useState } from "react";
import type { InvocationProfileReport } from "@/server/research/invocation-profile/schema";

export type WorkbenchView =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; report: InvocationProfileReport };

export function useWorkbenchState(_network?: string) {
  const [view, setView] = useState<WorkbenchView>({ status: "idle" });
  return { view, setView };
}
