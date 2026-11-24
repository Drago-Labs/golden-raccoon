import { WASM_SOURCE_META_LIMITS } from "./limits";
import type { ExtractedMetadata, MetaEntry } from "./schema";

function readU32Be(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
}

/**
 * Decode `contractmetav0` payload.
 *
 * Fixture / research encoding (length-prefixed, big-endian):
 *   [u32 count]
 *   repeated: [u32 keyLen][key][u32 valLen][val]
 *
 * Known Soroban keys are mapped onto structured fields when present.
 */
export function parseContractMeta(payload: Uint8Array | null): ExtractedMetadata {
  if (!payload || payload.length === 0) {
    return {
      repository: null,
      commit: null,
      sdkVersion: null,
      rustVersion: null,
      buildTool: null,
      entries: [],
      sectionPresent: false,
    };
  }

  if (payload.length < 4) {
    return emptyPresent();
  }

  const count = readU32Be(payload, 0);
  if (count > WASM_SOURCE_META_LIMITS.maxMetaEntries) {
    return emptyPresent();
  }

  const entries: MetaEntry[] = [];
  let offset = 4;
  for (let index = 0; index < count; index += 1) {
    if (offset + 4 > payload.length) break;
    const keyLen = readU32Be(payload, offset);
    offset += 4;
    if (offset + keyLen + 4 > payload.length) break;
    const key = new TextDecoder().decode(payload.slice(offset, offset + keyLen));
    offset += keyLen;
    const valLen = readU32Be(payload, offset);
    offset += 4;
    if (offset + valLen > payload.length) break;
    const value = new TextDecoder().decode(payload.slice(offset, offset + valLen));
    offset += valLen;
    entries.push({ key, value });
  }

  return {
    repository: pick(entries, ["repo", "repository", "source_repo"]),
    commit: pick(entries, ["commit", "git_commit", "rev"]),
    sdkVersion: pick(entries, ["rssdkver", "sdk", "sdk_version"]),
    rustVersion: pick(entries, ["rsver", "rust", "rust_version"]),
    buildTool: pick(entries, ["build", "build_tool", "tool"]),
    entries,
    sectionPresent: true,
  };
}

function emptyPresent(): ExtractedMetadata {
  return {
    repository: null,
    commit: null,
    sdkVersion: null,
    rustVersion: null,
    buildTool: null,
    entries: [],
    sectionPresent: true,
  };
}

function pick(entries: MetaEntry[], keys: string[]): string | null {
  for (const key of keys) {
    const match = entries.find((entry) => entry.key.toLowerCase() === key.toLowerCase());
    if (match) return match.value;
  }
  return null;
}
