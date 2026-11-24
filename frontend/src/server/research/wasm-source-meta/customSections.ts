import { WasmSourceMetaError } from "./errors";
import { WASM_SOURCE_META_LIMITS } from "./limits";

export type CustomSection = {
  name: string;
  payload: Uint8Array;
};

function readLeb128(bytes: Uint8Array, offset: number): { value: number; offset: number } {
  let result = 0;
  let shift = 0;
  let cursor = offset;
  while (cursor < bytes.length) {
    const byte = bytes[cursor];
    cursor += 1;
    result |= (byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) {
      return { value: result >>> 0, offset: cursor };
    }
    shift += 7;
    if (shift > 35) {
      throw new WasmSourceMetaError("invalid_request", "LEB128 value is too large.");
    }
  }
  throw new WasmSourceMetaError("invalid_request", "Wasm ended while reading LEB128.");
}

/**
 * Parse Wasm custom sections by name. Does not instantiate or execute the module.
 */
export function parseCustomSections(wasm: Uint8Array): CustomSection[] {
  if (wasm.length < 8) {
    throw new WasmSourceMetaError("invalid_request", "Wasm bytes are too short.");
  }
  if (wasm[0] !== 0x00 || wasm[1] !== 0x61 || wasm[2] !== 0x73 || wasm[3] !== 0x6d) {
    throw new WasmSourceMetaError("invalid_request", "Bytes are not a Wasm module.");
  }
  if (wasm[4] !== 0x01 || wasm[5] !== 0x00 || wasm[6] !== 0x00 || wasm[7] !== 0x00) {
    throw new WasmSourceMetaError("invalid_request", "Unsupported Wasm version.");
  }

  const sections: CustomSection[] = [];
  let offset = 8;

  while (offset < wasm.length) {
    const id = wasm[offset];
    offset += 1;
    const size = readLeb128(wasm, offset);
    offset = size.offset;
    const end = offset + size.value;
    if (end > wasm.length) {
      throw new WasmSourceMetaError("invalid_request", "Wasm section overflows module.");
    }

    if (id === 0) {
      if (sections.length >= WASM_SOURCE_META_LIMITS.maxCustomSections) {
        throw new WasmSourceMetaError("response_too_large", "Too many custom sections.");
      }
      const nameLen = readLeb128(wasm, offset);
      const nameBytes = wasm.slice(nameLen.offset, nameLen.offset + nameLen.value);
      const name = new TextDecoder().decode(nameBytes);
      const payloadStart = nameLen.offset + nameLen.value;
      sections.push({ name, payload: wasm.slice(payloadStart, end) });
    }

    offset = end;
  }

  return sections;
}

export function findSection(sections: CustomSection[], name: string): CustomSection | null {
  return sections.find((section) => section.name === name) ?? null;
}
