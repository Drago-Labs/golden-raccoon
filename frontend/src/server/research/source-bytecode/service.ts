export type MatchStatus = "full" | "partial" | "mismatch" | "unverified" | "unavailable";

export class SourceBytecodeError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "SourceBytecodeError";
    this.code = code;
  }
}

export type ImmutableRef = { start: number; length: number };

export type DecodedMetadata = {
  compiler: string | null;
  optimizer: boolean | null;
  metadataHash: string | null;
  immutableRefs: ImmutableRef[];
};

export type VerificationSource =
  | { unavailable: true }
  | {
      unavailable?: false;
      matchType: "full" | "partial" | null;
      compiler: string | null;
      optimizer: boolean | null;
      metadataHash: string | null;
      constructorArgs?: string | null;
      libraries?: { name: string; address: string }[];
      maskedRuntime?: string | null;
    };

export type SourceBytecodeReport = {
  address: string;
  blockNumber: number;
  status: MatchStatus;
  explanation: string;
  metadata: DecodedMetadata | null;
  bytecode: { masked: boolean; equalAfterMask: boolean | null };
  constructorArgs: string | null;
  libraries: { name: string; address: string }[];
  coverage: string;
};

const ADDRESS = /^0x[a-fA-F0-9]{40}$/;

function hexToBytes(hex: string): Uint8Array {
  const normalized = hex.replace(/^0x/, "");
  if (normalized.length % 2 !== 0 || /[^0-9a-fA-F]/.test(normalized)) {
    throw new SourceBytecodeError("invalid_bytecode", "Bytecode hex could not be read.");
  }
  const bytes = new Uint8Array(normalized.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(normalized.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

export function stripCborMetadata(bytecodeHex: string): { code: Uint8Array; metadata: Uint8Array | null } {
  const bytes = hexToBytes(bytecodeHex);
  if (bytes.length < 4) {
    return { code: bytes, metadata: null };
  }
  const length = (bytes[bytes.length - 2] << 8) | bytes[bytes.length - 1];
  if (length < 2 || length + 2 >= bytes.length) {
    return { code: bytes, metadata: null };
  }
  return {
    code: bytes.slice(0, bytes.length - length - 2),
    metadata: bytes.slice(bytes.length - length - 2, bytes.length - 2),
  };
}

function readCbor(bytes: Uint8Array, offset: number): { value: unknown; offset: number } {
  const initial = bytes[offset];
  if (initial === undefined) {
    throw new SourceBytecodeError("invalid_metadata", "CBOR metadata ended early.");
  }
  const major = initial >> 5;
  const additional = initial & 0x1f;
  let cursor = offset + 1;
  let argument = additional;
  if (additional > 23) {
    const width = additional === 24 ? 1 : additional === 25 ? 2 : 0;
    if (width === 0) {
      throw new SourceBytecodeError("invalid_metadata", "Unsupported CBOR length.");
    }
    argument = 0;
    for (let index = 0; index < width; index += 1) {
      argument = (argument << 8) | (bytes[cursor + index] ?? 0);
    }
    cursor += width;
  }

  if (major === 0) {
    return { value: argument, offset: cursor };
  }
  if (major === 2 || major === 3) {
    const slice = bytes.slice(cursor, cursor + argument);
    cursor += argument;
    const value = major === 3 ? new TextDecoder().decode(slice) : bytesToHex(slice);
    return { value, offset: cursor };
  }
  if (major === 4) {
    const items: unknown[] = [];
    for (let index = 0; index < argument; index += 1) {
      const next = readCbor(bytes, cursor);
      items.push(next.value);
      cursor = next.offset;
    }
    return { value: items, offset: cursor };
  }
  if (major === 5) {
    const map: Record<string, unknown> = {};
    for (let index = 0; index < argument; index += 1) {
      const key = readCbor(bytes, cursor);
      const value = readCbor(bytes, key.offset);
      map[String(key.value)] = value.value;
      cursor = value.offset;
    }
    return { value: map, offset: cursor };
  }
  if (major === 7 && additional === 20) return { value: false, offset: cursor };
  if (major === 7 && additional === 21) return { value: true, offset: cursor };
  throw new SourceBytecodeError("invalid_metadata", "Unsupported CBOR value.");
}

export function decodeCborMetadata(metadata: Uint8Array | null): DecodedMetadata | null {
  if (!metadata || metadata.length === 0) {
    return null;
  }
  const decoded = readCbor(metadata, 0).value;
  if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) {
    return null;
  }
  const map = decoded as Record<string, unknown>;
  const refs = Array.isArray(map.immutables)
    ? map.immutables.flatMap((entry) => {
        if (!Array.isArray(entry) || entry.length < 2) return [];
        return [{ start: Number(entry[0]), length: Number(entry[1]) }];
      })
    : [];
  return {
    compiler: typeof map.solc === "string" ? map.solc : null,
    optimizer: typeof map.optimize === "boolean" ? map.optimize : null,
    metadataHash: typeof map.metadata === "string" ? map.metadata : null,
    immutableRefs: refs,
  };
}

export function maskImmutableReferences(code: Uint8Array, refs: ImmutableRef[]): Uint8Array {
  const masked = new Uint8Array(code);
  for (const ref of refs) {
    for (let index = ref.start; index < ref.start + ref.length && index < masked.length; index += 1) {
      masked[index] = 0;
    }
  }
  return masked;
}

const EXPLANATIONS: Record<MatchStatus, string> = {
  full: "Compiler, optimizer, metadata hash, and masked runtime bytecode all match a full verification.",
  partial: "The verification source reports a partial match. A partial match is not a full match.",
  mismatch: "Decoded metadata or masked bytecode differs from the published verification.",
  unverified: "No verification record was published for this address.",
  unavailable: "The verification source could not be read. This is not the same as unverified.",
};

export function compareVerifiedBytecode(input: {
  address: string;
  blockNumber: number;
  bytecode: string | null;
  source: VerificationSource | null;
  sourceFailed?: boolean;
}): SourceBytecodeReport {
  if (!ADDRESS.test(input.address)) {
    throw new SourceBytecodeError("invalid_address", "Address must be a 20-byte hex value.");
  }
  if (!Number.isInteger(input.blockNumber) || input.blockNumber < 0) {
    throw new SourceBytecodeError("invalid_block", "Block number must be a non-negative integer.");
  }

  const base = {
    address: input.address,
    blockNumber: input.blockNumber,
    constructorArgs: null as string | null,
    libraries: [] as { name: string; address: string }[],
    coverage: "Compared at one pinned block. This does not compile source and does not prove proxy safety.",
  };

  if (input.sourceFailed || input.source?.unavailable) {
    return {
      ...base,
      status: "unavailable",
      explanation: EXPLANATIONS.unavailable,
      metadata: null,
      bytecode: { masked: false, equalAfterMask: null },
    };
  }
  if (!input.source || input.source.matchType === null) {
    return {
      ...base,
      status: "unverified",
      explanation: EXPLANATIONS.unverified,
      metadata: null,
      bytecode: { masked: false, equalAfterMask: null },
    };
  }

  const stripped = input.bytecode ? stripCborMetadata(input.bytecode) : { code: new Uint8Array(), metadata: null };
  const metadata = decodeCborMetadata(stripped.metadata);
  const refs = metadata?.immutableRefs ?? [];
  const maskedCode = maskImmutableReferences(stripped.code, refs);
  const maskedHex = bytesToHex(maskedCode);
  const equalAfterMask = input.source.maskedRuntime ? maskedHex === input.source.maskedRuntime.toLowerCase() : false;
  const settingsMatch =
    metadata?.compiler === input.source.compiler &&
    metadata?.optimizer === input.source.optimizer &&
    metadata?.metadataHash === input.source.metadataHash;

  let status: MatchStatus = "mismatch";
  if (input.source.matchType === "partial") {
    status = "partial";
  } else if (input.source.matchType === "full" && settingsMatch && equalAfterMask) {
    status = "full";
  }

  return {
    ...base,
    status,
    explanation: EXPLANATIONS[status],
    metadata,
      bytecode: { masked: refs.length > 0, equalAfterMask },
    constructorArgs: input.source.constructorArgs ?? null,
    libraries: input.source.libraries ?? [],
  };
}
