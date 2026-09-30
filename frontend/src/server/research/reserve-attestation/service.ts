import { analyseRegistryEntry, findUnregisteredReports } from "./analysis";
import { ReserveError, reserveRequestSchema, RESERVE_SCHEMA_VERSION, type ReserveReport } from "./schema";

export function analyseReserveAttestations(rawInput: unknown): ReserveReport {
  const parsed = reserveRequestSchema.safeParse(rawInput);
  if (!parsed.success) throw new ReserveError("invalid_request", "The request did not match the expected shape.", parsed.error.flatten());
  const input = parsed.data;

  if (Date.parse(input.windowEnd) < Date.parse(input.windowStart)) {
    throw new ReserveError("invalid_window", "windowEnd must not be before windowStart.");
  }

  const reportsInWindow = input.reports.filter((report) => {
    const end = Date.parse(report.reportingPeriodEnd);
    return end >= Date.parse(input.windowStart) && end <= Date.parse(input.windowEnd);
  });

  const assets = input.registry.map((entry) => analyseRegistryEntry(entry, reportsInWindow, input.lateAfterSeconds));
  const unregisteredReports = findUnregisteredReports(input.registry, reportsInWindow);

  return {
    schemaVersion: RESERVE_SCHEMA_VERSION,
    windowStart: input.windowStart,
    windowEnd: input.windowEnd,
    assets,
    unregisteredReports,
  };
}
