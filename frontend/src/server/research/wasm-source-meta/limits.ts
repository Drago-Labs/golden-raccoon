export const WASM_SOURCE_META_LIMITS = {
  maxRequestBytes: 16384,
  maxWasmBytes: 2_000_000,
  maxCustomSections: 64,
  maxMetaEntries: 128,
  maxDeclaredSources: 32,
  timeoutMs: 30_000,
} as const;
