"use client";

import { useState } from "react";
import type { ClmmPositionsReport } from "@/server/research/clmm-positions/schema";

export type WorkbenchView =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; report: ClmmPositionsReport };

export function useWorkbenchState() {
  const [view, setView] = useState<WorkbenchView>({ status: "idle" });
  return { view, setView };
}
