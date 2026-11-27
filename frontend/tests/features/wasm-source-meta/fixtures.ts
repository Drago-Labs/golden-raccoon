import type { WasmSourceMetaReport } from "@/server/research/wasm-source-meta/schema";

export const MATCHING_CONTRACT = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
export const CONFLICTING_CONTRACT = "CBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";
export const NO_META_CONTRACT = "CDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD";

function encodeLeb128(value: number): number[] {
  const bytes: number[] = [];
  let remaining = value >>> 0;
  do {
    let byte = remaining & 0x7f;
    remaining >>>= 7;
    if (remaining !== 0) byte |= 0x80;
    bytes.push(byte);
  } while (remaining !== 0);
  return bytes;
}

function encodeU32Be(value: number): number[] {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}

function encodeU64Be(value: bigint): number[] {
  const bytes: number[] = [];
  let remaining = value;
  for (let index = 0; index < 8; index += 1) {
    bytes.unshift(Number(remaining & 0xffn));
    remaining >>= 8n;
  }
  return bytes;
}

function encodeString(value: string): number[] {
  const encoded = Array.from(new TextEncoder().encode(value));
  return [...encodeU32Be(encoded.length), ...encoded];
}

export function encodeMetaPayload(entries: Record<string, string>): Uint8Array {
  const pairs = Object.entries(entries);
  const body: number[] = [...encodeU32Be(pairs.length)];
  for (const [key, value] of pairs) {
    body.push(...encodeString(key), ...encodeString(value));
  }
  return Uint8Array.from(body);
}

export function encodeEnvPayload(interfaceVersion: bigint): Uint8Array {
  return Uint8Array.from([...encodeU32Be(0), ...encodeU64Be(interfaceVersion)]);
}

export function encodeSpecPayload(entryCount: number): Uint8Array {
  return Uint8Array.from(encodeU32Be(entryCount));
}

function customSection(name: string, payload: Uint8Array): number[] {
  const nameBytes = Array.from(new TextEncoder().encode(name));
  const content = [...encodeLeb128(nameBytes.length), ...nameBytes, ...payload];
  return [0, ...encodeLeb128(content.length), ...content];
}

/** Minimal Wasm module with optional named custom sections (never executed). */
export function buildWasm(sections: Array<{ name: string; payload: Uint8Array }>): Uint8Array {
  const bytes: number[] = [0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00];
  for (const section of sections) {
    bytes.push(...customSection(section.name, section.payload));
  }
  return Uint8Array.from(bytes);
}

export const matchingMetaWasm = buildWasm([
  {
    name: "contractmetav0",
    payload: encodeMetaPayload({
      repo: "https://github.com/example/matching-contract",
      commit: "abc123def456",
      rssdkver: "22.0.0",
      rsver: "1.84.0",
      build: "soroban-cli",
    }),
  },
  { name: "contractenvmetav0", payload: encodeEnvPayload(23n) },
  { name: "contractspecv0", payload: encodeSpecPayload(3) },
]);

export const conflictingMetaWasm = buildWasm([
  {
    name: "contractmetav0",
    payload: encodeMetaPayload({
      repo: "https://github.com/example/deployed-repo",
      commit: "deployed-commit-111",
      rssdkver: "22.1.0",
    }),
  },
  { name: "contractenvmetav0", payload: encodeEnvPayload(22n) },
  { name: "contractspecv0", payload: encodeSpecPayload(1) },
]);

export const noMetaWasm = buildWasm([]);

export const matchingReport: WasmSourceMetaReport = {
  schemaVersion: 1,
  contractId: MATCHING_CONTRACT,
  network: "stellar-testnet",
  state: "complete",
  wasmHash: "matching-hash",
  metadata: {
    repository: "https://github.com/example/matching-contract",
    commit: "abc123def456",
    sdkVersion: "22.0.0",
    rustVersion: "1.84.0",
    buildTool: "soroban-cli",
    entries: [
      { key: "repo", value: "https://github.com/example/matching-contract" },
      { key: "commit", value: "abc123def456" },
      { key: "rssdkver", value: "22.0.0" },
      { key: "rsver", value: "1.84.0" },
      { key: "build", value: "soroban-cli" },
    ],
    sectionPresent: true,
  },
  envMeta: { interfaceVersion: "23", sectionPresent: true },
  specMeta: { entryCount: 3, sectionPresent: true },
  comparisons: [],
  compatibility: {
    network: "stellar-testnet",
    networkProtocol: "23",
    wasmInterfaceVersion: "23",
    sdkVersion: "22.0.0",
    compatible: true,
    notes: "Wasm interface version 23 aligns with network protocol 23.",
  },
  coverageNotice: "Complete metadata read",
  readOnly: true,
};
