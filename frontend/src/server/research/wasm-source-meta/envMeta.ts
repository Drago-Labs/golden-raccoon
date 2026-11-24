import type { EnvMetadata, SpecMetadata } from "./schema";

function readU64Be(bytes: Uint8Array, offset: number): bigint {
  let value = 0n;
  for (let index = 0; index < 8; index += 1) {
    value = (value << 8n) | BigInt(bytes[offset + index] ?? 0);
  }
  return value;
}

function readU32Be(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
}

/**
 * Decode `contractenvmetav0` payload.
 * Encoding: [u32 kind=0][u64 interfaceVersion]
 */
export function parseEnvMeta(payload: Uint8Array | null): EnvMetadata {
  if (!payload || payload.length === 0) {
    return { interfaceVersion: null, sectionPresent: false };
  }
  if (payload.length < 12) {
    return { interfaceVersion: null, sectionPresent: true };
  }
  const version = readU64Be(payload, 4);
  return { interfaceVersion: version.toString(), sectionPresent: true };
}

/**
 * Decode `contractspecv0` payload presence / entry count.
 * Encoding: [u32 entryCount][opaque...]
 */
export function parseSpecMeta(payload: Uint8Array | null): SpecMetadata {
  if (!payload || payload.length === 0) {
    return { entryCount: null, sectionPresent: false };
  }
  if (payload.length < 4) {
    return { entryCount: null, sectionPresent: true };
  }
  return { entryCount: readU32Be(payload, 0), sectionPresent: true };
}
