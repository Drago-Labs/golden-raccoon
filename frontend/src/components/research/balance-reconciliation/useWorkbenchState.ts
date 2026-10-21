"use client";

import { useEffect, useRef, useState } from "react";
import type { BalanceReport } from "@/server/research/balance-reconciliation/schema";

export type WorkbenchView =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; report: BalanceReport };

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
