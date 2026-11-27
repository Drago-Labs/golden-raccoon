import { describe, expect, it } from "vitest";
import { compareMetadata } from "@/server/research/wasm-source-meta/comparison";
import type { ExtractedMetadata } from "@/server/research/wasm-source-meta/schema";

const baseMeta: ExtractedMetadata = {
  repository: "https://github.com/example/matching-contract",
  commit: "abc123def456",
  sdkVersion: "22.0.0",
  rustVersion: "1.84.0",
  buildTool: "soroban-cli",
  entries: [],
  sectionPresent: true,
};

describe("comparison", () => {
  it("reports agreement when values match and cites the reference source", () => {
    const rows = compareMetadata(baseMeta, [
      {
        field: "repository",
        value: "https://github.com/example/matching-contract",
        source: "README",
      },
      {
        field: "commit",
        value: "abc123def456",
        source: "release-notes",
      },
    ]);

    const repo = rows.find((row) => row.field === "repository");
    expect(repo?.status).toBe("agreement");
    expect(repo?.referenceSource).toBe("README");
    expect(rows.find((row) => row.field === "commit")?.status).toBe("agreement");
  });

  it("reports conflict when values differ", () => {
    const rows = compareMetadata(baseMeta, [
      {
        field: "sdkVersion",
        value: "21.0.0",
        source: "README",
      },
    ]);
    const sdk = rows.find((row) => row.field === "sdkVersion");
    expect(sdk?.status).toBe("conflict");
    expect(sdk?.referenceSource).toBe("README");
  });

  it("reports absent when metadata is missing, not mismatch", () => {
    const empty: ExtractedMetadata = {
      repository: null,
      commit: null,
      sdkVersion: null,
      rustVersion: null,
      buildTool: null,
      entries: [],
      sectionPresent: false,
    };
    const rows = compareMetadata(empty, [
      {
        field: "repository",
        value: "https://github.com/example/published",
        source: "configured-source-list",
      },
    ]);
    const repo = rows.find((row) => row.field === "repository");
    expect(repo?.status).toBe("absent");
    expect(repo?.referenceSource).toBe("configured-source-list");
  });
});
