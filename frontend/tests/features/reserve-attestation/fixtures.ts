import type { RegistryEntryInput, ReportInput, ReserveRequest } from "@/server/research/reserve-attestation";

if (!window.localStorage) Object.defineProperty(window, "localStorage", { value: { clear() {} } });

export const HASH_A = "a".repeat(64);
export const HASH_B = "b".repeat(64);
export const HASH_C = "c".repeat(64);

export function registryEntry(overrides: Partial<RegistryEntryInput> = {}): RegistryEntryInput {
  return { assetCode: "USDX", issuer: "Example Issuer Ltd", permittedSourceLabels: [], ...overrides };
}

export function report(overrides: Partial<ReportInput> = {}): ReportInput {
  return {
    assetCode: "USDX",
    issuer: "Example Issuer Ltd",
    sourceType: "independent_attestation",
    sourceLabel: "Example Accounting Firm",
    reportingPeriodStart: "2026-01-01T00:00:00Z",
    reportingPeriodEnd: "2026-01-31T00:00:00Z",
    retrievedAt: "2026-02-05T00:00:00Z",
    documentUrl: "https://example.com/reports/jan-2026.pdf",
    documentHash: HASH_A,
    currency: "USD",
    claimedAssets: "1000000",
    claimedLiabilities: "1000000",
    ...overrides,
  };
}

export function baseRequest(overrides: Partial<ReserveRequest> = {}): ReserveRequest {
  return {
    windowStart: "2026-01-01T00:00:00Z",
    windowEnd: "2026-04-01T00:00:00Z",
    lateAfterSeconds: 2_592_000,
    registry: [registryEntry()],
    reports: [report()],
    ...overrides,
  };
}
