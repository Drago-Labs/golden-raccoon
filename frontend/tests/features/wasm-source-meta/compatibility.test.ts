import { describe, expect, it } from "vitest";
import { assessCompatibility } from "@/server/research/wasm-source-meta/compatibility";
import type { ExtractedMetadata } from "@/server/research/wasm-source-meta/schema";

const meta = (sdkVersion: string | null): ExtractedMetadata => ({
  repository: null,
  commit: null,
  sdkVersion,
  rustVersion: null,
  buildTool: null,
  entries: [],
  sectionPresent: sdkVersion !== null,
});

describe("compatibility", () => {
  it("marks matching interface version as compatible", () => {
    const report = assessCompatibility(
      "stellar-testnet",
      { interfaceVersion: "23", sectionPresent: true },
      meta("22.0.0"),
    );
    expect(report.compatible).toBe(true);
    expect(report.networkProtocol).toBe("23");
  });

  it("marks mismatched interface version as incompatible", () => {
    const report = assessCompatibility(
      "stellar-pubnet",
      { interfaceVersion: "99", sectionPresent: true },
      meta(null),
    );
    expect(report.compatible).toBe(false);
  });

  it("returns unknown when no env or SDK metadata exists", () => {
    const report = assessCompatibility(
      "stellar-testnet",
      { interfaceVersion: null, sectionPresent: false },
      meta(null),
    );
    expect(report.compatible).toBeNull();
  });
});
