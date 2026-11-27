import { z } from "zod";
import type { ComparisonStatus, ReportState } from "./errors";

export const WASM_SOURCE_META_SCHEMA_VERSION = 1;

export const declaredSourceSchema = z.object({
  field: z.enum(["repository", "commit", "sdkVersion", "rustVersion", "buildTool"]),
  value: z.string().min(1),
  source: z.string().min(1),
});

export const wasmSourceMetaRequestSchema = z.object({
  contractId: z.string().min(1),
  network: z.enum(["stellar-testnet", "stellar-pubnet"]),
  declaredSources: z.array(declaredSourceSchema).optional(),
});

export type DeclaredSource = z.infer<typeof declaredSourceSchema>;
export type WasmSourceMetaRequest = z.infer<typeof wasmSourceMetaRequestSchema>;

export type MetaEntry = {
  key: string;
  value: string;
};

export type ExtractedMetadata = {
  repository: string | null;
  commit: string | null;
  sdkVersion: string | null;
  rustVersion: string | null;
  buildTool: string | null;
  entries: MetaEntry[];
  sectionPresent: boolean;
};

export type EnvMetadata = {
  interfaceVersion: string | null;
  sectionPresent: boolean;
};

export type SpecMetadata = {
  entryCount: number | null;
  sectionPresent: boolean;
};

export type ComparisonRow = {
  field: string;
  wasmValue: string | null;
  declaredValue: string | null;
  status: ComparisonStatus;
  referenceSource: string | null;
};

export type CompatibilityReport = {
  network: string;
  networkProtocol: string;
  wasmInterfaceVersion: string | null;
  sdkVersion: string | null;
  compatible: boolean | null;
  notes: string;
};

export type WasmSourceMetaReport = {
  schemaVersion: number;
  contractId: string;
  network: string;
  state: ReportState;
  wasmHash: string | null;
  metadata: ExtractedMetadata;
  envMeta: EnvMetadata;
  specMeta: SpecMetadata;
  comparisons: ComparisonRow[];
  compatibility: CompatibilityReport;
  coverageNotice: string;
  readOnly: boolean;
};
