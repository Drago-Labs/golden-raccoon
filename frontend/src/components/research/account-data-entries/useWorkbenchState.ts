"use client";

import { useEffect, useRef, useState } from "react";
import type { DataEntryReport } from "@/server/research/account-data-entries/schema";

export type WorkbenchView =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; report: DataEntryReport };

export function useWorkbenchState(network: string) {
  const [view, setView] = useState<WorkbenchView>({ status: "idle" });
  const previousNetwork = useRef(network);

  useEffect(() => {
    if (previousNetwork.current === network) return;
    previousNetwork.current = network;
    setView({ status: "idle" });
  }, [network]);

  return { view, setView };
}
