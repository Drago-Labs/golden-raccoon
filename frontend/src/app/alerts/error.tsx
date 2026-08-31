"use client";

import { ErrorRecoveryPanel } from "@/components/ErrorRecoveryPanel";
import type { BoundaryError } from "@/lib/errors/boundaryCategory";

export default function AlertsError({
  error,
  reset,
}: {
  error: BoundaryError;
  reset: () => void;
}) {
  return <ErrorRecoveryPanel error={error} reset={reset} route="/alerts" />;
}
