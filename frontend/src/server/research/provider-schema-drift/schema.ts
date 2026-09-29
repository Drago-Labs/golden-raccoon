/**
 * Versioned probe request/report contract.
 */
import { z } from "zod";
import type { DriftFinding } from "./compare";
import type { ProviderKind } from "./contracts";

export const DRIFT_SCHEMA_VERSION = "provider-schema-drift/2026-01" as const;

export const DRIFT_LIMITS = {
  maxProviders: 5,
  maxRequestBytes: 1_048_576,
  defaultTimeoutMs: 1_500,
} as const;

export type ProbeArtifact = {
  provider: ProviderKind;
  contractVersion: string;
  observedAt: string;
  redactedPayload: unknown;
  droppedKeys: string[];
  droppedWalletLike: number;
};

export type DriftReport = {
  schemaVersion: typeof DRIFT_SCHEMA_VERSION;
  observedAt: string;
  mode: "replay" | "live";
  findings: DriftFinding[];
  artifacts: ProbeArtifact[];
  summary: {
    breaking: number;
    additive: number;
    unavailable: number;
    inconclusive: number;
    unchanged: number;
    note: string;
  };
};

const probeSchema = z.object({
  provider: z.enum(["stellar", "evm", "market", "social", "news"]),
  available: z.boolean().default(true),
  flaky: z.boolean().default(false),
  baseline: z.record(z.string(), z.unknown()),
  observed: z.record(z.string(), z.unknown()).nullable().optional(),
});

export const driftRequestSchema = z.object({
  observedAt: z.string().datetime({ offset: true }),
  mode: z.enum(["replay", "live"]).default("replay"),
  probes: z.array(probeSchema).min(1).max(DRIFT_LIMITS.maxProviders),
});

export type DriftRequest = z.infer<typeof driftRequestSchema>;

export class DriftError extends Error {
  readonly code: string;
  readonly details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = "DriftError";
    this.code = code;
    this.details = details;
  }
}
