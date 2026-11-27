import { compareMetadata } from "./comparison";
import { assessCompatibility } from "./compatibility";
import { validateContractInput } from "./contractInput";
import { coverageNotice } from "./coverage";
import { findSection, parseCustomSections } from "./customSections";
import { parseEnvMeta, parseSpecMeta } from "./envMeta";
import { WasmSourceMetaError } from "./errors";
import { parseContractMeta } from "./metaParser";
import {
  WASM_SOURCE_META_SCHEMA_VERSION,
  wasmSourceMetaRequestSchema,
  type WasmSourceMetaReport,
} from "./schema";
import { resolveSourceReferences } from "./sourceReferences";
import { fetchContractWasm, type WasmFetcher } from "./wasmFetch";

export type WasmSourceMetaDeps = {
  fetchWasm: WasmFetcher;
};

const productionDeps: WasmSourceMetaDeps = {
  fetchWasm: fetchContractWasm,
};

function unavailableReport(
  contractId: string,
  network: string,
  reason: string,
): WasmSourceMetaReport {
  const metadata = {
    repository: null,
    commit: null,
    sdkVersion: null,
    rustVersion: null,
    buildTool: null,
    entries: [],
    sectionPresent: false,
  };
  const envMeta = { interfaceVersion: null, sectionPresent: false };
  const comparisons = compareMetadata(metadata, []);
  return {
    schemaVersion: WASM_SOURCE_META_SCHEMA_VERSION,
    contractId,
    network,
    state: "unavailable",
    wasmHash: null,
    metadata,
    envMeta,
    specMeta: { entryCount: null, sectionPresent: false },
    comparisons,
    compatibility: assessCompatibility(network, envMeta, metadata),
    coverageNotice: `Wasm metadata unavailable: ${reason}`,
    readOnly: true,
  };
}

export async function inspectWasmSourceMeta(
  input: unknown,
  deps: WasmSourceMetaDeps = productionDeps,
): Promise<WasmSourceMetaReport> {
  const parsed = wasmSourceMetaRequestSchema.safeParse(input);
  if (!parsed.success) {
    throw new WasmSourceMetaError("invalid_request", "The request is invalid.", parsed.error.flatten());
  }

  const request = validateContractInput(parsed.data);
  const { contractId, network, declaredSources } = request;

  const wasmResult = await deps.fetchWasm(network, contractId);

  if (wasmResult.status === "unavailable") {
    return unavailableReport(contractId, network, wasmResult.reason);
  }
  if (wasmResult.status === "not_found") {
    throw new WasmSourceMetaError("not_found", wasmResult.reason);
  }

  const sections = parseCustomSections(wasmResult.wasm);
  const metaSection = findSection(sections, "contractmetav0");
  const envSection = findSection(sections, "contractenvmetav0");
  const specSection = findSection(sections, "contractspecv0");

  const metadata = parseContractMeta(metaSection?.payload ?? null);
  const envMeta = parseEnvMeta(envSection?.payload ?? null);
  const specMeta = parseSpecMeta(specSection?.payload ?? null);
  const references = resolveSourceReferences(contractId, declaredSources);
  const comparisons = compareMetadata(metadata, references);
  const compatibility = assessCompatibility(network, envMeta, metadata);

  const hasAnySection = metadata.sectionPresent || envMeta.sectionPresent || specMeta.sectionPresent;
  const hasConflict = comparisons.some((row) => row.status === "conflict");
  const state =
    !hasAnySection || (!metadata.sectionPresent && references.length > 0) || hasConflict
      ? "partial"
      : "complete";

  return {
    schemaVersion: WASM_SOURCE_META_SCHEMA_VERSION,
    contractId,
    network,
    state,
    wasmHash: wasmResult.wasmHash,
    metadata,
    envMeta,
    specMeta,
    comparisons,
    compatibility,
    coverageNotice: coverageNotice(state, metadata, comparisons),
    readOnly: true,
  };
}
