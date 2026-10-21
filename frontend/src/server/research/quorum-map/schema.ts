import { z } from "zod";
import type { QuorumState } from "./errors";
import type { StellarNetwork } from "./networkIdentity";

export type { StellarNetwork };

export const QUORUM_SCHEMA_VERSION = "quorum-map/2026-01" as const;

export const quorumRequestSchema = z.object({
  network: z.enum(["stellar-testnet", "stellar-pubnet"]),
});

export type QuorumRequest = z.infer<typeof quorumRequestSchema>;

export type QuorumSetNode = {
  threshold: number;
  validators: string[];
  innerSets: QuorumSetNode[];
};

export type SourceRecord = {
  name: string;
  fetchedAt: string | null;
  ageSeconds: number | null;
  stale: boolean;
  unavailable: boolean;
};

export type TomlDisagreement = {
  publicKey: string;
  field: "home_domain" | "missing_toml" | "missing_node";
  nodeValue: string | null;
  tomlValue: string | null;
};

export type OrganizationDependency = {
  organization: string;
  topLevelCount: number;
  removalBreaks: number;
};

export type QuorumReport = {
  schemaVersion: typeof QUORUM_SCHEMA_VERSION;
  network: StellarNetwork;
  state: QuorumState;
  organizations: OrganizationDependency[];
  unresolvedKeys: string[];
  disagreements: TomlDisagreement[];
  quorumSets: Array<{ owner: string; set: QuorumSetNode }>;
  sources: SourceRecord[];
  coverageNotice: string;
  provesSafety: false;
  readOnly: true;
};
