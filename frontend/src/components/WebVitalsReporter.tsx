"use client";

import { useEffect } from "react";
import { observeWebVitals, type WebVitalMetric } from "@/lib/webVitals";

const budgetsByMetric: Record<WebVitalMetric["name"], number> = {
  LCP: 2500,
  INP: 200,
  FID: 100,
  CLS: 0.1,
  TTFB: 800,
};

function formatValue(metric: WebVitalMetric) {
  return metric.name === "CLS" ? metric.value.toFixed(3) : `${Math.round(metric.value)}ms`;
}

function logMetric(metric: WebVitalMetric) {
  const budget = budgetsByMetric[metric.name];
  const overBudget = metric.value > budget;
  const label = `[web-vitals] ${metric.name} = ${formatValue(metric)}`;

  if (overBudget) {
    console.warn(`${label} (over budget of ${metric.name === "CLS" ? budget : `${budget}ms`}). See docs/PERFORMANCE_BUDGETS.md.`);
  } else {
    console.info(label);
  }
}

/**
 * Beacon stub: intentionally a no-op unless NEXT_PUBLIC_WEB_VITALS_BEACON_URL
 * is set. Kept honest — it does not fabricate a delivery status if no
 * endpoint is configured, and it never sends wallet-identifying data.
 */
function sendBeacon(metric: WebVitalMetric) {
  const endpoint = process.env.NEXT_PUBLIC_WEB_VITALS_BEACON_URL;
  if (!endpoint || typeof navigator === "undefined" || typeof navigator.sendBeacon !== "function") return;

  const payload = JSON.stringify({
    name: metric.name,
    value: metric.value,
    id: metric.id,
    navigationType: metric.navigationType,
    path: typeof window !== "undefined" ? window.location.pathname : undefined,
  });

  navigator.sendBeacon(endpoint, payload);
}

/** Mounts once from the root layout to report Web Vitals for every page. */
export function WebVitalsReporter() {
  useEffect(() => {
    observeWebVitals((metric) => {
      if (process.env.NODE_ENV !== "production") {
        logMetric(metric);
      }

      sendBeacon(metric);
    });
  }, []);

  return null;
}
