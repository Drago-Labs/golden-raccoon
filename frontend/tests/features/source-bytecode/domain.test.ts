import { describe, expect, it } from "vitest";
import {
  compareVerifiedBytecode,
  decodeCborMetadata,
  maskImmutableReferences,
  stripCborMetadata,
} from "@/server/research/source-bytecode/service";

const ADDRESS = "0x1111111111111111111111111111111111111111";

function text(value: string): number[] {
  return [0x60 + value.length, ...Array.from(new TextEncoder().encode(value))];
}

function bytes(hex: string): number[] {
  const raw = hex.replace(/^0x/, "");
  const parts = raw.match(/../g)?.map((part) => Number.parseInt(part, 16)) ?? [];
  return [0x40 + parts.length, ...parts];
}

function metadataBytes(): Uint8Array {
  return Uint8Array.from([
    0xa4,
    ...text("solc"),
    ...text("0.8.20"),
    ...text("optimize"),
    0xf5,
    ...text("metadata"),
    ...bytes("abcd"),
    ...text("immutables"),
    0x81,
    0x82,
    0x02,
    0x02,
  ]);
}

function withMetadata(code: number[]): string {
  const metadata = metadataBytes();
  const length = metadata.length;
  const all = Uint8Array.from([...code, ...metadata, (length >> 8) & 0xff, length & 0xff]);
  return `0x${Array.from(all, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

const source = {
  matchType: "full" as const,
  compiler: "0.8.20",
  optimizer: true,
  metadataHash: "0xabcd",
  maskedRuntime: "0x0102000003",
  constructorArgs: "0x01",
  libraries: [{ name: "Lib", address: ADDRESS }],
};

describe("source bytecode comparison", () => {
  it("decodes compiler, optimizer, metadata hash, and immutable refs", () => {
    const stripped = stripCborMetadata(withMetadata([1, 2, 9, 9, 3]));
    expect(decodeCborMetadata(stripped.metadata)).toEqual({
      compiler: "0.8.20",
      optimizer: true,
      metadataHash: "0xabcd",
      immutableRefs: [{ start: 2, length: 2 }],
    });
  });

  it("masks immutable reference bytes before comparison", () => {
    const code = Uint8Array.from([1, 2, 9, 9, 3]);
    const masked = maskImmutableReferences(code, [{ start: 2, length: 2 }]);
    expect(Array.from(masked)).toEqual([1, 2, 0, 0, 3]);
    const report = compareVerifiedBytecode({
      address: ADDRESS,
      blockNumber: 10,
      bytecode: withMetadata([1, 2, 8, 7, 3]),
      source,
    });
    expect(report.bytecode.equalAfterMask).toBe(true);
    expect(report.status).toBe("full");
  });

  it("never reports a partial match as full", () => {
    const report = compareVerifiedBytecode({
      address: ADDRESS,
      blockNumber: 10,
      bytecode: withMetadata([1, 2, 9, 9, 3]),
      source: { ...source, matchType: "partial" },
    });
    expect(report.status).toBe("partial");
    expect(report.status).not.toBe("full");
  });

  it("reports unavailable when the verification source fails", () => {
    const report = compareVerifiedBytecode({
      address: ADDRESS,
      blockNumber: 10,
      bytecode: null,
      source: null,
      sourceFailed: true,
    });
    expect(report.status).toBe("unavailable");
  });

  it("reports unverified when no record exists", () => {
    const report = compareVerifiedBytecode({
      address: ADDRESS,
      blockNumber: 10,
      bytecode: withMetadata([1, 2, 0, 0, 3]),
      source: null,
    });
    expect(report.status).toBe("unverified");
  });

  it("reports mismatch when the compiler differs", () => {
    const report = compareVerifiedBytecode({
      address: ADDRESS,
      blockNumber: 10,
      bytecode: withMetadata([1, 2, 0, 0, 3]),
      source: { ...source, compiler: "0.8.19" },
    });
    expect(report.status).toBe("mismatch");
  });
});
