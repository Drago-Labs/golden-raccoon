"use client";

import { RefreshCw, WifiOff } from "lucide-react";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

export function OfflineBanner() {
  const { isOffline, refreshRequired, refresh } = useOnlineStatus();

  if (!isOffline && !refreshRequired) return null;

  return (
    <div className="border-b border-amber-300/25 bg-amber-300/12 px-5 py-3 text-amber-50">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <WifiOff className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <div className="font-semibold">{isOffline ? "Offline read-only mode" : "Refresh required"}</div>
            <div className="text-amber-50/72">
              {isOffline
                ? "Only the last captured scans and portfolio snapshots are available. All scan, execute, approve, pay, and rule controls are disabled."
                : "Connectivity returned, but actions remain disabled until this page reloads fresh data."}
            </div>
          </div>
        </div>
        {!isOffline ? (
          <button
            type="button"
            data-offline-allow
            onClick={refresh}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-amber-200 px-4 text-sm font-semibold text-black"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh now
          </button>
        ) : null}
      </div>
    </div>
  );
}
