"use client";

import { useEffect } from "react";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

const blockedSelector = [
  "button",
  "input",
  "select",
  "textarea",
  "summary",
  "a[href^='/api']",
  "[data-state-changing]",
].join(",");

export function OfflineInteractionGuard() {
  const { actionsDisabled } = useOnlineStatus();

  useEffect(() => {
    document.documentElement.dataset.offlineLocked = actionsDisabled ? "true" : "false";

    const block = (event: Event) => {
      if (!actionsDisabled) return;
      const target = event.target instanceof Element ? event.target.closest(blockedSelector) : null;
      if (!target || target.closest("[data-offline-allow]")) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    };

    document.addEventListener("click", block, true);
    document.addEventListener("submit", block, true);

    return () => {
      document.removeEventListener("click", block, true);
      document.removeEventListener("submit", block, true);
    };
  }, [actionsDisabled]);

  return null;
}
