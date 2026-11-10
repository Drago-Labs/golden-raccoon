import { CALL_TREE_LIMITS } from "./limits";
import type { RawDiagnosticEvent, RawInvocationMeta } from "./schema";

export function normalizeDiagnosticEvents(meta: RawInvocationMeta): {
  diagnosticsEnabled: boolean;
  events: RawDiagnosticEvent[];
  truncated: boolean;
} {
  if (!meta.diagnosticsEnabled || meta.events.length === 0) {
    return {
      diagnosticsEnabled: meta.diagnosticsEnabled,
      events: [],
      truncated: false,
    };
  }
  const truncated = meta.events.length > CALL_TREE_LIMITS.maxEvents;
  const events = meta.events.slice(0, CALL_TREE_LIMITS.maxEvents);
  return {
    diagnosticsEnabled: true,
    events,
    truncated,
  };
}
