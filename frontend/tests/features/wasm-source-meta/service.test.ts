import { describe, expect, it } from "vitest";
import { WasmSourceMetaError } from "@/server/research/wasm-source-meta/errors";
import { inspectWasmSourceMeta } from "@/server/research/wasm-source-meta/service";
import matchingMetaJson from "./data/matching-meta.json";
import conflictingMetaJson from "./data/conflicting-meta.json";
import noMetaJson from "./data/no-meta.json";
import providerUnavailableJson from "./data/provider-unavailable.json";
import {
  CONFLICTING_CONTRACT,
  MATCHING_CONTRACT,
  NO_META_CONTRACT,
  conflictingMetaWasm,
  matchingMetaWasm,
  noMetaWasm,
} from "./fixtures";

describe("service", () => {
  it("validates request schema", async () => {
    await expect(inspectWasmSourceMeta({})).rejects.toThrow(WasmSourceMetaError);
  });

  it("rejects invalid contract IDs", async () => {
    await expect(
      inspectWasmSourceMeta({ contractId: "GABC", network: "stellar-testnet" }),
    ).rejects.toThrow(WasmSourceMetaError);
  });

  it("returns agreement for matching fixture Wasm", async () => {
    const report = await inspectWasmSourceMeta(
      { contractId: MATCHING_CONTRACT, network: "stellar-testnet" },
      {
        fetchWasm: async () => ({
          status: "available",
          wasm: matchingMetaWasm,
          wasmHash: matchingMetaJson.wasmHash as string,
        }),
      },
    );
    expect(report.state).toMatch(/complete|partial/);
    expect(report.metadata.repository).toBe(matchingMetaJson.metadata.repository);
    expect(report.comparisons.some((row) => row.status === "agreement")).toBe(true);
    expect(report.comparisons.find((row) => row.field === "repository")?.referenceSource).toBeTruthy();
  });

  it("returns conflicts for conflicting fixture Wasm", async () => {
    const report = await inspectWasmSourceMeta(
      { contractId: CONFLICTING_CONTRACT, network: "stellar-testnet" },
      {
        fetchWasm: async () => ({
          status: "available",
          wasm: conflictingMetaWasm,
          wasmHash: conflictingMetaJson.wasmHash as string,
        }),
      },
    );
    expect(report.state).toBe("partial");
    expect(report.comparisons.some((row) => row.status === "conflict")).toBe(true);
  });

  it("reports absent metadata without treating it as a mismatch", async () => {
    const report = await inspectWasmSourceMeta(
      {
        contractId: NO_META_CONTRACT,
        network: "stellar-testnet",
        declaredSources: [
          {
            field: "repository",
            value: "https://github.com/example/published",
            source: "README",
          },
        ],
      },
      {
        fetchWasm: async () => ({
          status: "available",
          wasm: noMetaWasm,
          wasmHash: noMetaJson.wasmHash as string,
        }),
      },
    );
    expect(report.metadata.sectionPresent).toBe(false);
    expect(report.comparisons.every((row) => row.status !== "conflict" || row.wasmValue !== null)).toBe(true);
    expect(report.comparisons.find((row) => row.field === "repository")?.status).toBe("absent");
    expect(report.coverageNotice).toContain("absent");
  });

  it("returns unavailable when the provider fails", async () => {
    const report = await inspectWasmSourceMeta(
      { contractId: MATCHING_CONTRACT, network: "stellar-testnet" },
      {
        fetchWasm: async () => ({
          status: "unavailable",
          reason: "Provider is currently unavailable.",
        }),
      },
    );
    expect(report.state).toBe("unavailable");
    expect(report.coverageNotice).toContain(providerUnavailableJson.state);
  });
});
