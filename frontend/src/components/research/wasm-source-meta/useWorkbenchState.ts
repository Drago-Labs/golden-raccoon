import { useState } from "react";
import type { WasmSourceMetaReport } from "@/server/research/wasm-source-meta/schema";

export type WorkbenchView =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; report: WasmSourceMetaReport };

export function useWorkbenchState(_network: string) {
  const [view, setView] = useState<WorkbenchView>({ status: "idle" });
  return { view, setView };
}
